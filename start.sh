#!/usr/bin/env bash
# start.sh — bring the whole queue_mgmt stack up in one go.
#
# Usage:
#   ./start.sh           # build (if needed) and start everything detached
#   ./start.sh --logs    # also tail logs after startup
#   ./start.sh --rebuild # force a clean rebuild of all images
#   ./start.sh --down    # stop and remove containers
set -euo pipefail

cd "$(dirname "$0")"

GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
log() { printf "%s[start.sh]%s %s\n" "$CYAN" "$RESET" "$*"; }
ok()  { printf "%s[ok]%s %s\n" "$GREEN" "$RESET" "$*"; }
warn(){ printf "%s[warn]%s %s\n" "$YELLOW" "$RESET" "$*"; }
die() { printf "%s[fatal]%s %s\n" "$RED" "$RESET" "$*" >&2; exit 1; }

# --- pre-flight ---------------------------------------------------------------
command -v docker >/dev/null || die "docker not found in PATH"
docker compose version >/dev/null 2>&1 || die "docker compose plugin not available"

if ! docker info >/dev/null 2>&1; then
  die "Docker daemon is not running (or Docker Desktop is paused). Start it and re-run."
fi

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    warn ".env missing — copying .env.example. Edit it and re-run if you need real creds."
    cp .env.example .env
  else
    die ".env and .env.example both missing — cannot continue."
  fi
fi

# --- subcommands --------------------------------------------------------------
case "${1:-up}" in
  --down|down)
    log "Stopping stack…"
    docker compose down
    ok "Stack stopped."
    exit 0
    ;;
  --rebuild|rebuild)
    log "Force-rebuilding all images (no cache)…"
    docker compose build --no-cache
    BUILD_FLAG=""    # already built
    ;;
  --logs|logs|up|"")
    BUILD_FLAG="--build"
    ;;
  -h|--help|help)
    sed -n '2,9p' "$0"; exit 0 ;;
  *)
    die "Unknown argument: $1 (try --help)"
    ;;
esac

# --- bring up -----------------------------------------------------------------
log "Bringing up the full stack (build + start)…"
docker compose up ${BUILD_FLAG} -d

# --- wait for key healthchecks ------------------------------------------------
wait_for_healthy() {
  local name="$1" timeout="${2:-90}"
  local cid
  cid=$(docker compose ps -q "$name" 2>/dev/null || true)
  [[ -z "$cid" ]] && { warn "$name not running, skipping health wait"; return; }

  # If the container has no healthcheck, just check it's running.
  local has_hc
  has_hc=$(docker inspect -f '{{if .Config.Healthcheck}}yes{{end}}' "$cid" 2>/dev/null || true)
  if [[ -z "$has_hc" ]]; then
    docker inspect -f '{{.State.Running}}' "$cid" | grep -q true \
      && ok "$name running" || warn "$name not running"
    return
  fi

  local elapsed=0 status
  while (( elapsed < timeout )); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo unknown)
    case "$status" in
      healthy) ok "$name healthy"; return ;;
      unhealthy) warn "$name reported unhealthy — check logs"; return ;;
    esac
    sleep 2; elapsed=$((elapsed + 2))
  done
  warn "$name did not report healthy within ${timeout}s (status=$status)"
}

log "Waiting for services to come online…"
wait_for_healthy redis 30
wait_for_healthy queue-service 120
wait_for_healthy prediction-service 60
wait_for_healthy notification-service 60
wait_for_healthy vision-service 30

# --- summary ------------------------------------------------------------------
cat <<EOF

${GREEN}Stack is up.${RESET}

  Frontend (unified SmartQueue app)
    Command Center    →  http://localhost:5173
    Staff Operations  →  http://localhost:5173/staff
    Public Display    →  http://localhost:5173/display

  Backend
    Queue API (Django) →  http://localhost:8000/api/
    Prediction API     →  http://localhost:8001/
    MLflow             →  http://localhost:5000

  Useful commands
    docker compose ps                # status
    docker compose logs -f           # tail all logs
    docker compose logs -f queue-service notification-service
    ./start.sh --down                # stop everything
    ./start.sh --rebuild             # clean rebuild

EOF

if [[ "${1:-}" == "--logs" || "${1:-}" == "logs" ]]; then
  log "Tailing logs (Ctrl-C to detach — containers keep running)…"
  exec docker compose logs -f --tail=100
fi
