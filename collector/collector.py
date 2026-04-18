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
    debounce_seconds: float


def read_config() -> Config:
    load_dotenv()
    backend_url = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
    project_root = Path(os.environ["PROJECT_ROOT"]).expanduser().resolve()
    project_name = os.environ.get("PROJECT_NAME") or None
    poll_git_seconds = int(os.environ.get("POLL_GIT_SECONDS", "10"))
    debounce_seconds = float(os.environ.get("DEBOUNCE_SECONDS", "1"))
    return Config(
        backend_url=backend_url,
        project_root=project_root,
        project_name=project_name,
        poll_git_seconds=poll_git_seconds,
        debounce_seconds=debounce_seconds,
    )


def post_event(cfg: Config, payload: dict[str, Any]) -> None:
    url = f"{cfg.backend_url}/api/events"
    resp = requests.post(url, json=payload, timeout=10)
    resp.raise_for_status()

def post_events_bulk(cfg: Config, events: list[dict[str, Any]]) -> None:
    url = f"{cfg.backend_url}/api/events/bulk"
    resp = requests.post(url, json={"events": events}, timeout=15)
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
        self._last_sent: dict[str, float] = {}
        self._pending: list[dict[str, Any]] = []
        self._last_flush = 0.0

    def _is_ignored(self, path: Path) -> bool:
        s = str(path)
        # Skip noisy directories.
        if "/.git/" in s or "/node_modules/" in s or "/dist/" in s or "/build/" in s:
            return True

        name = path.name
        # Skip common editor/temp artifacts.
        if name.startswith(".goutputstream-"):
            return True
        if name.endswith((".pyc", ".swp", ".tmp", ".temp", "~")):
            return True
        if name.startswith(".~lock"):
            return True

        return False

    def _queue_file_event(self, path: Path, *, kind: str) -> None:
        if self._is_ignored(path):
            return

        now = time.time()
        key = str(path)
        last = self._last_sent.get(key, 0.0)
        if now - last < max(0.0, self.cfg.debounce_seconds):
            return
        self._last_sent[key] = now

        payload = {
            "project_root_path": str(self.cfg.project_root),
            "project_name": self.cfg.project_name,
            "ts": utc_now_iso(),
            "event_type": "file_modified",
            "file_path": str(path),
            "event_metadata": {"kind": kind},
        }
        self._pending.append(payload)
        if now - self._last_flush > 1.0 and len(self._pending) >= 10:
            self._last_flush = now
            self.flush()

    def flush(self) -> None:
        if not self._pending:
            return
        batch = self._pending[:]
        self._pending.clear()
        try:
            post_events_bulk(self.cfg, batch)
        except Exception:
            # best-effort
            pass

    def on_modified(self, event):
        if event.is_directory:
            return
        self._queue_file_event(Path(event.src_path), kind="fs_modified")

    def on_created(self, event):
        if event.is_directory:
            return
        self._queue_file_event(Path(event.src_path), kind="fs_created")

    def on_moved(self, event):
        if event.is_directory:
            return
        # Atomic save workflows often write temp file then rename to target path.
        self._queue_file_event(Path(event.dest_path), kind="fs_moved")


def main() -> None:
    cfg = read_config()
    if not cfg.project_root.exists():
        raise SystemExit(f"PROJECT_ROOT does not exist: {cfg.project_root}")

    handler = Handler(cfg)
    observer = Observer()
    observer.schedule(handler, str(cfg.project_root), recursive=True)
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
                        handler._pending.append(payload)
                        handler.flush()
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
                        handler._pending.append(payload)
                        handler.flush()
                    except Exception:
                        pass
                    last_branch = branch

            handler.flush()
            time.sleep(max(1, cfg.poll_git_seconds))
    finally:
        handler.flush()
        observer.stop()
        observer.join()


if __name__ == "__main__":
    main()

