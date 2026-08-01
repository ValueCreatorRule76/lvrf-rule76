# LVRF — Rendering Environment

WeasyPrint has native dependencies and does **not** work with the Python that ships
with macOS. This file records what was installed, why, and how to fail loudly rather
than silently.

Canonical version: **WeasyPrint 69.0**, per `CLAUDE.md`.

---

## macOS — dev machine

```bash
brew install pango poppler python3
/opt/homebrew/bin/python3 -m pip install weasyprint==69.0
```

`pango` pulls cairo, harfbuzz and fribidi. `poppler` provides `pdftoppm`, used only for
visual QA — not needed to render.

### Fonts — required, and silent when missing

```bash
mkdir -p ~/.fonts && cd ~/.fonts
B="https://raw.githubusercontent.com/google/fonts/main"
curl -sfLO "$B/ofl/bebasneue/BebasNeue-Regular.ttf"
for f in Regular Medium SemiBold Bold Italic; do
  curl -sfLO "$B/ofl/barlow/Barlow-$f.ttf"
done
fc-cache -f
fc-list | grep -ci "bebas\|barlow"    # must be > 0
```

**Skipping `fc-cache -f` does not error.** WeasyPrint falls back to a default face and the
PDF renders looking almost right. Always confirm the `fc-list` count.

---

## The SIP trap — why the obvious fix fails

macOS system Python (`/usr/bin/python3`, Apple's CommandLineTools build) **cannot** run
WeasyPrint's native bindings, and the usual remedy does not work:

> macOS strips `DYLD_*` environment variables when launching SIP-protected binaries. So
> `DYLD_LIBRARY_PATH` and `DYLD_FALLBACK_LIBRARY_PATH` are silently discarded before the
> interpreter starts. The library path is correct and ignored.

There is no way to make system Python work. **Use Homebrew Python.** This cost real
debugging time; it is recorded so it costs none the second time.

### Consequence: `python3` is the wrong interpreter

```
python3                      -> /usr/bin/python3          system, cannot render
/opt/homebrew/bin/python3    -> Homebrew, renders correctly
```

**Do not fix this by editing your shell profile.** Shell state is invisible,
machine-specific and un-reviewable — the same failure class as a canonical value living in
two places with nothing declaring authority.

Instead the repo declares its own interpreter, and the scripts fail with instructions:

```bash
npm run record:render -- customer_b.json
npm run record:simulate -- customer_b.json
npm run gap
```

Those resolve an interpreter that actually has WeasyPrint. Running the scripts by hand also
works, provided the path is explicit:

```bash
/opt/homebrew/bin/python3 records/render_record.py customer_b.json
```

`simulate_spine.py` and `confirmation_gap.py` are **pure standard library** and run under
any Python 3.9+, including the system one. Only rendering needs WeasyPrint.

---

## Linux / the VPS

Not yet installed on `srv1862778`. When it is:

```bash
sudo apt install -y libpango-1.0-0 libpangoft2-1.0-0 poppler-utils
pip install weasyprint==69.0 --break-system-packages
# then the same ~/.fonts + fc-cache -f steps as above
```

No SIP equivalent on Linux — the system Python works.

---

## Verification

```bash
npm run env:check
```

Confirms an interpreter with WeasyPrint 69.0, the two font families registered, and
`pdftoppm` present. Run it after any OS or Homebrew upgrade — a `brew upgrade` that moves
pango can break rendering without touching a line of code.

---

## Version note

Homebrew Python was 3.14.6 at install. WeasyPrint 69.0 is pinned deliberately: it is the
version `CLAUDE.md` specifies and the version every template in `records/` was QA'd
against. Do not float it. If it must move, re-render both records and compare page counts
and layout before accepting.
