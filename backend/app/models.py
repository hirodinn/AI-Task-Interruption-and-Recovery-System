from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


class Project(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str
    root_path: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())


class WorkSession(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(index=True, foreign_key="project.id")

    started_at: datetime = Field(index=True)
    ended_at: datetime = Field(index=True)

    objective: str | None = None

    ai_summary_markdown: str | None = None
    ai_summary_json: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSON)
    )
    ai_suggested_next_steps: list[str] | None = Field(
        default=None, sa_column=Column(JSON)
    )


class ActivityEvent(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(index=True, foreign_key="project.id")
    session_id: UUID = Field(index=True, foreign_key="worksession.id")

    ts: datetime = Field(index=True)
    event_type: str = Field(index=True)  # "file_modified" | "git_commit" | ...

    file_path: str | None = Field(default=None, index=True)
    git_commit_hash: str | None = Field(default=None, index=True)
    git_branch: str | None = Field(default=None, index=True)

    event_metadata: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))

