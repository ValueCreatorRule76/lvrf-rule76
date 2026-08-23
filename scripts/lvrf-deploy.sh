#!/usr/bin/env bash
#
# LVRF production deploy. Run as brad, NOT under sudo. The single
# `sudo systemctl restart lvrf-api` call below is the only sudo in
# this script.
#
# Usage: ./scripts/lvrf-deploy.sh [run-id]
#   run-id  id of a run used to smoke-test GET /api/runs/:id
#           (default: 88f6a6e1-d99b-4cee-a4a6-ea954361de71)
#
# Step 7 checks two distinct paths rather than one URL: the vhost has
# basic_auth in front of its handle blocks, so an unauthenticated
# request to https://lvrf-rule76.com/ correctly returns 401 — that is
# not a failed deploy. The API is checked directly on its local port,
# bypassing Caddy and its auth, to confirm the app itself is up.

set -euo pipefail

REPO_DIR="/srv/lvrf"
SERVICE="lvrf-api"
DOMAIN="lvrf-rule76.com"
RUN_ID="${1:-88f6a6e1-d99b-4cee-a4a6-ea954361de71}"

die() {
  echo "DEPLOY FAILED: $*" >&2
  exit 1
}

log() {
  echo "==> $*"
}

if [ "$(id -u)" -eq 0 ]; then
  die "do not run this script as root or under sudo"
fi

cd "$REPO_DIR"

# 1. Refuse to run if the working tree is dirty.
if [ -n "$(git status --porcelain)" ]; then
  die "working tree is dirty — commit, stash, or discard before deploying"
fi

OLD_HEAD="$(git rev-parse HEAD)"

# 2. Pull, capture old and new HEAD, print the range.
PULL_TIME="$(date +%s)"
git pull || die "git pull failed"
NEW_HEAD="$(git rev-parse HEAD)"
log "pulled ${OLD_HEAD}..${NEW_HEAD}"

# 3. Server build.
npm ci || die "npm ci (server) failed"
npm run build || die "npm run build (server) failed"

# 4. Client build — the step that was missing.
(
  cd client
  npm ci || die "npm ci (client) failed"
  npm run build || die "npm run build (client) failed"
) || die "client build step failed"

# 5. Verify the client bundle is actually fresh.
INDEX_HTML="client/dist/index.html"
[ -f "$INDEX_HTML" ] || die "$INDEX_HTML does not exist after client build"
INDEX_MTIME="$(stat -c %Y "$INDEX_HTML")"
if [ "$INDEX_MTIME" -lt "$PULL_TIME" ]; then
  die "$INDEX_HTML mtime ($INDEX_MTIME) is older than the pull ($PULL_TIME) — client build did not run or did not write output"
fi

# 6. Restart the service and confirm it came up.
sudo systemctl restart "$SERVICE" || die "systemctl restart $SERVICE failed"
sleep 2
ACTIVE_STATE="$(systemctl is-active "$SERVICE" || true)"
if [ "$ACTIVE_STATE" != "active" ]; then
  die "$SERVICE is not active after restart (state: $ACTIVE_STATE)"
fi
log "$SERVICE is active"

# 7. Smoke-test two paths: the API directly (bypasses Caddy's
#    basic_auth) and the public vhost (which requires it).
API_STATUS="$(curl -sI -o /dev/null -w '%{http_code}' "http://127.0.0.1:3001/api/runs/${RUN_ID}")"
VHOST_STATUS="$(curl -sIk -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/")"

log "GET http://127.0.0.1:3001/api/runs/${RUN_ID} -> ${API_STATUS} (expect 200)"
log "GET https://${DOMAIN}/ -> ${VHOST_STATUS} (expect 401, basic_auth)"

if [ "$API_STATUS" != "200" ] || [ "$VHOST_STATUS" != "401" ]; then
  die "unexpected response (api=${API_STATUS}, vhost=${VHOST_STATUS})"
fi

# 8. Summary.
BUNDLE_JS="$(find client/dist/assets -maxdepth 1 -name '*.js' -printf '%f\n' | sort | head -n1)"
BUNDLE_CSS="$(find client/dist/assets -maxdepth 1 -name '*.css' -printf '%f\n' | sort | head -n1)"

log "old HEAD:    ${OLD_HEAD}"
log "new HEAD:    ${NEW_HEAD}"
log "bundle JS:   ${BUNDLE_JS:-<none found>}"
log "bundle CSS:  ${BUNDLE_CSS:-<none found>}"
log "run id:      ${RUN_ID}"
log "deploy OK"
