#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
COLLECTOR_DIR="$ROOT_DIR/collector"
FRONTEND_DIR="$ROOT_DIR/frontend"

: "${BACKEND_URL:=http://127.0.0.1:8000}"
: "${PROJECT_ROOT:=$ROOT_DIR}"

export BACKEND_URL
export PROJECT_ROOT

for command_name in python3 npm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

pids=()

start_service() {
  local name="$1"
  local working_dir="$2"
  shift 2

  echo "Starting $name..."
  (
    cd "$working_dir"
    exec "$@"
  ) &
  pids+=("$!")
}

stop_services() {
  local exit_code="${1:-0}"

  trap - INT TERM

  for pid in "${pids[@]:-}"; do
    kill -- "-$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  done

  wait 2>/dev/null || true
  exit "$exit_code"
}

trap 'stop_services 130' INT TERM

start_service "backend" "$BACKEND_DIR" python3 -m uvicorn app.main:app --reload --port 8000
start_service "collector" "$COLLECTOR_DIR" python3 collector.py
start_service "frontend" "$FRONTEND_DIR" npm run dev -- --host 127.0.0.1 --port 5173

echo "All services are running."
echo "Backend:   http://127.0.0.1:8000"
echo "Frontend:  http://127.0.0.1:5173"
echo "Collector: watching $PROJECT_ROOT"

while true; do
  wait -n
  stop_services "$?"
done