# Photo Sweep Privacy Policy

Photo Sweep for Google Photos™ runs entirely in your browser.

## Data Handled

When you click Start, Photo Sweep reads the Google Photos page content in the
active tab so it can find photo tiles, select them, click the Move to Trash
button, and show progress in the popup.

This local page content may include photo labels, visible page structure, and
the current Google Photos URL. Photo Sweep does not ask for your Google
password, OAuth access, API tokens, or account credentials.

## Collection, Storage, and Sharing

Photo Sweep does not collect, store, sell, or share your Google Photos library
data. It does not send your photos, photo metadata, browsing activity, or usage
data to the developer or to any third party.

Progress is kept only in the content script running in the current tab. Closing
or reloading the Google Photos tab clears that state.

## Permissions

Photo Sweep requests `activeTab` so the popup can communicate with the current
tab, and host access to `https://photos.google.com/*` so its content script can
run only on Google Photos.

## Limited Use

Photo Sweep uses information from Google Photos only to provide its single
purpose: moving Google Photos items to Trash at your request. Use of information
received from Google APIs will adhere to the Chrome Web Store User Data Policy,
including the Limited Use requirements.

Google Photos is a trademark of Google LLC. Use of this trademark is subject to
Google Permissions.
