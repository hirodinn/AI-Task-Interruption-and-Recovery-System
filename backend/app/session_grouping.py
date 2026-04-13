from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from sqlmodel import Session, col, select

from .models import Project, WorkSession
from .settings import settings


def get_or_create_project(
    db: Session, *, root_path: str, name: str | None
) -> Project:
    existing = db.exec(select(Project).where(Project.root_path == root_path)).first()
    if existing:
        if name and existing.name != name:
            existing.name = name
            db.add(existing)
            db.commit()
            db.refresh(existing)
        return existing

    project = Project(name=name or root_path.split("/")[-1] or root_path, root_path=root_path)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def assign_session_id(
    db: Session, *, project_id: UUID, ts: datetime
) -> WorkSession:
    gap = timedelta(minutes=settings.session_gap_minutes)
    window_start = ts - gap

    latest = (
        db.exec(
            select(WorkSession)
            .where(WorkSession.project_id == project_id)
            .where(col(WorkSession.ended_at) >= window_start)
            .order_by(WorkSession.ended_at.desc())
            .limit(1)
        ).first()
    )
    if latest:
        if ts > latest.ended_at:
            latest.ended_at = ts
            db.add(latest)
            db.commit()
            db.refresh(latest)
        return latest

    session = WorkSession(project_id=project_id, started_at=ts, ended_at=ts)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

