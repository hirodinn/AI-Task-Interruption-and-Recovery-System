from __future__ import annotations

from datetime import timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, func, select, delete

from .db import get_session
from .models import ActivityEvent, Project, WorkSession
from .schemas import (
    BulkEventsIn,
    ClearSessionsOut,
    EventIn,
    EventOut,
    ProjectOut,
    ProjectPatchIn,
    ProjectCreateIn,
    ResumeBundleOut,
    SessionOut,
    SessionPatchIn,
)
from .session_grouping import assign_session_id, get_or_create_project
from .ai.prompting import build_session_prompt
from .ai.providers import AiRateLimitError, AiUpstreamError, get_provider


router = APIRouter(prefix="/api")

@router.get("/health")
def health():
    return {"ok": True}


@router.post("/events", response_model=EventOut)
def ingest_event(payload: EventIn, db: Session = Depends(get_session)):
    ts = payload.ts
    if ts.tzinfo is not None:
        ts = ts.astimezone(timezone.utc).replace(tzinfo=None)

    project = get_or_create_project(
        db, root_path=payload.project_root_path, name=payload.project_name
    )
    session = assign_session_id(db, project_id=project.id, ts=ts)

    event = ActivityEvent(
        project_id=project.id,
        session_id=session.id,
        ts=ts,
        event_type=payload.event_type,
        file_path=payload.file_path,
        git_commit_hash=payload.git_commit_hash,
        git_branch=payload.git_branch,
        event_metadata=payload.event_metadata,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return EventOut.model_validate(event)


from sqlalchemy.exc import IntegrityError

@router.post("/events/bulk", response_model=list[EventOut])
def ingest_events_bulk(payload: BulkEventsIn, db: Session = Depends(get_session)):
    if not payload.events:
        return []

    out_events: list[ActivityEvent] = []
    for ev in payload.events:
        ts = ev.ts
        if ts.tzinfo is not None:
            ts = ts.astimezone(timezone.utc).replace(tzinfo=None)

        project = get_or_create_project(db, root_path=ev.project_root_path, name=ev.project_name)
        session = assign_session_id(db, project_id=project.id, ts=ts)

        event = ActivityEvent(
            project_id=project.id,
            session_id=session.id,
            ts=ts,
            event_type=ev.event_type,
            file_path=ev.file_path,
            git_commit_hash=ev.git_commit_hash,
            git_branch=ev.git_branch,
            event_metadata=ev.event_metadata,
        )
        db.add(event)
        out_events.append(event)

    # One commit per batch for speed.
    try:
        db.commit()
    except IntegrityError:
        # A concurrent delete might have removed the project/session
        db.rollback()
        return []
        
    return [EventOut.model_validate(e) for e in out_events]


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(project_id: UUID | None = None, db: Session = Depends(get_session)):
    base = select(WorkSession)
    if project_id:
        base = base.where(WorkSession.project_id == project_id)

    sessions = db.exec(base.order_by(WorkSession.ended_at.desc()).limit(100)).all()
    if not sessions:
        return []

    session_ids = [s.id for s in sessions]
    counts = db.exec(
        select(ActivityEvent.session_id, func.count(ActivityEvent.id))
        .where(ActivityEvent.session_id.in_(session_ids))
        .group_by(ActivityEvent.session_id)
    ).all()
    count_map = {sid: c for sid, c in counts}

    return [
        SessionOut(
            id=s.id,
            project_id=s.project_id,
            started_at=s.started_at,
            ended_at=s.ended_at,
            objective=s.objective,
            ai_summary_markdown=s.ai_summary_markdown,
            ai_summary_json=s.ai_summary_json,
            ai_suggested_next_steps=s.ai_suggested_next_steps,
            event_count=int(count_map.get(s.id, 0)),
        )
        for s in sessions
    ]


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_session)):
    projects = db.exec(select(Project).order_by(Project.created_at.desc()).limit(200)).all()
    return [ProjectOut.model_validate(p) for p in projects]


@router.post("/projects", response_model=ProjectOut)
def create_project(payload: ProjectCreateIn, db: Session = Depends(get_session)):
    project = get_or_create_project(db, root_path=payload.root_path, name=payload.name)
    return ProjectOut.model_validate(project)


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def patch_project(project_id: UUID, payload: ProjectPatchIn, db: Session = Depends(get_session)):
    project_obj = db.get(Project, project_id)
    if not project_obj:
        raise HTTPException(status_code=404, detail="Project not found")

    if payload.name is not None:
        v = payload.name.strip()
        project_obj.name = v if v else project_obj.name

    db.add(project_obj)
    db.commit()
    db.refresh(project_obj)
    return ProjectOut.model_validate(project_obj)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: UUID, db: Session = Depends(get_session)):
    project_obj = db.get(Project, project_id)
    if not project_obj:
        raise HTTPException(status_code=404, detail="Project not found")

    db.execute(delete(ActivityEvent).where(ActivityEvent.project_id == project_obj.id).execution_options(synchronize_session=False))
    db.execute(delete(WorkSession).where(WorkSession.project_id == project_obj.id).execution_options(synchronize_session=False))
    
    db.delete(project_obj)
    db.commit()
    return Response(status_code=204)

@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session_detail(session_id: UUID, db: Session = Depends(get_session)):
    session_obj = db.get(WorkSession, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    count = db.exec(
        select(func.count(ActivityEvent.id)).where(ActivityEvent.session_id == session_id)
    ).one()
    return SessionOut(
        id=session_obj.id,
        project_id=session_obj.project_id,
        started_at=session_obj.started_at,
        ended_at=session_obj.ended_at,
        objective=session_obj.objective,
        ai_summary_markdown=session_obj.ai_summary_markdown,
        ai_summary_json=session_obj.ai_summary_json,
        ai_suggested_next_steps=session_obj.ai_suggested_next_steps,
        event_count=int(count),
    )


@router.patch("/sessions/{session_id}", response_model=SessionOut)
def patch_session(session_id: UUID, payload: SessionPatchIn, db: Session = Depends(get_session)):
    session_obj = db.get(WorkSession, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    if payload.objective is not None:
        # Treat blank as unset
        v = payload.objective.strip()
        session_obj.objective = v if v else None

    db.add(session_obj)
    db.commit()
    db.refresh(session_obj)

    count = db.exec(
        select(func.count(ActivityEvent.id)).where(ActivityEvent.session_id == session_id)
    ).one()
    return SessionOut(
        id=session_obj.id,
        project_id=session_obj.project_id,
        started_at=session_obj.started_at,
        ended_at=session_obj.ended_at,
        objective=session_obj.objective,
        ai_summary_markdown=session_obj.ai_summary_markdown,
        ai_summary_json=session_obj.ai_summary_json,
        ai_suggested_next_steps=session_obj.ai_suggested_next_steps,
        event_count=int(count),
    )


@router.get("/sessions/{session_id}/events", response_model=list[EventOut])
def list_session_events(session_id: UUID, db: Session = Depends(get_session)):
    session_obj = db.get(WorkSession, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    events = db.exec(
        select(ActivityEvent)
        .where(ActivityEvent.session_id == session_id)
        .order_by(ActivityEvent.ts.asc())
    ).all()
    return [EventOut.model_validate(e) for e in events]


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: UUID, db: Session = Depends(get_session)):
    session_obj = db.get(WorkSession, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    db.execute(delete(ActivityEvent).where(ActivityEvent.session_id == session_id).execution_options(synchronize_session=False))
    db.delete(session_obj)
    db.commit()
    return Response(status_code=204)


@router.delete("/sessions", response_model=ClearSessionsOut)
def clear_sessions(project_id: UUID | None = None, db: Session = Depends(get_session)):
    q = select(WorkSession)
    if project_id:
        q = q.where(WorkSession.project_id == project_id)
    sessions = db.exec(q).all()
    if not sessions:
        return ClearSessionsOut(deleted_sessions=0, deleted_events=0)

    session_ids = [s.id for s in sessions]
    
    events_query = delete(ActivityEvent).where(ActivityEvent.session_id.in_(session_ids)).execution_options(synchronize_session=False)
    sessions_query = delete(WorkSession).where(WorkSession.id.in_(session_ids)).execution_options(synchronize_session=False)
    
    num_events = db.exec(select(func.count(ActivityEvent.id)).where(ActivityEvent.session_id.in_(session_ids))).one()
    
    db.execute(events_query)
    db.execute(sessions_query)
    
    # Remove sessions from identity map manually by clearing session cache or flushing
    for s in sessions:
        db.expunge(s)
        
    db.commit()

    return ClearSessionsOut(
        deleted_sessions=len(sessions),
        deleted_events=int(num_events),
    )


@router.get("/sessions/{session_id}/resume", response_model=ResumeBundleOut)
def get_resume_bundle(session_id: UUID, db: Session = Depends(get_session)):
    session_obj = db.get(WorkSession, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    events = db.exec(
        select(ActivityEvent)
        .where(ActivityEvent.session_id == session_id)
        .order_by(ActivityEvent.ts.asc())
    ).all()

    # Compute a compact digest for UI / clipboard.
    file_counts: dict[str, int] = {}
    commits: list[str] = []
    for e in events:
        if e.file_path:
            file_counts[e.file_path] = file_counts.get(e.file_path, 0) + 1
        if e.git_commit_hash:
            commits.append(e.git_commit_hash)

    recent_files = [p for p, _ in sorted(file_counts.items(), key=lambda kv: kv[1], reverse=True)][:15]
    git_commits = list(dict.fromkeys(commits))[-10:]  # unique, keep last few

    count = len(events)
    session_out = SessionOut(
        id=session_obj.id,
        project_id=session_obj.project_id,
        started_at=session_obj.started_at,
        ended_at=session_obj.ended_at,
        objective=session_obj.objective,
        ai_summary_markdown=session_obj.ai_summary_markdown,
        ai_summary_json=session_obj.ai_summary_json,
        ai_suggested_next_steps=session_obj.ai_suggested_next_steps,
        event_count=int(count),
    )

    return ResumeBundleOut(
        session=session_out,
        events=[EventOut.model_validate(e) for e in events],
        recent_files=recent_files,
        git_commits=git_commits,
    )


@router.post("/sessions/{session_id}/summarize", response_model=SessionOut)
async def summarize_session(session_id: UUID, db: Session = Depends(get_session)):
    session_obj = db.get(WorkSession, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    project = db.get(Project, session_obj.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    events = db.exec(
        select(ActivityEvent)
        .where(ActivityEvent.session_id == session_id)
        .order_by(ActivityEvent.ts.asc())
    ).all()

    prompt = build_session_prompt(
        session=session_obj,
        events=events,
        project_root_path=project.root_path,
        project_name=project.name,
    )
    provider = get_provider()
    try:
        result = await provider.summarize_session(prompt=prompt)
    except AiRateLimitError as e:
        raise HTTPException(
            status_code=429,
            detail=str(e),
            headers={"Retry-After": str(e.retry_after_seconds)}
            if e.retry_after_seconds is not None
            else None,
        )
    except AiUpstreamError as e:
        raise HTTPException(status_code=503, detail=str(e))

    session_obj.objective = result.objective
    session_obj.ai_summary_markdown = result.summary_markdown
    session_obj.ai_summary_json = result.summary_json
    session_obj.ai_suggested_next_steps = result.suggested_next_steps
    db.add(session_obj)
    db.commit()
    db.refresh(session_obj)

    count = len(events)
    return SessionOut(
        id=session_obj.id,
        project_id=session_obj.project_id,
        started_at=session_obj.started_at,
        ended_at=session_obj.ended_at,
        objective=session_obj.objective,
        ai_summary_markdown=session_obj.ai_summary_markdown,
        ai_summary_json=session_obj.ai_summary_json,
        ai_suggested_next_steps=session_obj.ai_suggested_next_steps,
        event_count=int(count),
    )


@router.post("/sessions/summarize_missing", response_model=list[SessionOut])
async def summarize_missing_sessions(
    project_id: UUID | None = None,
    limit: int = 10,
    db: Session = Depends(get_session),
):
    """
    Summarize recent sessions that don't have ai_summary_markdown yet.
    """
    limit = max(1, min(int(limit), 50))
    q = select(WorkSession).where(WorkSession.ai_summary_markdown.is_(None))
    if project_id:
        q = q.where(WorkSession.project_id == project_id)
    sessions = db.exec(q.order_by(WorkSession.ended_at.desc()).limit(limit)).all()
    if not sessions:
        return []

    provider = get_provider()
    out: list[SessionOut] = []

    for s in sessions:
        project = db.get(Project, s.project_id)
        if not project:
            continue
        events = db.exec(
            select(ActivityEvent)
            .where(ActivityEvent.session_id == s.id)
            .order_by(ActivityEvent.ts.asc())
        ).all()
        prompt = build_session_prompt(
            session=s,
            events=events,
            project_root_path=project.root_path,
            project_name=project.name,
        )
        try:
            result = await provider.summarize_session(prompt=prompt)
        except AiRateLimitError as e:
            # Stop early and return what we have; client can retry later.
            return out
        except AiUpstreamError:
            # Skip this session on transient upstream errors.
            continue

        s.objective = result.objective
        s.ai_summary_markdown = result.summary_markdown
        s.ai_summary_json = result.summary_json
        s.ai_suggested_next_steps = result.suggested_next_steps
        db.add(s)
        db.commit()
        db.refresh(s)

        out.append(
            SessionOut(
                id=s.id,
                project_id=s.project_id,
                started_at=s.started_at,
                ended_at=s.ended_at,
                objective=s.objective,
                ai_summary_markdown=s.ai_summary_markdown,
                ai_summary_json=s.ai_summary_json,
                ai_suggested_next_steps=s.ai_suggested_next_steps,
                event_count=len(events),
            )
        )

    return out

