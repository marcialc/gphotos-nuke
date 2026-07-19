# gphotos-nuke

Bulk-delete your Google Photos library from the browser console. No extension,
no install, no API key, no third party touching your account.

Google Photos has no "select all" button, and its
[Library API cannot delete media items](#why-not-just-use-the-api) — so
automating the UI is the only route. These are two small console scripts that
do exactly that.

> [!WARNING]
> **This deletes your photos.** They go to Trash for ~60 days, but after that
> they are gone. Read [Before you run this](#before-you-run-this) first.
> Set `MAX_TOTAL` to a small number for your first run.

---

## Quick start

1. Open <https://photos.google.com/>
2. Open DevTools console — `Cmd+Opt+J` (Mac) / `Ctrl+Shift+J` (Windows/Linux)
3. Paste the contents of **[`delete-grid.js`](delete-grid.js)**, press Enter
4. To stop early, type `stopDelete = true`

To be safe on a first run, edit this line near the top before pasting:

```js
const MAX_TOTAL = 100;   // instead of Infinity
```

---

## Two scripts

| script | runs on | speed | robustness |
|---|---|---|---|
| **[`delete-grid.js`](delete-grid.js)** | main grid (`photos.google.com/`) | ~200 photos/cycle | depends on grid selectors |
| **[`delete-viewer.js`](delete-viewer.js)** | fullscreen viewer (`/photo/...`) | ~1 photo per 1.5–2s | very robust |

**Start with `delete-grid.js`.** It selects every visible tile, trashes them,
scrolls to load more, and repeats.

**Fall back to `delete-viewer.js`** if the grid one breaks after a Google UI
change. Open any photo fullscreen and run it: the viewer auto-advances to the
next photo after each delete, so it needs no tile selectors and no scrolling at
all. It's slower — roughly 30–40 photos/minute, so a 10,000-photo library is a
few hours of leaving the tab open — but it has far less that can break.

**[`keep-alive.js`](keep-alive.js)** is optional. Paste it *before* either
script if you need the tab to keep working while backgrounded. See
[Background tabs](#background-tabs-and-throttling).

### Prefer not to touch the console?

There's a point-and-click Chrome extension in **[`extension/`](extension/)**
with the same engine, plus a count-only mode and a confirmation gate. See its
[README](extension/README.md) for install steps.

---

## Before you run this

**Back up first if you want to keep anything.** [Google
Takeout](https://takeout.google.com) exports your whole library. Download it and
verify the archive opens *before* you delete.

**Turn off backup on your phone first** if you want to keep local copies.
Deletions made here can sync back to devices that have Google Photos backup
enabled.

**Deleted items sit in Trash for ~60 days.** They still count against storage
until Trash is emptied. To reclaim space immediately, empty Trash manually
after the script finishes.

**This drives your own logged-in session.** Nothing is sent anywhere, no
credentials are handled, and no third-party service is involved. But it is
clicking real delete buttons on your real account — there is no undo beyond
Trash.

---

## When it breaks

It will break eventually. Google rotates its obfuscated CSS class names, and
the grid script depends on one (`ckGgle`).

Every fragile selector lives in a single clearly-marked `SEL` block at the top
of each file. The scripts also self-diagnose: they print
`clicked N -> M selected` each cycle, and stop with a specific message naming
which selector failed rather than dying silently.

**To re-find a selector:**

| what | how |
|---|---|
| tile checkbox | Hover a photo → right-click its round select circle → Inspect. Look for `<div role="checkbox" class="… ckGgle">` with an aria-label like `Photo - Landscape - Feb 23, 2023, 7:40 PM` |
| trash button | Select a photo → Inspect the trash icon in the top bar. Has `aria-label="Move to trash"` |
| confirm button | In the dialog. Has **no** aria-label — matched by `data-mdc-dialog-action` plus its inner `span[jsname="V67aGc"]` text |

Prefer `aria-label`, `jsname`, and `data-*` attributes over CSS classes when
patching. The classes rotate; the accessibility attributes rarely do.

### Common symptoms

**`clicked 200 -> 0 selected`** — the tile selector is matching the wrong
element, or nodes are being replaced between query and click. Check `SEL.tile`.

**`clicked 200 -> 40 selected`** — clicks are outrunning the UI. Raise
`CLICK_GAP` to 50–100.

**Stops after one cycle** — usually the grid hadn't finished re-rendering.
Raise `SETTLE`.

**`RpcError` / `CUIERROR26` in console** — this is Google Photos' own code, not
the script. It means a request outran the previous one. Harmless as long as
photos keep disappearing; if it fires every cycle and deletions stall, raise
the delays.

**Nothing found at all** — check you're not accidentally in the fullscreen
viewer (URL contains `/photo/`). The scripts guard against this and tell you.

---

## Background tabs and throttling

Chrome throttles timers in **hidden** tabs — clamped to ~1/second, and after
~5 minutes hidden, down to roughly 1/minute.

What matters is *visibility, not focus*. A window that's on screen but not
active still runs full speed. **The simplest fix is to pop Photos into its own
window and leave it visible** — even a sliver showing is enough, since Chrome
marks fully-covered windows as hidden.

If you need it genuinely backgrounded, paste [`keep-alive.js`](keep-alive.js)
first. It plays a near-silent tone (audible tabs are exempt from the worst
throttling tier) and runs timers in a Worker. Note that Google Photos enforces
Trusted Types, which blocks the usual blob-URL Worker trick — the script
launders it through a Trusted Types policy and degrades gracefully if the CSP
refuses.

Bulletproof alternative — relaunch Chrome with:

```bash
--disable-background-timer-throttling \
--disable-backgrounding-occluded-windows \
--disable-renderer-backgrounding
```

---

## Why not just use the API?

Two independent blockers:

1. **The Google Photos Library API has no delete endpoint.** There is no method
   to permanently delete or even trash a media item.
2. **Since 31 March 2025, the broad `photoslibrary` scope is gone.** Apps can
   only list and retrieve media *their own app created*. A script you write
   cannot even see photos already in your library. Google directs you to the
   Picker API, which requires manually picking each photo through a
   Google-hosted UI — which rather defeats the purpose.

So: the API can't see your existing photos, and has no delete call. UI
automation is what's left.

---

## Related projects

This is a crowded space — check these too, one may suit you better:

- [shtse8/Google-Photos-Delete-Tool](https://github.com/shtse8/Google-Photos-Delete-Tool) — Chrome extension, dry-run mode, live stats
- [JuliusBairaktaris/Google-Photos-Deletion-Script](https://github.com/JuliusBairaktaris/Google-Photos-Deletion-Script) — console script with stall detection
- [moorer2k/delete-all-google-photos](https://github.com/moorer2k/delete-all-google-photos) — minimal version

`gphotos-nuke`'s angle is a viewer-based fallback that survives grid selector
changes, plus explicit self-diagnosis when things break.

---

## Contributing

Selector fixes are the most valuable PRs. Please include the browser, the date,
and what the element looked like when you found it.

## License

MIT — see [LICENSE](LICENSE). Provided as-is, with no warranty. You are running
this against your own account at your own risk.

Not affiliated with or endorsed by Google.
