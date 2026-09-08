#!/bin/sh
# Pull-based auto-deploy for TrueNAS SCALE (24.10+/25.04). Run from a TrueNAS Cron Job (System → Advanced → Cron Jobs)
# every few minutes. Pulls the image tag the app follows; if the image changed, redeploys the app through the TrueNAS
# middleware (so the Apps UI stays in sync — do NOT use Watchtower next to ix-apps).
#
#   sh truenas-autoupdate.sh <app-name> <image:tag> [log-file]
#   sh truenas-autoupdate.sh lienstore-prod ghcr.io/anhld-rikkei/lienstore:latest
#   sh truenas-autoupdate.sh lienstore      ghcr.io/anhld-rikkei/lienstore:dev
#
# Optional env: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID → message after each redeploy.
set -u
APP="${1:?app name}"; IMAGE="${2:?image:tag}"; LOG="${3:-/var/log/lienstore-autoupdate.log}"
ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "$(ts) [$APP] $*" | tee -a "$LOG"; }
oneline() { tr '\n' ' ' | tail -c 400; }
notify() {
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  curl -fsS -m 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" -d chat_id="$TELEGRAM_CHAT_ID" -d text="$1" >/dev/null 2>&1 || true
}

before="$(docker image inspect -f '{{.Id}}' "$IMAGE" 2>/dev/null || echo none)"
if ! docker pull -q "$IMAGE" >/dev/null 2>&1; then
  log "pull failed for $IMAGE (registry down or private image without login)"; exit 1
fi
after="$(docker image inspect -f '{{.Id}}' "$IMAGE" 2>/dev/null || echo none)"
if [ "$before" = "$after" ]; then
  exit 0   # nothing new — stay quiet so the cron log does not fill up
fi

digest="$(docker image inspect -f '{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null | sed 's/.*@sha256://' | cut -c1-12)"
version="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$IMAGE" 2>/dev/null)"
log "new image for $IMAGE (version=${version:-?} digest=${digest:-?}) → backing up DB, then redeploying app"

# Consistent SQLite backup (node:sqlite online backup) into the app's data volume before the new version migrates it.
# Keeps the 10 most recent copies. Container is found through the compose project label TrueNAS sets (ix-<app>).
cid="$(docker ps -q --filter "label=com.docker.compose.project=ix-$APP" 2>/dev/null | head -1)"
if [ -n "$cid" ]; then
  if docker exec "$cid" node -e '""" + BACKUP_NODE + """' >/dev/null 2>&1; then
    log "db backup written to <data>/backups/ (keeping 10)"
  else
    log "WARNING: db backup failed (continuing with redeploy)"
  fi
fi

# TrueNAS 25.04+: app.redeploy; 24.10: app.pull_images with redeploy. Try both, keep the error text for the log.
if out="$(midclt call -j app.redeploy "$APP" 2>&1)"; then
  :
elif out2="$(midclt call -j app.pull_images "$APP" '{"redeploy": true}' 2>&1)"; then
  :
else
  log "redeploy failed. app.redeploy → $(printf '%s' "$out" | oneline)"
  log "                 app.pull_images → $(printf '%s' "$out2" | oneline)"
  notify "❌ $APP: redeploy failed for $IMAGE"; exit 1
fi

# wait for the health endpoint of the app (port from the compose ports mapping)
port="$(midclt call app.config "$APP" 2>/dev/null | sed -n 's/.*"\([0-9]\{4,5\}\):3000".*/\1/p' | head -1)"
if [ -n "$port" ]; then
  i=0
  while [ $i -lt 30 ]; do
    if h="$(curl -fsS -m 5 "http://127.0.0.1:${port}/api/health/" 2>/dev/null)"; then
      v="$(printf '%s' "$h" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
      log "healthy on :$port after redeploy (app version ${v:-?}, image ${version:-?})"; notify "✅ $APP updated to ${v:-${version:-$digest}}"; exit 0
    fi
    i=$((i+1)); sleep 5
  done
  log "WARNING: app not healthy 150s after redeploy — check Apps → $APP → Logs"; notify "⚠️ $APP redeployed but not healthy yet"; exit 1
fi
log "redeployed (port unknown, skipped health wait)"; notify "✅ $APP redeployed to ${version:-$digest}"
docker image prune -f >/dev/null 2>&1 || true
