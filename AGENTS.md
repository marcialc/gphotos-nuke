# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## What this is

Bulk-deletes a Google Photos library by driving the real web UI. There is no build system, no package manager, no dependencies, and no test suite — everything is hand-written vanilla JS loaded either by pasting into the DevTools console or by Chrome's extension loader.

Two blockers force the UI-automation approach (documented in README.md § "Why not just use the API?"): the Photos Library API has no delete endpoint, and since 31 March 2025 the broad `photoslibrary` scope only exposes media the calling app itself created. Don't propose an API-based rewrite.

## Running / testing

Console scripts — open <https://photos.google.com/>, open DevTools console, paste the whole file. Each file ends with a bare `undefined;` so the console doesn't echo the async IIFE's promise.

Extension — `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/`. After editing `content.js` you must reload the extension *and* reload the Google Photos tab (the content script is injected at `document_idle`).

There is no automated testing. Verification means running against a real logged-in account, which deletes real photos. Always test with a small `MAX_TOTAL` / limit value.

## Architecture

Four entry points, three of which share one duplicated engine:

| file | context | notes |
|---|---|---|
| `delete-grid.js` | console, main grid | primary path; batch-selects tiles, trashes, scrolls |
| `delete-viewer.js` | console, `/photo/` viewer | fallback; no tile selectors, no scrolling, viewer auto-advances |
| `keep-alive.js` | console prelude | optional; exports `window.__keep` |
| `extension/content.js` | extension | same engine as `delete-grid.js` plus popup messaging |

**The engine is deliberately duplicated.** `delete-grid.js` and `extension/content.js` contain near-identical `SEL`, `realClick`, `tiles`, `waitFor`, `waitGone`, and `scrollDown` implementations. This is not an accident to be refactored — the console scripts must stay standalone copy-pasteable single files with zero imports. **A selector or timing fix in one must be mirrored in the other**; `delete-viewer.js` shares the trash/confirm half of `SEL` and needs the same treatment.

**Every fragile selector lives in a `SEL` block at the top of each file.** Google rotates obfuscated CSS class names (`ckGgle` is the current tile class), so patching should be confined there. Prefer `aria-label`, `jsname`, and `data-*` attributes over classes — the accessibility attributes rarely rotate. README.md § "When it breaks" documents how to re-find each selector.

**Distinguishing the two "Move to trash" buttons** is the subtlest part: the toolbar button has `aria-label="Move to trash"`; the dialog confirm button has *no* aria-label and is matched by `data-mdc-dialog-action` plus its inner `span[jsname="V67aGc"]` text.

### Load-bearing patterns

- **`realClick()`** dispatches the full pointerover → pointerdown → mousedown → pointerup → mouseup → click sequence. Google binds `jsaction` handlers to mousedown as well as click, so a bare `.click()` sometimes no-ops. Don't simplify it.
- **Poll, don't sleep.** `waitFor` / `waitGone` watch for actual UI signals — the trash button appearing, the toolbar clearing after a commit, the viewer's URL changing to the next photo ID. These self-correct on slow loads where fixed delays don't.
- **Verify, don't assume.** Each cycle re-counts `aria-checked="true"` tiles and logs `clicked N -> M selected`. A mismatch is the diagnostic signal that a selector broke, and the loop stops with a message naming which one.
- **`scrollDown()`** works by calling `scrollIntoView()` on the last loaded tile rather than targeting a scroll container — the grid is virtualized and the scroller's class is unstable. It returns whether new tiles appeared, which is how the loop knows the library is exhausted (three consecutive dead scrolls).
- **`MAX_PER_CYCLE = 200`** is a real Google ceiling, not a guess. Higher values partially apply.

### Extension specifics

- Progress state lives in the content script's `state` variable; the popup polls it every 500ms by sending a `PING` message and rendering the returned `state`. The popup can be closed and reopened mid-run without losing the count. Note it does *not* survive a tab reload — a reloaded tab gets a fresh content script. `chrome.storage.session` was tried for this and removed: it defaults to `TRUSTED_CONTEXTS`, which silently excludes content-script writes.
- Permissions are intentionally narrow: `activeTab` and host access to `photos.google.com` only. Adding permissions has a real Chrome Web Store review cost — see `extension/README.md`.

## Conventions

**Error messages differ by audience.** Console scripts name the failing selector (`Check SEL.tile. Stopping.`) so a developer can patch it. The extension names the user's next action instead ("This extension likely needs an update", "Reload the Google Photos tab, then try again") — never the internal cause.

**Safety gates in the extension are product decisions, not incidental UI**: the start button stays locked until the backup box is ticked, "Stop after 50 photos" is the default, and count-only mode bypasses the acknowledgement because counting is harmless. Don't relax these.

Both READMEs are unusually detailed and are part of the product. Selector changes, timing-constant changes, and new failure modes should be reflected in README.md § "When it breaks".
