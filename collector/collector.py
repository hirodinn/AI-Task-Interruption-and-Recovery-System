from __future__ import annotations

import os
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class Config:
    backend_url: str
    project_root: Path
    project_name: str | None
    poll_git_seconds: int


def read_config() -> Config:
    load_dotenv()
    backend_url = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
    project_root = Path(os.environ["PROJECT_ROOT"]).expanduser().resolve()
    project_name = os.environ.get("PROJECT_NAME") or None
    poll_git_seconds = int(os.environ.get("POLL_GIT_SECONDS", "10"))
    return Config(
        backend_url=backend_url,
        project_root=project_root,
        project_name=project_name,
        poll_git_seconds=poll_git_seconds,
    )


def post_event(cfg: Config, payload: dict[str, Any]) -> None:
    url = f"{cfg.backend_url}/api/events"
    resp = requests.post(url, json=payload, timeout=10)
    resp.raise_for_status()


def git(cmd: list[str], *, cwd: Path) -> str:
    out = subprocess.check_output(cmd, cwd=str(cwd), stderr=subprocess.DEVNULL)
    return out.decode("utf-8", errors="replace").strip()


def is_git_repo(cwd: Path) -> bool:
    try:
        _ = git(["git", "rev-parse", "--git-dir"], cwd=cwd)
        return True
    except Exception:
        return False


def get_branch(cwd: Path) -> str | None:
    try:
        b = git(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=cwd)
        return b if b and b != "HEAD" else None
    except Exception:
        return None


def get_head_commit(cwd: Path) -> str | None:
    try:
        h = git(["git", "rev-parse", "HEAD"], cwd=cwd)
        return h or None
    except Exception:
        return None


class Handler(FileSystemEventHandler):
    def __init__(self, cfg: Config):
        self.cfg = cfg

    def on_modified(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        # Skip noisy files
        if "/.git/" in str(path):
            return
        if path.name.endswith((".pyc", ".swp")):
            return

        payload = {
            "project_root_path": str(self.cfg.project_root),
            "project_name": self.cfg.project_name,
            "ts": utc_now_iso(),
            "event_type": "file_modified",
            "file_path": str(path),
            "event_metadata": {"kind": "fs_modified"},
        }
        try:
            post_event(self.cfg, payload)
        except Exception:
            # Best-effort; collector should not crash on network errors.
            pass


def main() -> None:
    cfg = read_config()
    if not cfg.project_root.exists():
        raise SystemExit(f"PROJECT_ROOT does not exist: {cfg.project_root}")

    observer = Observer()
    observer.schedule(Handler(cfg), str(cfg.project_root), recursive=True)
    observer.start()

    last_head: str | None = None
    last_branch: str | None = None

    try:
        while True:
            if is_git_repo(cfg.project_root):
                head = get_head_commit(cfg.project_root)
                branch = get_branch(cfg.project_root)
                if head and head != last_head:
                    payload = {
                        "project_root_path": str(cfg.project_root),
                        "project_name": cfg.project_name,
                        "ts": utc_now_iso(),
                        "event_type": "git_head_changed",
                        "git_commit_hash": head,
                        "git_branch": branch,
                        "event_metadata": {"previous_head": last_head},
                    }
                    try:
                        post_event(cfg, payload)
                    except Exception:
                        pass
                    last_head = head
                if branch and branch != last_branch:
                    payload = {
                        "project_root_path": str(cfg.project_root),
                        "project_name": cfg.project_name,
                        "ts": utc_now_iso(),
                        "event_type": "git_branch_changed",
                        "git_branch": branch,
                        "event_metadata": {"previous_branch": last_branch},
                    }
                    try:
                        post_event(cfg, payload)
                    except Exception:
                        pass
                    last_branch = branch

            time.sleep(max(1, cfg.poll_git_seconds))
    finally:
        observer.stop()
        observer.join()


if __name__ == "__main__":
    main()

