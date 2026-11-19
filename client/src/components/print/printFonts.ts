/**
 * S3 Gate C finding (Brad, 19 Nov 2026): the faces only a print uses are loaded when the app starts, not when the
 * print lays out. Barlow Condensed sets the record line, the kicker, the labels and the tagline, and nothing on screen
 * uses it, so the browser fetched it only when the print began, and the print did not wait: Brad's first print of
 * run 3 had no record line. Loading it at start covers every way to print (the case's Print button, and ⌘P on any
 * page); the Print button also waits for it (printFontsReady) before it opens the dialog.
 */
const PRINT_FACES = ['400 8pt "Barlow Condensed"', '600 8pt "Barlow Condensed"'];

let loading: Promise<unknown> | null = null;

/** Starts loading the print-only faces; called once at start. Never throws: a face that fails prints in the fallback. */
export function loadPrintFonts(): Promise<unknown> {
  if (!loading) loading = Promise.all(PRINT_FACES.map((f) => document.fonts.load(f).catch(() => null)));
  return loading;
}

/** Resolves when the print-only faces have loaded (or failed), so a print never lays them out unloaded. */
export async function printFontsReady(): Promise<void> {
  await loadPrintFonts();
  await document.fonts.ready;
}
