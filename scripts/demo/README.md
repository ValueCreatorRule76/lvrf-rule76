# LVRF demo recorder

A captioned, **read-only** walkthrough of LVRF: Skillsoft run 3's value case (general lens, then the CFO
lens's refusal) and Curia's point of view. It ends with a video file you can send.

On the Mac, with Google Chrome installed:

```sh
cd scripts/demo
npm install          # once (playwright-core only; it drives your installed Chrome and downloads no browser)
npm run rehearse     # a dry run, nothing recorded
npm run record       # the take: ~/Movies/LVRF demo/LVRF demo <date>.mp4 (or .webm without ffmpeg)
```

1. The terminal asks for the site's basic-auth pair, if any (or set `LVRF_BASIC_USER` / `LVRF_BASIC_PASS`).
2. A Chrome window opens. **Sign in yourself.** That window isn't recorded.
3. Once Accounts home appears, a second window opens and the recorded walkthrough runs by itself (about 2½ minutes).

**It cannot write.** The recorded session blocks every request that isn't a GET, and it never presses Print
(CLAUDE.md rules 9 and 10). Any blocked request is listed at the end.

Captions are in the `C` object at the top of `record.mjs`. `LVRF_DEMO_PACE=1.3` slows every pause,
`LVRF_SKILLSOFT_RUN_ID=<uuid>` skips finding run 3 in Runs, and `LVRF_URL` points it at a local copy.

**The finale** turns through the S3 prints page by page: Skillsoft's default lens and CFO lens, then Curia's POV.
It reads them as images from `~/lvrf-backups/demo-finale/`, rendered from the PDFs with
`pdftoppm -r 200 -png <pdf> <prefix>` (for example, `default-1.png`). After a reprint, re-render the pages and
the next take picks them up. Each stop is listed, with its zoom and caption, in `FINALE` in `record.mjs`.
