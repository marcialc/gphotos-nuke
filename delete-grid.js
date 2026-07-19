/**
 * gphotos-nuke — bulk delete from the Google Photos GRID view.
 *
 * HOW TO USE
 *   1. Open https://photos.google.com/ (the main grid, NOT a fullscreen photo).
 *   2. Open DevTools console (Cmd+Opt+J / Ctrl+Shift+J).
 *   3. Paste this whole file, press Enter.
 *   4. To stop early, type:  stopDelete = true
 *
 * Deleted photos go to Trash for ~60 days. Empty Trash to reclaim storage.
 *
 * FIRST RUN: set MAX_TOTAL to something small (e.g. 100) and watch it work
 * before letting it loose on your whole library.
 */

(async () => {
  // ==========================================================================
  // CONFIG
  // ==========================================================================
  const MAX_PER_CYCLE = 200;   // photos selected per delete cycle. Google has a
                               // selection ceiling; >200 can partially apply.
  const MAX_TOTAL     = Infinity; // safety cap. Set e.g. 100 for a first run.
  const CLICK_GAP     = 25;    // ms between tile clicks. Raise to 50-100 if the
                               // "clicked N -> M selected" numbers don't match.
  const GAP           = 500;   // ms between cycles.
  const SETTLE        = 1000;  // ms to let the grid re-render after a delete.

  // ==========================================================================
  // SELECTORS  <-- IF THIS SCRIPT BREAKS, IT IS ALMOST CERTAINLY THIS BLOCK.
  //
  // Google rotates its obfuscated CSS class names. To re-find them:
  //   - Tile checkbox: hover a photo, right-click its round select circle,
  //     Inspect. Look for a <div role="checkbox" class="... ckGgle">.
  //     Its aria-label looks like "Photo - Landscape - Feb 23, 2023, 7:40 PM".
  //   - Trash button: select a photo, then Inspect the trash icon in the top
  //     bar. It carries aria-label="Move to trash".
  //   - Confirm button: lives in the dialog, has NO aria-label. It is matched
  //     by data-mdc-dialog-action + its inner span text "Move to trash".
  //
  // aria-label / jsname / data-* attributes are far more durable than classes.
  // Prefer them when patching.
  // ==========================================================================
  const SEL = {
    tile:        'div.ckGgle[role="checkbox"][aria-checked="false"]',
    tileAny:     'div.ckGgle',
    tileChecked: 'div.ckGgle[role="checkbox"][aria-checked="true"]',
    tileLabelPrefix: 'Photo - ',   // excludes the "Select all photos from…" headers
    trashButton: 'button[aria-label="Move to trash"]',
    confirmDialogButton: 'button[data-mdc-dialog-action]',
    confirmText: 'Move to trash',
    confirmTextSpan: 'span[jsname="V67aGc"]',
  };

  // ==========================================================================
  // GUARDS
  // ==========================================================================
  window.stopDelete = false;
  const sleep = window.__keep || (ms => new Promise(r => setTimeout(r, ms)));

  if (location.pathname.includes('/photo/')) {
    console.warn('You are in the fullscreen viewer. Press Escape (or use ' +
                 'delete-viewer.js instead), then re-run this.');
    return;
  }
  if (!location.hostname.includes('photos.google.com')) {
    console.warn('Not on photos.google.com.');
    return;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  // Google's UI wires handlers via jsaction on mousedown AND click.
  // A bare .click() sometimes no-ops, so dispatch the full pointer sequence.
  const realClick = el => {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true,
                clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
                pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerover', o));
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  };

  const tiles = () =>
    [...document.querySelectorAll(SEL.tile)]
      .filter(e => (e.getAttribute('aria-label') || '').startsWith(SEL.tileLabelPrefix));

  const checkedCount = () => document.querySelectorAll(SEL.tileChecked).length;

  const trashBtn = () => document.querySelector(SEL.trashButton);

  const confirmBtn = () =>
    [...document.querySelectorAll(SEL.confirmDialogButton)]
      .find(b => (b.querySelector(SEL.confirmTextSpan)?.textContent.trim()
               || b.textContent.trim()) === SEL.confirmText);

  // Poll for a condition instead of blind-waiting: self-correcting on slow loads.
  const waitFor = async (fn, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(100); }
    return null;
  };
  const waitGone = async (fn, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (!fn()) return true; await sleep(100); }
    return false;
  };

  // Scroll by pushing the last loaded tile into view. Works regardless of which
  // element is the real scroll container (Photos' grid is virtualized and the
  // scroller's class name is unstable). Returns true if new tiles loaded.
  const scrollDown = async () => {
    const before = document.querySelectorAll(SEL.tileAny).length;
    [...document.querySelectorAll(SEL.tileAny)].at(-1)?.scrollIntoView({ block: 'center' });
    window.scrollBy(0, window.innerHeight * 2);
    await sleep(800);
    return document.querySelectorAll(SEL.tileAny).length > before;
  };

  // ==========================================================================
  // PREFLIGHT
  // ==========================================================================
  console.log(`preflight: ${tiles().length} selectable tile(s) on screen`);
  if (tiles().length === 0) {
    console.log('None found — scrolling to force lazy-load…');
    await scrollDown(); await scrollDown();
    console.log(`after scroll: ${tiles().length} tile(s)`);
    if (tiles().length === 0) {
      console.warn('Still nothing. Sample of what IS on the page:');
      [...document.querySelectorAll('[role="checkbox"],[aria-checked]')].slice(0, 8)
        .forEach((e, i) => console.log(i, e.getAttribute('aria-label'), e));
      console.warn('See the SELECTORS block above — they likely need updating.');
      return;
    }
  }

  // ==========================================================================
  // MAIN LOOP
  // ==========================================================================
  console.log('Running. To stop: stopDelete = true');
  let cycles = 0, total = 0, dead = 0;

  while (!window.stopDelete && total < MAX_TOTAL) {
    const room = Math.min(MAX_PER_CYCLE, MAX_TOTAL - total);
    const batch = tiles().slice(0, room);

    if (!batch.length) {
      if (await scrollDown()) { dead = 0; continue; }
      if (++dead < 3) continue;              // give lazy-load a couple of tries
      console.log('No tiles left — done.'); break;
    }
    dead = 0;

    // SELECT
    for (const el of batch) {
      if (el.isConnected) realClick(el);     // skip nodes detached by re-render
      await sleep(CLICK_GAP);
    }

    // Verify the selection actually took, rather than assuming.
    const sel = checkedCount();
    console.log(`  clicked ${batch.length} -> ${sel} selected`);
    if (sel === 0) {
      console.warn('Selection did not register. Check SEL.tile. Stopping.');
      break;
    }

    // TRASH
    const trash = await waitFor(trashBtn);
    if (!trash) { console.warn('No trash button despite selection. Check SEL.trashButton. Stopping.'); break; }
    trash.click();

    // CONFIRM
    const confirm = await waitFor(confirmBtn);
    if (!confirm) { console.warn('Confirm dialog never appeared. Check SEL.confirm*. Stopping.'); break; }
    confirm.click();

    // The toolbar clearing is the browser's own signal that the delete
    // committed. Waiting on it beats any fixed delay.
    await waitGone(trashBtn);
    await sleep(SETTLE);

    total += sel;
    console.log(`Cycle ${++cycles}: deleted ~${sel} (total ~${total}).`);
    await sleep(GAP);
    await scrollDown();
  }

  console.log(`Stopped after ${cycles} cycle(s), ~${total} photo(s).`);
  console.log('They are in Trash for ~60 days — empty Trash to reclaim storage now.');
})();
undefined;
