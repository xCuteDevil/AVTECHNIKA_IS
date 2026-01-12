#!/bin/zsh
set -euo pipefail

# Determine project root (this script is expected in scripts/)
SCRIPT_DIR="${0:A:h}"
ROOT="${SCRIPT_DIR:h}"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
VITE_DEV_HTTPS="${VITE_DEV_HTTPS:-true}"
FRONTEND_API_BASE="${FRONTEND_API_BASE:-/api}"

mkdir -p "$ROOT/logs" "$ROOT/.pids"

kill_port() {
  local port="$1"
  local pids
  pids=$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "${pids:-}" ]]; then
    echo "Killing processes on port $port: $pids"
    kill $pids 2>/dev/null || true
    # brief wait; if still listening, force kill
    sleep 0.2
    local still
    still=$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)
    if [[ -n "${still:-}" ]]; then
      echo "Force killing on port $port: $still"
      kill -9 $still 2>/dev/null || true
      sleep 0.1
    fi
  fi
}

stop_backend() {
  if [[ -f "$ROOT/.pids/backend.pid" ]]; then
    local pid; pid=$(cat "$ROOT/.pids/backend.pid" || true)
    if [[ -n "${pid:-}" ]]; then
      echo "Stopping backend pid $pid"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$ROOT/.pids/backend.pid"
  fi
  kill_port "$BACKEND_PORT"
}

stop_frontend() {
  if [[ -f "$ROOT/.pids/frontend.pid" ]]; then
    local pid; pid=$(cat "$ROOT/.pids/frontend.pid" || true)
    if [[ -n "${pid:-}" ]]; then
      echo "Stopping frontend pid $pid"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$ROOT/.pids/frontend.pid"
  fi
  kill_port "$FRONTEND_PORT"
}

start_backend() {
  echo "Starting backend (uvicorn) on :$BACKEND_PORT"
  (
    cd "$ROOT"
    if [[ -f "venv/bin/activate" ]]; then
      source venv/bin/activate
    fi
    uvicorn main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload \
      > "$ROOT/logs/backend.log" 2>&1 &
    echo $! > "$ROOT/.pids/backend.pid"
  )
}

start_frontend() {
  echo "Starting frontend (Vite) on :$FRONTEND_PORT (HTTPS=$VITE_DEV_HTTPS, API_BASE=$FRONTEND_API_BASE)"
  (
    cd "$ROOT/avtechnika-dashboard"
    VITE_DEV_HTTPS="$VITE_DEV_HTTPS" \
    VITE_API_BASE="$FRONTEND_API_BASE" \
    VITE_SSL_CERT="${VITE_SSL_CERT:-}" \
    VITE_SSL_KEY="${VITE_SSL_KEY:-}" \
    npm run dev -- --host \
      > "$ROOT/logs/frontend.log" 2>&1 &
    echo $! > "$ROOT/.pids/frontend.pid"
  )
}

status() {
  echo "Backend PID:   $(cat "$ROOT/.pids/backend.pid" 2>/dev/null || echo "-")"
  echo "Frontend PID:  $(cat "$ROOT/.pids/frontend.pid" 2>/dev/null || echo "-")"
  echo "Ports:"
  lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null | grep -E ":($BACKEND_PORT|$FRONTEND_PORT)" || true
}

logs() {
  echo "Tailing logs (Ctrl+C to stop)..."
  tail -n 50 -F "$ROOT/logs/backend.log" "$ROOT/logs/frontend.log"
}

cmd="${1:-help}"
case "$cmd" in
  start)
    start_backend
    start_frontend
    status
    ;;
  stop)
    stop_frontend
    stop_backend
    status
    ;;
  restart)
    stop_frontend
    stop_backend
    start_backend
    start_frontend
    status
    ;;
  status)
    status
    ;;
  logs)
    logs
    ;;
  *)
    cat <<EOF
Usage: zsh scripts/devctl.zsh <command>
Commands:
  start      Start backend and frontend
  stop       Stop backend and frontend
  restart    Restart both (stop -> start)
  status     Show PIDs and listening ports
  logs       Tail both logs

Env vars:
  BACKEND_PORT (default 8000)
  FRONTEND_PORT (default 5173)
  VITE_DEV_HTTPS (default true)
  FRONTEND_API_BASE (default /api)  # keeps same-origin via Vite proxy
EOF
    ;;
esac


