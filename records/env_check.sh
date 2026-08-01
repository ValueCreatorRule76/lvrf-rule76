#!/usr/bin/env bash
# LVRF — verify the rendering environment.
#
#   npm run env:check
#
# Run after any OS or Homebrew upgrade. A `brew upgrade` that moves pango can
# break rendering without touching a line of code, and the font failure is
# silent — WeasyPrint substitutes a default face and the PDF looks almost right.

set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
ok()   { printf '  \033[32mOK\033[0m    %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=1; }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; }

echo
echo "LVRF environment check"
echo "───────────────────────────────────────────────────────────────"

# 1. an interpreter that can render
PY=""
for cand in "${LVRF_PYTHON:-}" /opt/homebrew/bin/python3 /usr/local/bin/python3 "$(command -v python3 || true)"; do
  [[ -n "$cand" && -x "$cand" ]] || continue
  if "$cand" -c 'import weasyprint' >/dev/null 2>&1; then PY="$cand"; break; fi
done

if [[ -z "$PY" ]]; then
  bad "no Python with WeasyPrint — see records/ENVIRONMENT.md"
else
  ok "interpreter  $PY"
  ver=$("$PY" -c 'import weasyprint; print(weasyprint.__version__)' 2>/dev/null)
  if [[ "$ver" == "69.0" ]]; then
    ok "weasyprint   $ver"
  else
    warn "weasyprint   $ver (CLAUDE.md pins 69.0 — re-render both records if this moved)"
  fi
fi

# 2. fonts — the silent failure
if command -v fc-list >/dev/null 2>&1; then
  for fam in Bebas Barlow; do
    n=$(fc-list | grep -ci "$fam" || true)
    if [[ "$n" -gt 0 ]]; then ok "font         $fam ($n faces)"
    else bad "font         $fam missing — install to ~/.fonts then 'fc-cache -f'"; fi
  done
else
  warn "fc-list not found; cannot verify fonts. Rendering may silently substitute."
fi

# 3. pdftoppm — QA only, not required to render
if command -v pdftoppm >/dev/null 2>&1; then ok "pdftoppm     present (visual QA)"
else warn "pdftoppm missing — 'brew install poppler'. Not required to render."; fi

# 4. the spine scripts are stdlib-only and must run anywhere
if python3 -c 'import json,hashlib,statistics,datetime' >/dev/null 2>&1; then
  ok "stdlib       simulate_spine / confirmation_gap need nothing else"
fi

echo "───────────────────────────────────────────────────────────────"
if [[ "$fail" -eq 0 ]]; then echo "  ready"; else echo "  NOT ready — see records/ENVIRONMENT.md"; fi
echo
exit "$fail"
