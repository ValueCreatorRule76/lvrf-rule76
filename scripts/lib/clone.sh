# OWN-1 — throwaway clones the way prod is after OWN-1: owned by lvrf_owner,
# migrated as lvrf_migrate (acting as lvrf_owner), with lvrf_app granted only
# what the code needs (db/ownership.sql). Sourced by the verify scripts:
#
#   . scripts/lib/clone.sh
#   make_clone "$VERIFY_DB"                     # createdb -T lvrf, then ownership.sql
#   migrate_clone "$VERIFY_DB" > log            # drizzle-kit migrate as lvrf_migrate,
#                                               # then ownership.sql again (new tables' grants)
#   psql -d "$VERIFY_DB" -f db/hardening.sql    # unchanged: as the local superuser
#
# Real local lvrf is NEVER converted (OWN-1-D1): only the clone is. The
# servers under test still connect as lvrf_app (.env's DATABASE_URL with the
# clone's name). lvrf_migrate's local-only password is in the git-ignored
# .env.migrate (MIGRATE_DATABASE_URL); never prod's.

[ -r .env.migrate ] || { echo "REFUSING: .env.migrate is missing (OWN-1: the local lvrf_migrate URL; see db/ownership.sql)"; exit 1; }
case "$(grep '^MIGRATE_DATABASE_URL=' .env.migrate | cut -d= -f2-)" in
  postgres://lvrf_migrate:*@localhost:*|postgres://lvrf_migrate:*@127.0.0.1:*) ;;
  *) echo "REFUSING: .env.migrate's MIGRATE_DATABASE_URL is not lvrf_migrate on localhost"; exit 1 ;;
esac

migrate_url() {  # DB — the lvrf_migrate URL for that database
  local m; m="$(grep '^MIGRATE_DATABASE_URL=' .env.migrate | cut -d= -f2-)"
  echo "${m%/*}/$1"
}
make_clone() {  # DB [TEMPLATE]
  [ "$1" != "lvrf" ] || { echo "REFUSING: make_clone never converts real local lvrf"; return 1; }
  createdb -T "${2:-lvrf}" "$1" \
    && psql -X -q -v ON_ERROR_STOP=1 -d "$1" -f db/ownership.sql > /dev/null 2>&1
}
migrate_clone() {  # DB [drizzle-kit args...]
  local db="$1"; shift
  [ "$db" != "lvrf" ] || { echo "REFUSING: migrate_clone never migrates real local lvrf"; return 1; }
  DATABASE_URL="$(migrate_url "$db")" npx drizzle-kit migrate "$@" \
    && psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f db/ownership.sql > /dev/null 2>&1
}
