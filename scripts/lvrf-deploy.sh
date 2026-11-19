#!/usr/bin/env bash
#
# LVRF production deploy. Run as brad, NOT under sudo. Its sudo calls are
# `sudo systemctl restart lvrf-api` and, once ops/lvrf-research.service is
# installed (S2, LVRF_PLAN §21, D2), installing the research process's one
# bundled file root-owned at /opt/lvrf-research/sidecar.mjs and restarting it.
#
# Step 5e (S2) refuses to restart if Anthropic's key or ANTHROPIC_BASE_URL is
# in /srv/lvrf/.env: the key lives in /etc/lvrf-research.env (root, 600), read
# by systemd for the research process alone, and production talks to
# api.anthropic.com only.
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
# Step 5d (OWN-1) refuses to restart if lvrf_app owns anything, or holds
# DELETE, TRUNCATE or CREATE, or UPDATE on audit_log, heartbeat_events or
# refusals, or if any trigger is disabled (hardening.sql section 24).
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

#
# NO SILENT STOP (19 Nov 2026, approved by Brad). The S4 deploy ended with
# no message after "lvrf-api is active": step 7's first curl was refused
# while the API was still loading, and under `set -e` a failing command
# substitution ends the script on the spot. Now:
#   - step 6 polls /api/health until the API answers (up to 30s) instead
#     of sleeping a fixed 2 seconds;
#   - every request and parse in step 7 reports instead of ending the
#     script, so its own comparisons and their `die` lines say what failed;
#   - an ERR trap prints the failing line and exit code for any other
#     unguarded failure, anywhere in the script.

set -euo pipefail
trap 'rc=$?; echo "DEPLOY FAILED: line ${LINENO} exited ${rc} (an unguarded command; see the line above)" >&2' ERR

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
npm run build:research || die "npm run build:research (the research process's bundle) failed"

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

# 5d. Ownership, before the restart (OWN-1). The app role owns nothing and
#     holds no DELETE, TRUNCATE or CREATE: lvrf_ownership_violations(), the
#     one definition, installed by hardening.sql section 24, read-only as
#     lvrf_app (scripts/check_ownership.ts). Any violation, or a database not
#     yet converted by db/ownership.sql, stops the deploy with the running
#     service untouched.
DATABASE_URL="${DATABASE_URL:-$(grep '^DATABASE_URL=' .env | cut -d= -f2-)}" npx tsx scripts/check_ownership.ts \
  || die "OWN-1: the ownership check failed (see above); not restarting. Run db/ownership.sql and db/hardening.sql as postgres first."

# 5e. S2 (§21, D2): Anthropic's key never in the app's environment, and no
#     stand-in in production. Counts only; the file's lines are never printed.
[ "$(grep -c '^ANTHROPIC_API_KEY=' .env || true)" = "0" ] \
  || die "S2: ANTHROPIC_API_KEY is in /srv/lvrf/.env; it belongs in /etc/lvrf-research.env (root, 600) only. Not restarting."
[ "$(grep -c '^ANTHROPIC_BASE_URL=' .env || true)" = "0" ] \
  || die "S2: ANTHROPIC_BASE_URL is in /srv/lvrf/.env; production talks to api.anthropic.com only. Not restarting."
log "S2: no Anthropic key or base URL in /srv/lvrf/.env"

# 6a. The research process (S2), when its unit is installed: its one file,
#     root-owned and writable by no one else, then a restart. Before the unit
#     is installed (Gate B's first deploy), research with Claude stays absent.
if [ -f /etc/systemd/system/lvrf-research.service ]; then
  sudo install -o root -g root -m 644 dist/research-sidecar.mjs /opt/lvrf-research/sidecar.mjs \
    || die "could not install the research process's file to /opt/lvrf-research"
  sudo systemctl restart lvrf-research || die "systemctl restart lvrf-research failed"
  sleep 1
  [ "$(systemctl is-active lvrf-research || true)" = "active" ] || die "lvrf-research is not active after restart"
  log "lvrf-research is active ($(stat -c '%U:%G %a' /opt/lvrf-research/sidecar.mjs))"
else
  log "lvrf-research.service is not installed: research with Claude stays absent"
fi

# 6. Restart the service, wait until it answers, and confirm it is active.
#    "active" means only that the process is forked; the API listens once
#    every router has loaded (about 2–3 s on the box, 19 Nov 2026). So poll
#    GET /api/health every 0.5 s, up to 30 s (60 tries). Any HTTP answer
#    counts as up: step 7 checks the status itself.
sudo systemctl restart "$SERVICE" || die "systemctl restart $SERVICE failed"
HEALTH_TRIES=0
until curl -s -o /dev/null --max-time 2 "http://127.0.0.1:3001/api/health"; do
  HEALTH_TRIES=$((HEALTH_TRIES + 1))
  if [ "$HEALTH_TRIES" -ge 60 ]; then
    die "$SERVICE did not answer /api/health within 30s (state: $(systemctl is-active "$SERVICE" || true)); see: journalctl -u $SERVICE -n 50"
  fi
  sleep 0.5
done
ACTIVE_STATE="$(systemctl is-active "$SERVICE" || true)"
if [ "$ACTIVE_STATE" != "active" ]; then
  die "$SERVICE is not active after restart (state: $ACTIVE_STATE)"
fi
log "$SERVICE is active and answering (after ${HEALTH_TRIES} refused tries at 0.5s)"

# 7. Smoke-test two paths: the API directly (bypasses Caddy's
#    basic_auth) and the public vhost (which requires it). Each request and
#    parse ends in `|| true`: a refused connection reads as status 000 and a
#    missing field as <none>, and the comparisons below report it.
HEALTH_BODY="$(curl -s -w '\n%{http_code}' "http://127.0.0.1:3001/api/health" || true)"
HEALTH_STATUS="$(printf '%s' "$HEALTH_BODY" | tail -n1 || true)"
ORIGIN_MODE="$(printf '%s' "$HEALTH_BODY" | head -n1 | grep -oE '"origin_check":"[a-z-]+"' | cut -d'"' -f4 || true)"
ACTOR_HEADER="$(printf '%s' "$HEALTH_BODY" | head -n1 | grep -oE '"actor_header":"[a-z]+"' | cut -d'"' -f4 || true)"
AI_RESEARCH="$(printf '%s' "$HEALTH_BODY" | head -n1 | grep -oE '"ai_research":"[a-z]+"' | cut -d'"' -f4 || true)"
API_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3001/api/runs/${RUN_ID}" || true)"
STAFF_ID="$(psql -X -At "$DB_URL" -c "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")" \
  || die "could not read a vendor-staff id for the header check"
[ -n "$STAFF_ID" ] || die "no current vendor-staff person to name in the header check"
HEADER_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -H "X-Actor-Person-Id: ${STAFF_ID}" "http://127.0.0.1:3001/api/runs/${RUN_ID}" || true)"
VHOST_STATUS="$(curl -sIk -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/" || true)"

log "GET http://127.0.0.1:3001/api/health -> ${HEALTH_STATUS} (expect 200), origin_check=${ORIGIN_MODE:-<none>} (expect configured)"
log "health actor_header=${ACTOR_HEADER:-<none>} (expect off)"
log "health ai_research=${AI_RESEARCH:-<none>} (on, off with no key, or absent before lvrf-research is installed)"
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
