#!/usr/bin/env bash
# End-to-end test of the Admin API v1 + CLI on a THROW-AWAY copy of the local database:
#   npm run test:admin-api:e2e
# Starts `next dev` on $E2E_PORT (default 3197) with LIEN_DB_PATH / LIEN_UPLOAD_DIR in a temp dir, runs
# scripts/tests/admin-api.e2e.mjs, then stops the server and deletes the temp dir. Never touches data/lienstore.db
# or production. To reuse a server you already started on a test DB: E2E_URL=… E2E_DB=… E2E_SECRET=… node --test …
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${E2E_PORT:-3197}"
TMP="$(mktemp -d -t lien-e2e-srv-XXXXXX)"
SRC_DB="${LIEN_TEST_DB_SOURCE:-data/lienstore.db}"
mkdir -p "$TMP/uploads"
if [[ -f "$SRC_DB" ]]; then cp "$SRC_DB" "$TMP/lienstore.db"; fi
SECRET="e2e-$(node -e 'console.log(require("crypto").randomBytes(16).toString("hex"))')"

cleanup() {
  # npx → next → next-server: kill the whole process group, not just npx (an orphaned server keeps the port)
  if [[ -n "${SERVER_PID:-}" ]]; then kill -- "-$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

if curl -s -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
  echo "[e2e] port $PORT is already in use — stop that process or set E2E_PORT"; exit 1
fi

echo "[e2e] temp DB: $TMP/lienstore.db — starting next dev on :$PORT"
LIEN_DB_PATH="$TMP/lienstore.db" LIEN_UPLOAD_DIR="$TMP/uploads" ADMIN_SESSION_SECRET="$SECRET" \
  setsid npx next dev -p "$PORT" >"$TMP/server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 90); do
  if curl -fs "http://localhost:$PORT/api/admin/v1/" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[e2e] server exited:"; cat "$TMP/server.log"
    if grep -q "Another next dev server" "$TMP/server.log"; then
      echo "[e2e] Next.js allows one 'next dev' per project: stop your dev server first, or point the test at a server"
      echo "      already running on a TEST database: E2E_URL=http://localhost:<port> E2E_DB=<that db> E2E_SECRET=<its ADMIN_SESSION_SECRET> node --test scripts/tests/admin-api.e2e.mjs"
    fi
    exit 1
  fi
  sleep 1
done
curl -fs "http://localhost:$PORT/api/admin/v1/" >/dev/null || { echo "[e2e] server not ready"; tail -40 "$TMP/server.log"; exit 1; }

E2E_URL="http://localhost:$PORT" E2E_DB="$TMP/lienstore.db" E2E_SECRET="$SECRET" node --test scripts/tests/admin-api.e2e.mjs scripts/tests/scan.e2e.mjs
