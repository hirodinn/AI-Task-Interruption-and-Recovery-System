from __future__ import annotations

from datetime import timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from .db import get_session
from .models import ActivityEvent, Project, WorkSession
from .schemas import EventIn, EventOut, ProjectOut, SessionOut
from .session_grouping import assign_session_id, get_or_create_project
from .ai.prompting import build_session_prompt
from .ai.providers import get_provider


router = APIRouter(prefix="/api")


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
    result = await provider.summarize_session(prompt=prompt)

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

