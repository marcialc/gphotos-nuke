# Photo Sweep — browser extension

A point-and-click version of the console scripts, for people who shouldn't have
to open DevTools.

It runs entirely inside your own browser, using the Google account you're
already signed in to. **It never asks for your password**, sends nothing to any
server, and has no account of its own. Anything that asks you for your Google
password to delete your photos is not safe — don't use it.

## What the user sees

1. Install the extension
2. Go to photos.google.com
3. Click the toolbar icon
4. Tick "I have a backup", pick a limit, press the button
5. Watch the counter; press Stop whenever

## Safety design

Deleting someone's entire photo library is not an undoable action, so the UI is
built to slow people down at the right moments:

- **The start button is locked** until the backup box is ticked.
- **"Count only" mode** runs the whole loop without selecting or deleting
  anything, so people can see the scale before committing.
- **"Stop after 50 photos"** is the default. Everything is an explicit choice
  further down the list, never the accident.
- **Trash reminder** — a direct link, plus an explanation that Trash holds
  items ~60 days and still uses storage until emptied.
- **Phone backup warning** shown before the button, not buried in a FAQ.
- **Progress survives the popup closing**, so nobody force-quits mid-run
  wondering whether it's still going.

Error messages name the fix rather than the cause: "Reload the Google Photos
tab, then try again", not "sendMessage failed".

## Loading it for testing

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Open <https://photos.google.com/> and click the icon

## Publishing to the Chrome Web Store

Realistically this is the only way non-technical people will ever install it —
"load unpacked" is not something you can ask a relative to do.

What's involved:

- One-time **$5 USD** developer registration
- Review typically takes a few days; expect longer for a first submission
- You'll need: 128×128 icon (included), at least one 1280×800 screenshot, a
  short and long description, and a privacy policy URL

**Write the privacy policy honestly and it becomes an asset:** this extension
collects nothing, transmits nothing, and requests only `storage`, `activeTab`,
`scripting`, and host access to `photos.google.com`. Reviewers scrutinise
broad host permissions, so the narrow scope here helps.

Be prepared for a rejection or two. A tool whose whole purpose is bulk-deleting
data from a Google product invites scrutiny. Things that help: an unambiguous
description, the confirmation gate, the count-only mode, and a clear statement
that deletions go to Trash and are recoverable for ~60 days.

## Firefox

The manifest is close to Firefox-compatible. The main changes: Firefox uses
`browser.*` (or the `webextension-polyfill` shim), and
`chrome.storage.session` support differs. Not done here — PRs welcome.

## When Google changes their UI

All fragile selectors are in the `SEL` block at the top of
[`content.js`](content.js). The extension surfaces breakage in plain language
("This extension likely needs an update") rather than failing silently, so
users know to check for a new version rather than assuming they did something
wrong.
