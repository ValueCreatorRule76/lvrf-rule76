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
# Step 5b (Band A, deploy B) refuses to restart if any tenant's steward lacks
# a current access grant or password — the lockout pre-check.
#
# Step 5c (Q4) refuses to restart against an unmigrated database or a schema
# that differs from the newest snapshot (D2), or on a critical drift finding
# (D1/D3/D4).
#
# Step 7 checks the app is UP and FAIL-CLOSED, then the vhost:
#   - GET /api/health on 127.0.0.1 -> 200, and it must report
#     origin_check "configured": a missing LVRF_PUBLIC_ORIGIN fails the
#     deploy here rather than passing silently (server/lib/origin.ts);
#   - ...and it must report actor_header "off" (sign-in P2b): the
#     X-Actor-Person-Id header is not accepted in production
#     (server/lib/actorHeader.ts);
#   - GET /api/runs/:id on 127.0.0.1 with no session -> 401. Since sign-in
#     P2a every read needs an actor, so a 200 here would mean the app is
#     open, and anything else that it is not up;
#   - the same GET with an X-Actor-Person-Id header naming a CURRENT
#     vendor-staff person (read from the database, a SELECT as lvrf_app)
#     and no session -> 401. A 200 would mean the header still acts;
#   - the vhost -> 401, Caddy's basic_auth in front of everything.
# 127.0.0.1, never localhost: the API binds IPv4 loopback only.
#
# SELF-UPDATE. Bash keeps executing the file it started with, even after the
# `git pull` below replaces it on disk — so a deploy that changes this
# script used to run the OLD version's checks (seen at P2a, 11 October). Now,
# if the pull changed this file, the script re-runs itself with `exec`: the
# new version, with LVRF_DEPLOY_REEXEC=1, the old HEAD and the pull time
# passed on. The re-run skips the clean-tree check and the pull (both done),
# and it runs only if the file on disk is exactly HEAD's copy of this
# script — so it can never re-exec a second time or run anything else.

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

# This file's absolute path, resolved before the cd below.
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
SELF_REL="scripts/lvrf-deploy.sh"

cd "$REPO_DIR"

if [ "${LVRF_DEPLOY_REEXEC:-}" = "1" ]; then
  # Second pass: the first run has already checked the tree and pulled.
  OLD_HEAD="${LVRF_DEPLOY_OLD_HEAD:-}"
  PULL_TIME="${LVRF_DEPLOY_PULL_TIME:-}"
  [ -n "$OLD_HEAD" ] && [ -n "$PULL_TIME" ] \
    || die "LVRF_DEPLOY_REEXEC=1 without LVRF_DEPLOY_OLD_HEAD and LVRF_DEPLOY_PULL_TIME — this mode is only for the script's own re-run"
  [ "$(git hash-object "$SELF")" = "$(git rev-parse "HEAD:${SELF_REL}")" ] \
    || die "refusing a second re-exec: the running lvrf-deploy.sh is not HEAD's copy (the tree changed after the pull)"
  NEW_HEAD="$(git rev-parse HEAD)"
  log "re-running the updated lvrf-deploy.sh; pulled ${OLD_HEAD}..${NEW_HEAD} by the first run"
else
  # 1. Refuse to run if the working tree is dirty.
  if [ -n "$(git status --porcelain)" ]; then
    die "working tree is dirty — commit, stash, or discard before deploying"
  fi

  OLD_HEAD="$(git rev-parse HEAD)"
  SELF_HASH_BEFORE="$(git hash-object "$SELF")"

  # 2. Pull, capture old and new HEAD, print the range.
  PULL_TIME="$(date +%s)"
  git pull || die "git pull failed"
  NEW_HEAD="$(git rev-parse HEAD)"
  log "pulled ${OLD_HEAD}..${NEW_HEAD}"

  # 2a. If this pull changed this script, run the new version instead.
  if [ "$(git hash-object "$SELF")" != "$SELF_HASH_BEFORE" ]; then
    log "lvrf-deploy.sh changed in this pull; re-running the new version"
    exec env LVRF_DEPLOY_REEXEC=1 LVRF_DEPLOY_OLD_HEAD="$OLD_HEAD" LVRF_DEPLOY_PULL_TIME="$PULL_TIME" \
      bash "$SELF" "$@"
  fi
fi

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

# 5b. The lockout pre-check (3.0 Band A, deploy B). Sign-in needs a current
#     access grant; a restart into a state where a tenant's steward has no
#     current grant or password would leave nobody able to sign in to grant
#     one except over SSH. scripts/precheck_steward_grants.sql prints the
#     number of such tenants; anything but 0 stops the deploy HERE, before the
#     restart, with the running service untouched. Read-only, as lvrf_app.
DB_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
LOCKED_OUT="$(psql -X -At "$DB_URL" -f scripts/precheck_steward_grants.sql)" \
  || die "the steward-grant pre-check could not run (is 0029 applied?); not restarting"
[ "$LOCKED_OUT" = "0" ] \
  || die "steward-grant pre-check: ${LOCKED_OUT} tenant(s) would be locked out (steward without a current grant or password); not restarting. Grant the steward first: npx tsx scripts/grant_access.ts <steward email> --reason \"...\""
log "steward-grant pre-check: 0 tenants locked out"

# 5c. Drift, before the restart (Q4). D2: never run new code against an
#     unmigrated database — every migration this checkout ships must be
#     applied — and the live schema must match the newest snapshot
#     (scripts/check_schema_drift.mjs; read-only). Then the SQL drift checks
#     D1/D3/D4 (scripts/drift_report.ts; read-only): warnings are printed,
#     a critical finding stops the deploy. Either stop leaves the running
#     service untouched.
node scripts/check_schema_drift.mjs \
  || die "D2: the database is not what this code expects (see above); not restarting. Apply the migrations and db/hardening.sql first."
npx tsx scripts/drift_report.ts \
  || die "a critical drift finding (see above); not restarting"

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
HEALTH_BODY="$(curl -s -w '\n%{http_code}' "http://127.0.0.1:3001/api/health")"
HEALTH_STATUS="$(printf '%s' "$HEALTH_BODY" | tail -n1)"
ORIGIN_MODE="$(printf '%s' "$HEALTH_BODY" | head -n1 | grep -oE '"origin_check":"[a-z-]+"' | cut -d'"' -f4)"
ACTOR_HEADER="$(printf '%s' "$HEALTH_BODY" | head -n1 | grep -oE '"actor_header":"[a-z]+"' | cut -d'"' -f4)"
API_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3001/api/runs/${RUN_ID}")"
STAFF_ID="$(psql -X -At "$DB_URL" -c "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")" \
  || die "could not read a vendor-staff id for the header check"
[ -n "$STAFF_ID" ] || die "no current vendor-staff person to name in the header check"
HEADER_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -H "X-Actor-Person-Id: ${STAFF_ID}" "http://127.0.0.1:3001/api/runs/${RUN_ID}")"
VHOST_STATUS="$(curl -sIk -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/")"

log "GET http://127.0.0.1:3001/api/health -> ${HEALTH_STATUS} (expect 200), origin_check=${ORIGIN_MODE:-<none>} (expect configured)"
log "health actor_header=${ACTOR_HEADER:-<none>} (expect off)"
log "GET http://127.0.0.1:3001/api/runs/${RUN_ID} with no session -> ${API_STATUS} (expect 401: up and fail-closed)"
log "GET http://127.0.0.1:3001/api/runs/${RUN_ID} with X-Actor-Person-Id (vendor staff), no session -> ${HEADER_STATUS} (expect 401: the header does not act)"
log "GET https://${DOMAIN}/ -> ${VHOST_STATUS} (expect 401, basic_auth)"

if [ "$HEALTH_STATUS" != "200" ] || [ "$API_STATUS" != "401" ] || [ "$HEADER_STATUS" != "401" ] || [ "$VHOST_STATUS" != "401" ]; then
  die "unexpected response (health=${HEALTH_STATUS}, api=${API_STATUS}, header=${HEADER_STATUS}, vhost=${VHOST_STATUS})"
fi
if [ "$ACTOR_HEADER" != "off" ]; then
  die "actor_header is '${ACTOR_HEADER:-<none>}', not 'off' (the server should have refused to start with the header on in production)"
fi
if [ "$ORIGIN_MODE" != "configured" ]; then
  die "origin_check is '${ORIGIN_MODE:-<none>}', not 'configured': set LVRF_PUBLIC_ORIGIN in /srv/lvrf/.env (writes are still checked against the request's own origin meanwhile)"
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
