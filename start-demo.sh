#!/usr/bin/env bash
#
# ShowMeTheButton — one-shot demo launcher.
#
# Builds & links the SDK, starts the agent (port 8001) and the Angular app
# (port 4200), waits until both are ready, then opens the browser.
# Ctrl+C stops everything.
#
# Usage:
#   ./start-demo.sh              # build SDK if needed, start both services
#   ./start-demo.sh --install    # also (re)install all dependencies first
#   ./start-demo.sh --no-open    # don't auto-open the browser
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$ROOT/show-me-agent"
SDK_DIR="$ROOT/show-me-sdk/packages/core"
WEB_DIR="$ROOT/angular-demo"
AGENT_PORT=8001
WEB_PORT=4200
LOG_DIR="$ROOT/.demo-logs"

INSTALL=0
OPEN_BROWSER=1
for arg in "$@"; do
  case "$arg" in
    --install)  INSTALL=1 ;;
    --no-open)  OPEN_BROWSER=0 ;;
    -h|--help)  grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# ── pretty output ─────────────────────────────────────────────────────────────
c_blue=$'\033[34m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'
c_bold=$'\033[1m'; c_reset=$'\033[0m'
step() { echo "${c_blue}${c_bold}▶ $*${c_reset}"; }
ok()   { echo "${c_green}✓ $*${c_reset}"; }
warn() { echo "${c_yellow}⚠ $*${c_reset}"; }
die()  { echo "${c_red}✗ $*${c_reset}" >&2; exit 1; }

AGENT_PID=""
WEB_PID=""

cleanup() {
  echo ""
  step "Shutting down…"
  [ -n "$WEB_PID" ]   && kill "$WEB_PID"   2>/dev/null || true
  [ -n "$AGENT_PID" ] && kill "$AGENT_PID" 2>/dev/null || true
  # also reap anything still holding the ports
  free_port "$WEB_PORT"; free_port "$AGENT_PORT"
  ok "Stopped."
}
trap cleanup EXIT INT TERM

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  [ -n "$pids" ] && echo "$pids" | xargs kill -9 2>/dev/null || true
}

wait_for_http() {
  # wait_for_http <url> <label> <max_seconds>
  local url="$1" label="$2" max="${3:-60}" i=0
  while [ "$i" -lt "$max" ]; do
    if curl -s -o /dev/null "$url" 2>/dev/null; then ok "$label is up"; return 0; fi
    sleep 1; i=$((i+1))
  done
  die "$label did not come up within ${max}s (see $LOG_DIR)"
}

agent_deps_ok() { "$PYBIN" -c "import fastapi, uvicorn, httpx" >/dev/null 2>&1; }

ensure_agent_env() {
  # Prefer an existing project venv if present.
  [ -x "$AGENT_DIR/.venv/bin/python" ] && PYBIN="$AGENT_DIR/.venv/bin/python"

  # If the chosen interpreter already has the deps and the user didn't force
  # --install, use it as-is (e.g. an active conda/base env that works today).
  if [ "$INSTALL" -eq 0 ] && agent_deps_ok; then
    return 0
  fi

  # Need to install. Do it in an isolated venv to avoid PEP 668
  # "externally-managed-environment" errors on Homebrew/system Python.
  if [ ! -x "$AGENT_DIR/.venv/bin/python" ]; then
    step "Creating Python virtualenv (show-me-agent/.venv)"
    python3 -m venv "$AGENT_DIR/.venv" || die "Failed to create virtualenv"
  fi
  PYBIN="$AGENT_DIR/.venv/bin/python"

  if [ "$INSTALL" -eq 1 ] || ! agent_deps_ok; then
    step "Installing agent (Python) dependencies into .venv"
    "$PYBIN" -m pip install --quiet --upgrade pip
    "$PYBIN" -m pip install -r "$AGENT_DIR/requirements.txt" || die "pip install failed"
  fi
  ok "Agent Python env ready ($PYBIN)"
}

# ── 0. prerequisites ──────────────────────────────────────────────────────────
step "Checking prerequisites"
command -v node >/dev/null  || die "node not found (need Node 18+)"
command -v npm  >/dev/null  || die "npm not found"
command -v python3 >/dev/null || die "python3 not found (need 3.10+)"
PYBIN="python3"

if [ ! -f "$ROOT/.env" ]; then
  warn "No .env at repo root — copying .env.example (set MINIMAX_API_KEY for live LLM matching)"
  cp "$ROOT/.env.example" "$ROOT/.env" 2>/dev/null || true
elif ! grep -q "MINIMAX_API_KEY=.\{6,\}" "$ROOT/.env" 2>/dev/null; then
  warn "MINIMAX_API_KEY looks unset in .env — agent will fall back to keyword matching"
fi
mkdir -p "$LOG_DIR"

# ── 1. dependencies ───────────────────────────────────────────────────────────
if [ "$INSTALL" -eq 1 ] || [ ! -d "$SDK_DIR/node_modules" ]; then
  step "Installing SDK dependencies"
  ( cd "$SDK_DIR" && npm install )
fi
if [ "$INSTALL" -eq 1 ] || [ ! -d "$WEB_DIR/node_modules" ]; then
  step "Installing Angular dependencies"
  ( cd "$WEB_DIR" && npm install )
fi
ensure_agent_env   # Python deps (uses current interpreter if it already has them, else a venv)

# ── 2. build & link the SDK ───────────────────────────────────────────────────
step "Building the SDK"
( cd "$SDK_DIR" && npm run build >/dev/null 2>&1 ) && ok "SDK built"

step "Linking @show-me/core into the Angular app"
( cd "$SDK_DIR" && npm link >/dev/null 2>&1 )
( cd "$WEB_DIR" && npm link @show-me/core >/dev/null 2>&1 )
ok "Linked"

# ── 3. free ports ─────────────────────────────────────────────────────────────
step "Freeing ports $AGENT_PORT and $WEB_PORT"
free_port "$AGENT_PORT"; free_port "$WEB_PORT"

# ── 4. start the agent ────────────────────────────────────────────────────────
step "Starting agent  → http://localhost:$AGENT_PORT"
( cd "$AGENT_DIR" && $PYBIN -m uvicorn main:app --port "$AGENT_PORT" >"$LOG_DIR/agent.log" 2>&1 ) &
AGENT_PID=$!
wait_for_http "http://localhost:$AGENT_PORT/api/health" "Agent" 40

# ── 5. start the Angular app ──────────────────────────────────────────────────
step "Starting web app → http://localhost:$WEB_PORT  (first build takes ~20s)"
( cd "$WEB_DIR" && npx ng serve --port "$WEB_PORT" >"$LOG_DIR/web.log" 2>&1 ) &
WEB_PID=$!
wait_for_http "http://localhost:$WEB_PORT" "Web app" 120

# ── 6. ready ──────────────────────────────────────────────────────────────────
echo ""
ok "${c_bold}Demo is ready!${c_reset}"
echo "   ${c_bold}App:${c_reset}        http://localhost:$WEB_PORT"
echo "   ${c_bold}Agent docs:${c_reset} http://localhost:$AGENT_PORT/docs"
echo "   ${c_bold}Cheat sheet:${c_reset} DEMO_CHEATSHEET.md  (hotkeys: Alt+S cursor · Alt+V voice)"
echo "   ${c_bold}Logs:${c_reset}       $LOG_DIR/{agent,web}.log"
echo ""
echo "   Press ${c_bold}Ctrl+C${c_reset} to stop both services."

if [ "$OPEN_BROWSER" -eq 1 ]; then
  URL="http://localhost:$WEB_PORT"
  if command -v open >/dev/null;        then open "$URL"
  elif command -v xdg-open >/dev/null;  then xdg-open "$URL" >/dev/null 2>&1
  fi
fi

# ── 7. keep running until interrupted ─────────────────────────────────────────
wait
