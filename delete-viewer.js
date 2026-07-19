/**
 * gphotos-nuke — bulk delete from the Google Photos FULLSCREEN VIEWER.
 *
 * Slower than delete-grid.js (~1 photo per 1.5-2s) but much more robust:
 * it touches no grid selectors, no virtualized scrolling, and no tile classes.
 * The viewer auto-advances to the next photo after a delete, so the page
 * does the navigation for us.
 *
 * Use this if delete-grid.js breaks after a Google UI change.
 *
 * HOW TO USE
 *   1. Open https://photos.google.com/ and click a photo to open it fullscreen.
 *      The URL should contain /photo/.
 *   2. Open DevTools console (Cmd+Opt+J / Ctrl+Shift+J).
 *   3. Paste this whole file, press Enter.
 *   4. To stop early, type:  stopDelete = true
 *
 * Deleted photos go to Trash for ~60 days.
 */

(async () => {
  // ==========================================================================
  // CONFIG
  // ==========================================================================
  const GAP       = 500;      // ms between cycles. Lower to ~200 to go faster.
  const MAX_TOTAL = Infinity; // safety cap. Set e.g. 20 for a first run.

  // ==========================================================================
  // SELECTORS  <-- patch here if Google changes the UI.
  //
  // Both buttons read "Move to trash". They are told apart by:
  //   - toolbar button: HAS aria-label="Move to trash"
  //   - dialog button:  NO aria-label; has data-mdc-dialog-action, and its
  //                     label text lives in span[jsname="V67aGc"]
  // ==========================================================================
  const SEL = {
    trashButton: 'button[aria-label="Move to trash"]',
    confirmDialogButton: 'button[data-mdc-dialog-action]',
    confirmText: 'Move to trash',
    confirmTextSpan: 'span[jsname="V67aGc"]',
  };

  // ==========================================================================
  window.stopDelete = false;
  const sleep = window.__keep || (ms => new Promise(r => setTimeout(r, ms)));

  if (!location.pathname.includes('/photo/')) {
    console.warn('Not in the fullscreen viewer — open a photo first ' +
                 '(URL should contain /photo/).');
    return;
  }

  const trashBtn = () => document.querySelector(SEL.trashButton);
  const confirmBtn = () =>
    [...document.querySelectorAll(SEL.confirmDialogButton)]
      .find(b => (b.querySelector(SEL.confirmTextSpan)?.textContent.trim()
               || b.textContent.trim()) === SEL.confirmText);

  const waitFor = async (fn, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(100); }
    return null;
  };

  console.log('Running. To stop: stopDelete = true');
  let n = 0;

  while (!window.stopDelete && n < MAX_TOTAL) {
    // The URL carries the photo ID and changes when the viewer advances.
    // That is a far better progress signal than any fixed delay.
    const urlBefore = location.href;

    const trash = await waitFor(trashBtn);
    if (!trash) { console.log(`No trash button — viewer likely closed. Done after ${n}.`); break; }
    trash.click();

    const confirm = await waitFor(confirmBtn);
    if (!confirm) { console.warn('Confirm dialog never appeared. Check SEL.confirm*. Stopping.'); break; }
    confirm.click();

    const advanced = await waitFor(() => location.href !== urlBefore, 8000);
    n++;

    if (!advanced) {
      console.log(`Deleted ${n}. URL unchanged — likely the last photo. Stopping.`);
      break;
    }
    if (!location.pathname.includes('/photo/')) {
      console.log(`Deleted ${n}. Left the viewer — section may be empty. Stopping.`);
      break;
    }

    console.log(`Deleted ${n}`);
    await sleep(GAP);
  }

  console.log(`Stopped. ${n} photo(s) deleted.`);
  console.log('They are in Trash for ~60 days — empty Trash to reclaim storage now.');
})();
undefined;
