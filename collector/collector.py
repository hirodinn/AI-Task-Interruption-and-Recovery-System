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
    poll_git_seconds: int
    debounce_seconds: float


def read_config() -> Config:
    load_dotenv()
    backend_url = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
    poll_git_seconds = int(os.environ.get("POLL_GIT_SECONDS", "10"))
    debounce_seconds = float(os.environ.get("DEBOUNCE_SECONDS", "1"))
    return Config(
        backend_url=backend_url,
        poll_git_seconds=poll_git_seconds,
        debounce_seconds=debounce_seconds,
    )


def fetch_projects(cfg: Config) -> list[dict[str, Any]]:
    try:
        url = f"{cfg.backend_url}/api/projects"
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Failed to fetch projects: {e}")
        return []

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
    def __init__(self, cfg: Config, project_root: str, project_name: str | None):
        self.cfg = cfg
        self.project_root_str = project_root
        self.project_name = project_name
        self._last_sent: dict[str, float] = {}
        self._pending: list[dict[str, Any]] = []
        self._last_flush = 0.0

    def _is_ignored(self, path: Path) -> bool:
        s = str(path)
        if "/.git/" in s or "/node_modules/" in s or "/dist/" in s or "/build/" in s:
            return True
        name = path.name
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
            "project_root_path": self.project_root_str,
            "project_name": self.project_name,
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
            pass

    def on_modified(self, event):
        if event.is_directory: return
        self._queue_file_event(Path(event.src_path), kind="fs_modified")

    def on_created(self, event):
        if event.is_directory: return
        self._queue_file_event(Path(event.src_path), kind="fs_created")

    def on_moved(self, event):
        if event.is_directory: return
        self._queue_file_event(Path(event.dest_path), kind="fs_moved")


class ProjectManager:
    def __init__(self, cfg: Config, observer: Observer):
        self.cfg = cfg
        self.observer = observer
        self.handlers: dict[str, Handler] = {}
        self.watches = {}
        self.git_states = {}

    def sync_projects(self, projects: list[dict[str, Any]]):
        active_ids = {p["id"] for p in projects}
        current_ids = set(self.handlers.keys())
        
        # Remove deleted projects
        for pid in current_ids - active_ids:
            if pid in self.watches:
                self.observer.unschedule(self.watches[pid])
                del self.watches[pid]
            del self.handlers[pid]
            if pid in self.git_states:
                del self.git_states[pid]
        
        # Add new projects
        for p in projects:
            pid = p["id"]
            root_path = p["root_path"]
            if pid not in self.handlers and Path(root_path).exists():
                h = Handler(self.cfg, project_root=root_path, project_name=p["name"])
                self.handlers[pid] = h
                
                try:
                    w = self.observer.schedule(h, root_path, recursive=True)
                    self.watches[pid] = w
                except Exception as e:
                    print(f"Failed to watch {root_path}: {e}")
                
                root_p = Path(root_path)
                if is_git_repo(root_p):
                    self.git_states[pid] = {
                        "head": get_head_commit(root_p),
                        "branch": get_branch(root_p)
                    }
                else:
                    self.git_states[pid] = {"head": None, "branch": None}
                    
    def poll_git_and_flush(self):
        for pid, h in self.handlers.items():
            root_p = Path(h.project_root_str)
            if pid in self.git_states and is_git_repo(root_p):
                head = get_head_commit(root_p)
                branch = get_branch(root_p)
                last_head = self.git_states[pid]["head"]
                last_branch = self.git_states[pid]["branch"]
                
                if head and head != last_head:
                    payload = {
                        "project_root_path": h.project_root_str,
                        "project_name": h.project_name,
                        "ts": utc_now_iso(),
                        "event_type": "git_head_changed",
                        "git_commit_hash": head,
                        "git_branch": branch,
                        "event_metadata": {"previous_head": last_head},
                    }
                    try:
                        h._pending.append(payload)
                        h.flush()
                    except Exception:
                        pass
                    self.git_states[pid]["head"] = head
                    
                if branch and branch != last_branch:
                    payload = {
                        "project_root_path": h.project_root_str,
                        "project_name": h.project_name,
                        "ts": utc_now_iso(),
                        "event_type": "git_branch_changed",
                        "git_branch": branch,
                        "event_metadata": {"previous_branch": last_branch},
                    }
                    try:
                        h._pending.append(payload)
                        h.flush()
                    except Exception:
                        pass
                    self.git_states[pid]["branch"] = branch

            h.flush()


def main() -> None:
    cfg = read_config()
    observer = Observer()
    observer.start()
    
    manager = ProjectManager(cfg, observer)
    last_sync = 0.0

    try:
        while True:
            now = time.time()
            if now - last_sync > 5.0:
                projects = fetch_projects(cfg)
                manager.sync_projects(projects)
                last_sync = now
                
            manager.poll_git_and_flush()
            time.sleep(max(1, cfg.poll_git_seconds))
    finally:
        for h in manager.handlers.values():
            h.flush()
        observer.stop()
        observer.join()


if __name__ == "__main__":
    main()
