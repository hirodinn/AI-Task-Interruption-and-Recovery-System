from __future__ import annotations

from datetime import datetime
from typing import Any

from ..models import ActivityEvent, WorkSession


def _fmt_ts(ts: datetime) -> str:
    return ts.isoformat(timespec="seconds") + "Z"


def build_session_prompt(
    *,
    session: WorkSession,
    events: list[ActivityEvent],
    project_root_path: str,
    project_name: str,
) -> str:
    """
    Output format: JSON object with keys:
      - objective: string|null
      - summary_markdown: string (human readable)
      - suggested_next_steps: string[]
      - key_files: string[] (optional)
      - risks_or_unknowns: string[] (optional)
    """

    timeline: list[dict[str, Any]] = []
    for e in events:
        timeline.append(
            {
                "ts": _fmt_ts(e.ts),
                "type": e.event_type,
                "file_path": e.file_path,
                "git_commit_hash": e.git_commit_hash,
                "git_branch": e.git_branch,
                "event_metadata": e.event_metadata,
            }
        )

    return (
        "Summarize the following coding session so a developer can resume after an interruption.\n"
        "Return a JSON object ONLY.\n\n"
        f"Project: {project_name}\n"
        f"Root: {project_root_path}\n"
        f"Session started: {_fmt_ts(session.started_at)}\n"
        f"Session ended: {_fmt_ts(session.ended_at)}\n"
        f"Event count: {len(events)}\n\n"
        "Timeline events (in order):\n"
        f"{timeline}\n\n"
        "Constraints:\n"
        "- Be specific and action-oriented.\n"
        "- Infer objective from changes; if unclear, say it's unclear.\n"
        "- Suggested next steps should be immediately executable and ordered.\n"
    )

