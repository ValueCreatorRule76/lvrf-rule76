# LVRF Brand Rules

Derived from the supplied artwork by measurement, not assumption. Canonical UI
tokens live in `CLAUDE.md`; this file governs the **logo** only.

---

## Assets

| File | Size | Use |
|---|---|---|
| `assets/lvrf-mark.png` | 1004 × 694 | The roundel with descriptors. Primary mark, rail headers. |
| `assets/rule76-lockup.png` | 996 × 328 | RULE\|76 with tagline. Parent-brand attribution, footers. |
| `assets/lvrf-full.png` | 1011 × 1022 | Complete lockup. Title pages, holding pages, covers. |
| `assets/lvrf-icon.png` | 1064 × 1064 | App icon master. Ring + LVRF only, descriptors stripped, squared. |
| `assets/lvrf-icon-{512,192,180,32}.png` | — | Derived sizes. 180 is `apple-touch-icon`; 32 is the favicon. |
| `lvrf-source-tm.png` | 1402 × 1122 | Corrected raster source (™). Working file, not for placement. |

All three are alpha-keyed from the supplied PNG. Feathering measured at 1.7%
(mark) and 3.2% (lockup) of pixels — a genuine anti-aliased edge, so they render
cleanly at small sizes on dark surfaces.

---

## Rule 1 — The logo is dark-surface only

The supplied artwork has **no alpha channel** and a background painted pure
`#000000`. The keyed versions above solve transparency, but the artwork itself is
still built for dark ground: gold and white metallic gradients have no contrast
on `#FAFAFA`.

- **Permitted:** `--ink` `#09090A`, `#000000`, or any surface below ~20%
  luminance.
- **Prohibited:** the off-white page, white cards, or any light surface.

In the workbench the mark lives in the ink rail. That is the only placement
currently sanctioned.

**Outstanding:** no light-surface variant exists. One is needed for the PDF
records, which are off-white — currently they use the typographic RULE**76**
mark instead, which is correct until artwork exists.

---

## Rule 2 — The flat gold token is validated by the artwork

Sampled from the logo's gold gradient:

| Point | Value |
|---|---|
| Darkest shadow | `#2C200E` |
| Common dark pole | `#AE7C34` |
| Common light pole | `#EDD071` |
| Brightest highlight | `#FFF697` |
| **Midpoint of the two poles** | **`#CDA653`** |
| **Canonical token `--gold`** | **`#C9A24A`** |

The flat token sits within five points per channel of the gradient's midpoint.
**The design system and the logo agree** — `--gold` is the correct flat
reduction of the metallic treatment. No change required.

---

## Rule 3 — The logo's "silver" is off-white, not silver

The LVRF letterforms read as silver but sample as `#FFFFFF`, `#FAFAFA`,
`#F9F9F9`, `#F6F6F6`. The token `--silver` `#C0C0C0` **does not appear anywhere
in the artwork.**

Consequence: any typographic treatment of the LVRF wordmark uses `--offwhite`
`#FAFAFA`, not `--silver`. Silver remains a legitimate UI token for borders and
dividers; it is not a brand colour of the wordmark.

---

## Rule 4 — Gradients belong to the logo and nowhere else

The artwork is metallic. The interface is flat. `CLAUDE.md` states "no
decorative stripes" and that discipline extends here:

- The **logo** may carry gradient. It is a fixed asset.
- **Nothing else may.** No gradient buttons, headers, badges, cards, or rules.

Without this stated, a gradient in the logo becomes licence for gradients in the
UI, and the flat institutional character is gone.

---

## Rule 5 — The lockup is RULE\|76 with a rule, not RULE76

The artwork sets a vertical rule between the word and the numerals, with the
word in white and the numerals in gold. Typographic reproductions must match:

```
RULE | 76      word in --offwhite, numerals in --gold, gold rule between
```

Earlier UI drafts set `RULE76` closed up with gold numerals. That was an
approximation made before the artwork was available, and it is superseded.

---

## Rule 6 — ™, not ®

*Decided 29 July 2026.* The supplied artwork asserted ® after *Learning Value
Realization Framework*. In the United States ® may only be used with a mark
actually registered with the USPTO; ™ is correct for unregistered or pending
marks.

**The symbol has been changed to ™** in `lvrf-source-tm.png` and all derived
assets. The ® glyph (14 × 14px, white) was removed and ™ set in Barlow SemiBold
at 24 × 13px, superscript, top-aligned to cap height with a 6px letterspace —
matching the original's optical weight.

**This is a raster edit and therefore interim.** The correct fix is in the source
vector, and the vector should be updated before the artwork is used at any size
larger than the assets here. If LVRF is later registered, ® becomes available
again — but that is a decision for counsel, not for this file.

---

## Rule 7 — The app icon carries no descriptors

The roundel's descriptor lines are illegible below roughly 96px, so the icon is
built from **the ring and the LVRF letterforms only.** The descriptor band was
removed algorithmically: on each row of that band the first and last ink runs are
the ring arcs, and everything strictly between them was cleared — 13,761 pixels.
The ring survives intact.

Measured coverage at 32px is 22% of the frame, which is within a workable range.

**Not visually verified.** Four letterforms inside a ring at 32px puts roughly
7px per character, which is at the edge of legibility. If LVRF does not read at
favicon size on a real screen, the icon should reduce further — most likely the
ring plus a single letterform, or the ring alone. **Look at it at 32px before
committing to it.**

---

## Open decisions — not resolved here

**1. The product is named "STUDIO" in the artwork.** The mark reads *LVRF ·
Learning Value Realization Framework · STUDIO*. Nothing else in the repo,
`CLAUDE.md`, or the amendments uses that name. Either the application is **LVRF
Studio** and the corpus needs updating, or the artwork carries a name the product
does not. **Requires a decision before any customer-facing surface ships.**

**2. STUDIO is artwork-only.** *Decided 29 July 2026.* The descriptor remains in
the lockup. It is **not** a product name and does not propagate to the repo,
`CLAUDE.md`, the amendments, or the schema. The framework is LVRF; the artwork
reads Studio.

---

## Version

| Version | Date | Description |
|---|---|---|
| 1.0.0 | 2026-07-29 | Established from the supplied artwork. Gold token validated; silver finding recorded; STUDIO and ® flagged as open. |
| 1.1.0 | 2026-07-29 | ® changed to ™ (Rule 6). STUDIO resolved as artwork-only. App icon built and rules recorded (Rule 7). Icon legibility at 32px unverified. |
