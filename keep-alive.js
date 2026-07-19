/**
 * gphotos-nuke — OPTIONAL keep-alive prelude.
 *
 * Chrome throttles timers in HIDDEN tabs (clamped to ~1/second, and after
 * ~5 minutes hidden, down to roughly 1/minute under "intensive throttling").
 * That can stall a long delete run.
 *
 * NOTE: what matters is VISIBILITY, not focus. A window that is on screen but
 * not the active window still runs at full speed. The simplest fix is to pop
 * Photos into its own window and leave it visible (even a sliver showing —
 * Chrome marks fully-covered windows as hidden).
 *
 * If you need it truly in the background, paste THIS FILE FIRST, then paste
 * delete-grid.js or delete-viewer.js. They automatically pick up window.__keep.
 *
 * What it does:
 *   1. Plays a near-silent tone so the tab counts as "audible" — audible tabs
 *      are exempt from intensive throttling. (Look for the speaker icon on the
 *      tab. If it doesn't appear, autoplay policy blocked it: click the page
 *      once and re-run.)
 *   2. Runs timers inside a Worker, which are far less aggressively clamped
 *      than main-thread setTimeout.
 *
 * Caveat: the DOM work still runs on the main thread, so this reduces
 * throttling rather than eliminating it. And Google Photos' own lazy-loading
 * can pause in hidden tabs regardless of your timers — no keep-alive fixes
 * that. The throttle warnings below tell you which problem you have.
 *
 * Bulletproof alternative — relaunch Chrome with:
 *   --disable-background-timer-throttling
 *   --disable-backgrounding-occluded-windows
 *   --disable-renderer-backgrounding
 */

window.__keep = (() => {
  // 1. inaudible audio -> tab counts as audible
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    gain.gain.value = 0.0001;          // inaudible, but not digital silence
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    ctx.resume();
  } catch (e) {
    console.warn('audio keep-alive failed:', e.message);
  }

  // 2. worker-based timer.
  // Google Photos enforces Trusted Types, which blocks passing a raw blob URL
  // to new Worker(). We launder it through a Trusted Types policy, trying a
  // few policy names since the CSP may disallow some.
  const src = `let t; onmessage = e => { clearTimeout(t); t = setTimeout(() => postMessage(e.data.id), e.data.ms); };`;
  let worker = null;
  try {
    const blobUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    let url = blobUrl;
    if (window.trustedTypes?.createPolicy) {
      let policy;
      for (const name of ['keepalive', 'default', 'goog#html']) {
        try { policy = trustedTypes.createPolicy(name, { createScriptURL: s => s }); break; }
        catch (e) { /* name disallowed or taken — try the next */ }
      }
      if (policy) url = policy.createScriptURL(blobUrl);
      else throw new Error('no usable Trusted Types policy');
    }
    worker = new Worker(url);
  } catch (e) {
    console.warn('Worker blocked (' + e.message + ') — falling back to setTimeout. ' +
                 'The audio trick still handles the worst throttling tier.');
  }

  if (!worker) return ms => new Promise(r => setTimeout(r, ms));

  const pending = new Map();
  let seq = 0;
  worker.onmessage = e => {
    const r = pending.get(e.data);
    if (r) { pending.delete(e.data); r(); }
  };
  return ms => new Promise(res => {
    const id = ++seq;
    pending.set(id, res);
    worker.postMessage({ id, ms });
  });
})();

// 3. throttle monitor: should tick ~every 1s. Big gaps mean you're throttled.
(async () => {
  let last = Date.now();
  while (!window.stopDelete) {
    await window.__keep(1000);
    const d = Date.now() - last;
    last = Date.now();
    if (d > 2000) console.warn(`throttled: ${d}ms gap, visibility=${document.visibilityState}`);
  }
})();

console.log('keep-alive active. Now paste delete-grid.js or delete-viewer.js.');
undefined;
