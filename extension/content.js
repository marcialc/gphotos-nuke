/**
 * Photo Sweep — content script (the engine).
 *
 * Runs in an isolated world on photos.google.com. Receives start/stop messages
 * from the popup and reports progress back through chrome.storage.session, so
 * progress survives the popup being closed.
 *
 * All fragile selectors live in SEL below. If Google changes their UI, this is
 * the only block that should need patching.
 */

// ============================================================================
// SELECTORS — patch here when Google changes the UI.
//
//  tile:    hover a photo, Inspect its round select circle. Expect
//           <div role="checkbox" class="… ckGgle"> with aria-label like
//           "Photo - Landscape - Feb 23, 2023, 7:40 PM"
//  trash:   select a photo, Inspect the trash icon in the top bar.
//  confirm: in the dialog. Has NO aria-label — matched by dialog action attr
//           plus its inner span text.
// ============================================================================
const SEL = {
  tile: 'div.ckGgle[role="checkbox"][aria-checked="false"]',
  tileAny: 'div.ckGgle',
  tileChecked: 'div.ckGgle[role="checkbox"][aria-checked="true"]',
  tileLabelPrefix: 'Photo - ',
  trashButton: 'button[aria-label="Move to trash"]',
  confirmDialogButton: 'button[data-mdc-dialog-action]',
  confirmText: 'Move to trash',
  confirmTextSpan: 'span[jsname="V67aGc"]',
};

const CFG = {
  maxPerCycle: 200,   // Google has a selection ceiling; >200 can partly apply
  clickGap: 25,       // ms between tile clicks
  gap: 500,           // ms between cycles
  settle: 1000,       // ms for the grid to re-render after a delete
};

let running = false;
let state = { status: 'idle', deleted: 0, cycles: 0, message: '' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

function publish(patch) {
  state = { ...state, ...patch };
  try { chrome.storage.session.set({ sweepState: state }); } catch (e) {}
}

// Google's UI binds jsaction handlers to mousedown AND click. A bare .click()
// can no-op, so dispatch the full pointer sequence.
function realClick(el) {
  const r = el.getBoundingClientRect();
  const o = {
    bubbles: true, cancelable: true, composed: true,
    clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0,
  };
  el.dispatchEvent(new PointerEvent('pointerover', o));
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  el.dispatchEvent(new MouseEvent('mousedown', o));
  el.dispatchEvent(new PointerEvent('pointerup', o));
  el.dispatchEvent(new MouseEvent('mouseup', o));
  el.dispatchEvent(new MouseEvent('click', o));
}

const tiles = () =>
  [...document.querySelectorAll(SEL.tile)]
    .filter(e => (e.getAttribute('aria-label') || '').startsWith(SEL.tileLabelPrefix));

const checkedCount = () => document.querySelectorAll(SEL.tileChecked).length;
const trashBtn = () => document.querySelector(SEL.trashButton);
const confirmBtn = () =>
  [...document.querySelectorAll(SEL.confirmDialogButton)].find(b =>
    (b.querySelector(SEL.confirmTextSpan)?.textContent.trim()
      || b.textContent.trim()) === SEL.confirmText);

async function waitFor(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(100); }
  return null;
}
async function waitGone(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (!fn()) return true; await sleep(100); }
  return false;
}

// Scroll by pushing the last loaded tile into view — works regardless of which
// element is the real scroll container (the grid is virtualized).
async function scrollDown() {
  const before = document.querySelectorAll(SEL.tileAny).length;
  [...document.querySelectorAll(SEL.tileAny)].at(-1)?.scrollIntoView({ block: 'center' });
  window.scrollBy(0, window.innerHeight * 2);
  await sleep(800);
  return document.querySelectorAll(SEL.tileAny).length > before;
}

async function run({ limit, dryRun }) {
  if (running) return;
  running = true;
  publish({ status: 'running', deleted: 0, cycles: 0, message: dryRun ? 'Counting…' : 'Starting…' });

  if (location.pathname.includes('/photo/')) {
    publish({ status: 'error', message: 'Close the open photo first, then try again.' });
    running = false;
    return;
  }

  const cap = limit || Infinity;
  let total = 0, cycles = 0, dead = 0;

  // Preflight: force lazy-load if nothing is on screen yet.
  if (tiles().length === 0) {
    publish({ message: 'Loading your photos…' });
    await scrollDown(); await scrollDown();
    if (tiles().length === 0) {
      publish({
        status: 'error',
        message: 'No photos found. If your library is not empty, this extension likely needs an update.',
      });
      running = false;
      return;
    }
  }

  while (running && total < cap) {
    const batch = tiles().slice(0, Math.min(CFG.maxPerCycle, cap - total));

    if (!batch.length) {
      if (await scrollDown()) { dead = 0; continue; }
      if (++dead < 3) continue;
      publish({ status: 'done', message: dryRun ? 'Count complete.' : 'All done.' });
      running = false;
      return;
    }
    dead = 0;

    if (dryRun) {
      // Count only: never select, never delete. Just scroll through.
      total += batch.length;
      publish({ deleted: total, message: `Counted ${total} so far…` });
      if (!(await scrollDown())) {
        publish({ status: 'done', message: `Found about ${total} photos. Nothing was deleted.` });
        running = false;
        return;
      }
      continue;
    }

    for (const el of batch) {
      if (!running) break;
      if (el.isConnected) realClick(el);
      await sleep(CFG.clickGap);
    }
    if (!running) break;

    const sel = checkedCount();
    if (sel === 0) {
      publish({ status: 'error', message: 'Could not select photos. This extension likely needs an update.' });
      running = false;
      return;
    }

    const trash = await waitFor(trashBtn);
    if (!trash) {
      publish({ status: 'error', message: 'Could not find the delete button. This extension likely needs an update.' });
      running = false;
      return;
    }
    trash.click();

    const confirm = await waitFor(confirmBtn);
    if (!confirm) {
      publish({ status: 'error', message: 'Google did not show the confirmation dialog. Try again in a moment.' });
      running = false;
      return;
    }
    confirm.click();

    await waitGone(trashBtn);      // toolbar clearing = the delete committed
    await sleep(CFG.settle);

    total += sel;
    cycles++;
    publish({ deleted: total, cycles, message: `Moved ${total} photos to Trash…` });

    await sleep(CFG.gap);
    await scrollDown();
  }

  publish({
    status: 'done',
    message: running ? 'Reached your limit.' : `Stopped. ${total} moved to Trash.`,
  });
  running = false;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'START') { run(msg.options || {}); reply({ ok: true }); }
  if (msg.type === 'STOP')  { running = false; publish({ status: 'idle', message: 'Stopping…' }); reply({ ok: true }); }
  if (msg.type === 'PING')  { reply({ ok: true, state }); }
  return true;
});
