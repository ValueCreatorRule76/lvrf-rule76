#!/usr/bin/env bash
# LVRF — resolve a Python that can actually render.
#
# The repo declares its own interpreter rather than depending on PATH. Shell
# state is invisible, machine-specific and un-reviewable; a versioned resolver
# is none of those things.
#
#   ./records/py.sh records/render_record.py customer_b.json
#   npm run record:render -- customer_b.json
#
# Rationale for why system Python cannot work: records/ENVIRONMENT.md

set -euo pipefail

CANDIDATES=(
  "${LVRF_PYTHON:-}"                 # explicit override wins
  /opt/homebrew/bin/python3          # Homebrew, Apple Silicon
  /usr/local/bin/python3             # Homebrew, Intel
  "$(command -v python3 || true)"    # whatever PATH offers, last
)

for py in "${CANDIDATES[@]}"; do
  [[ -n "$py" && -x "$py" ]] || continue
  if "$py" -c 'import weasyprint' >/dev/null 2>&1; then
    exec "$py" "$@"
  fi
done

cat >&2 <<'EOF'

No Python with a working WeasyPrint was found.

Checked, in order:
  $LVRF_PYTHON (if set)
  /opt/homebrew/bin/python3
  /usr/local/bin/python3
  python3 from PATH

On macOS the system Python cannot run WeasyPrint's native bindings — SIP strips
DYLD_* before the interpreter starts, so no library path fixes it. Install via
Homebrew Python:

  brew install pango poppler python3
  /opt/homebrew/bin/python3 -m pip install weasyprint==69.0

Or point the resolver at a known-good interpreter:

  export LVRF_PYTHON=/path/to/python3

Full setup and reasoning: records/ENVIRONMENT.md

EOF
exit 1
