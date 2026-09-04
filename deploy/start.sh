#!/bin/bash
# Boots the three processes the merchant portal image runs: the retail API and the
# Next.js portal on loopback, and the basic-auth proxy on the platform's port.
set -euo pipefail

APP_ROOT=/app
API_PORT="${API_PORT:-8100}"
WEB_PORT="${WEB_PORT:-3100}"
PUBLIC_PORT="${PORT:-8000}"

if [ -z "${BASIC_AUTH_USER:-}" ] || [ -z "${BASIC_AUTH_PASSWORD:-}" ]; then
  echo "refusing to start: BASIC_AUTH_USER and BASIC_AUTH_PASSWORD must both be set" >&2
  exit 1
fi
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "warning: ANTHROPIC_API_KEY is unset; the portal loads but chat returns an auth error" >&2
fi

terminate() {
  trap - TERM INT EXIT
  kill 0 2>/dev/null || true
}
trap terminate TERM INT EXIT

/opt/venv/bin/python -m uvicorn retail.api.main:app \
  --app-dir "$APP_ROOT/examples" --host 127.0.0.1 --port "$API_PORT" &

PORT="$WEB_PORT" HOSTNAME=127.0.0.1 \
  node "$APP_ROOT/web/retail/merchant-web/server.js" &

PORT="$PUBLIC_PORT" API_PORT="$API_PORT" WEB_PORT="$WEB_PORT" \
  node "$APP_ROOT/deploy/proxy.mjs" &

# Any one of the three exiting takes the container down, so the platform restarts it.
wait -n
status=$?
echo "a process exited with status $status; stopping the container" >&2
exit "$status"
