from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from pydantic import ConfigDict


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    root_path: str
    created_at: datetime


class EventIn(BaseModel):
    project_root_path: str = Field(..., examples=["/home/me/my-repo"])
    project_name: str | None = None

    ts: datetime
    event_type: str

    file_path: str | None = None
    git_commit_hash: str | None = None
    git_branch: str | None = None

    event_metadata: dict[str, Any] | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    session_id: UUID
    ts: datetime
    event_type: str
    file_path: str | None
    git_commit_hash: str | None
    git_branch: str | None
    event_metadata: dict[str, Any] | None


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    started_at: datetime
    ended_at: datetime
    objective: str | None
    ai_summary_markdown: str | None
    ai_summary_json: dict[str, Any] | None
    ai_suggested_next_steps: list[str] | None
    event_count: int

