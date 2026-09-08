#!/bin/sh
# Roll a TrueNAS Custom App back to an earlier LienStore image WITHOUT editing the app's compose YAML.
#
#   sudo sh truenas-rollback.sh <app-name> <image-repo> <version> [tracked-tag]
#   sudo sh truenas-rollback.sh lienstore-prod ghcr.io/anhld-rikkei/lienstore 1.5.1
#
# How it works: the app follows a moving tag (default `latest`). We pull the wanted version, re-point the LOCAL
# `latest` tag at it and redeploy — compose reuses the local image. Then DISABLE the auto-update cron job for this
# app (System → Advanced → Cron Jobs), otherwise the next run pulls the newer `latest` again.
# Schema migrations are forward-only: rolling back across a migration works while the new columns/tables are simply
# ignored by the old code; if a downgrade needs a DB restore, copies live in <data>/backups/ (made by autoupdate).
set -eu
APP="${1:?app name}"; REPO="${2:?image repo, e.g. ghcr.io/anhld-rikkei/lienstore}"; VER="${3:?version, e.g. 1.5.1}"; TAG="${4:-latest}"
echo "→ pulling $REPO:$VER"
docker pull -q "$REPO:$VER"
docker tag "$REPO:$VER" "$REPO:$TAG"
echo "→ redeploying $APP with local $REPO:$TAG = $VER"
midclt call -j app.redeploy "$APP" >/dev/null
port="$(midclt call app.config "$APP" 2>/dev/null | sed -n 's/.*"\([0-9]\{4,5\}\):3000".*/\1/p' | head -1)"
if [ -n "$port" ]; then
  i=0
  while [ $i -lt 30 ]; do
    if h="$(curl -fsS -m 5 "http://127.0.0.1:${port}/api/health/" 2>/dev/null)"; then
      echo "✅ healthy: $h"; break
    fi
    i=$((i+1)); sleep 5
  done
fi
echo
echo "!! Now DISABLE the cron job 'truenas-autoupdate.sh $APP …' or it will pull the newer $TAG again."
echo "   To resume normal updates later: re-enable the cron job (it re-pulls $REPO:$TAG)."
