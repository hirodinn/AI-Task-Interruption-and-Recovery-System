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
    file_rollup: dict[str, dict[str, Any]] = {}
    git_events: list[dict[str, Any]] = []

    for e in events:
        ts = _fmt_ts(e.ts)
        timeline.append(
            {
                "ts": ts,
                "type": e.event_type,
                "file_path": e.file_path,
                "git_commit_hash": e.git_commit_hash,
                "git_branch": e.git_branch,
                "event_metadata": e.event_metadata,
            }
        )

        if e.file_path:
            slot = file_rollup.setdefault(
                e.file_path,
                {
                    "touch_count": 0,
                    "event_types": {},
                    "first_seen": ts,
                    "last_seen": ts,
                    "last_branch": None,
                    "last_commit": None,
                },
            )
            slot["touch_count"] += 1
            et = str(e.event_type)
            slot["event_types"][et] = slot["event_types"].get(et, 0) + 1
            slot["last_seen"] = ts
            if e.git_branch:
                slot["last_branch"] = e.git_branch
            if e.git_commit_hash:
                slot["last_commit"] = e.git_commit_hash

        if e.event_type.startswith("git_"):
            git_events.append(
                {
                    "ts": ts,
                    "type": e.event_type,
                    "branch": e.git_branch,
                    "commit": e.git_commit_hash,
                    "event_metadata": e.event_metadata,
                }
            )

    file_rollup_list = [
        {
            "file_path": p,
            "touch_count": v["touch_count"],
            "event_types": v["event_types"],
            "first_seen": v["first_seen"],
            "last_seen": v["last_seen"],
            "last_branch": v["last_branch"],
            "last_commit": v["last_commit"],
        }
        for p, v in sorted(
            file_rollup.items(),
            key=lambda kv: int(kv[1]["touch_count"]),
            reverse=True,
        )
    ]

    return (
        "Summarize the following coding session so a developer can resume after an interruption.\n"
        "Return a JSON object ONLY.\n\n"
        f"Project: {project_name}\n"
        f"Root: {project_root_path}\n"
        f"Session started: {_fmt_ts(session.started_at)}\n"
        f"Session ended: {_fmt_ts(session.ended_at)}\n"
        f"Event count: {len(events)}\n\n"
        "File activity rollup (most touched first):\n"
        f"{file_rollup_list}\n\n"
        "Git-only events:\n"
        f"{git_events}\n\n"
        "Timeline events (in order):\n"
        f"{timeline}\n\n"
        "Constraints:\n"
        "- Be specific and action-oriented.\n"
        "- Infer objective from changes; if unclear, say it's unclear.\n"
        "- Explain changed files in detail, not just high-level summary.\n"
        "- For each significant changed file, describe: likely change intent, what to inspect next, and verification step.\n"
        "- If path suggests config/build/runtime impact, call out risk explicitly.\n"
        "- Suggested next steps should be immediately executable and ordered.\n"
        "- Keep summary concise but concrete; avoid generic wording.\n\n"
        "Output contract (JSON keys):\n"
        "- objective: string|null\n"
        "- summary_markdown: string\n"
        "- suggested_next_steps: string[]\n"
        "- key_files: string[] (important file paths in priority order)\n"
        "- file_details: [{\"file_path\": string, \"what_changed\": string, \"why_it_matters\": string, \"recommended_check\": string}]\n"
        "- risks_or_unknowns: string[]\n\n"
        "In summary_markdown include sections exactly named:\n"
        "1) Session objective\n"
        "2) What changed\n"
        "3) Changed files in detail\n"
        "4) Risks / unknowns\n"
        "5) Immediate next steps\n"
    )

