# L41 (LVRF_PLAN §13): a verify script's evidence fixture, through the real routes, every guard on.
#
# A fixture body still says what it means: "source_verified": true is "this evidence is verified". The routes no
# longer take that field, and evidence_final refuses any way but an opening. So this wrapper, for a POST of
# outcome evidence or of a fact: states "about": "account" if the body does not; takes source_verified out; and,
# when it was true and the POST answered 201, makes the second request a person would: POST open-citation, with the
# attester's document for an attestation, and a quote for a row that rests on a statement. No guard is switched
# off, and nothing reaches the database but through the routes. LVRF_RAW_CURL=1 sends a body as written, for the
# checks that the routes refuse the field.
curl() {
  if [ -n "${LVRF_RAW_CURL:-}" ]; then command curl "$@"; return; fi
  local args=("$@") i url="" bi=-1 oi=-1 method=""
  for ((i = 0; i < ${#args[@]}; i++)); do
    case "${args[i]}" in
      -d|--data|--data-raw|--data-binary) bi=$((i + 1)) ;;
      -o|--output) oi=$((i + 1)) ;;
      -X) method="${args[i + 1]}" ;;
      http://*|https://*) url="${args[i]}" ;;
    esac
  done
  local path="${url%%\?*}"
  case "$path" in
    */api/value-outcomes/*/evidence|*/api/institutions/*/facts|*/api/institutions/*/facts/*/supersede) ;;
    *) command curl "$@"; return ;;
  esac
  [ "$bi" -ge 0 ] || { command curl "$@"; return; }
  local rewritten body open tab
  tab="$(printf '\t')"
  rewritten="$(node scripts/lib/evidence_fixture.mjs "${args[bi]}" "$path" 2>/dev/null)" || { command curl "$@"; return; }
  body="${rewritten%%"$tab"*}"
  open="${rewritten#*"$tab"}"
  args[bi]="$body"
  if [ -z "$open" ]; then command curl "${args[@]}"; return; fi
  local out="" rc=0 file=""
  if [ "$oi" -ge 0 ]; then
    file="${args[oi]}"
    out="$(command curl "${args[@]}")" || rc=$?
  else
    file="$(mktemp "${TMPDIR:-/tmp}/lvrf_fx.XXXXXX")"
    out="$(command curl "${args[@]}")" || rc=$?
    printf '%s' "$out" > "$file"
  fi
  local ev base="${url%%/api/*}"
  ev="$(grep -oE '"evidence_id":"[0-9a-f-]{36}"' "$file" | head -1 | cut -d'"' -f4 || true)"
  if [ -n "$ev" ]; then
    local oargs=() skip=0
    for ((i = 0; i < ${#args[@]}; i++)); do
      [ "$skip" = 1 ] && { skip=0; continue; }
      case "${args[i]}" in
        -o|--output|-w|--write-out|-d|--data|--data-raw|--data-binary|-X) skip=1 ;;
        http://*|https://*) ;;
        *) oargs+=("${args[i]}") ;;
      esac
    done
    command curl -s -o /dev/null -X POST "${oargs[@]}" -d "$open" "$base/api/evidence/$ev/open-citation" || true
  fi
  [ "$oi" -ge 0 ] || rm -f "$file"
  printf '%s' "$out"
  return "$rc"
}
