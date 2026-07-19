import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shot = process.argv[2] || 'ready';
const repo = resolve(new URL('.', import.meta.url).pathname, '..');
const extensionDir = resolve(repo, 'extension');
const capturePath = resolve(repo, 'screenshots/capture.html');
const popupPath = resolve(extensionDir, 'popup.html');
const popupJsPath = resolve(extensionDir, 'popup.js');
const outPath = `/private/tmp/gphotos-nuke-screenshot-${shot}.html`;

const chromeStub = `
<script>
window.chrome = {
  tabs: {
    query: async () => [{ id: 1, url: 'https://photos.google.com/' }],
    sendMessage: async () => ({ state: null }),
    create: () => {},
  },
};
</script>`;

const popupJs = readFileSync(popupJsPath, 'utf8');
let popupHtml = readFileSync(popupPath, 'utf8')
  .replace('<head>', `<head><base href="file://${extensionDir}/">`)
  .replace(
    '<script src="popup.js"></script>',
    `${chromeStub}<script>${popupJs}</script>`
  );

const srcdoc = popupHtml
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;');

// Bake the shot key into the page so file:// opens don't need a query string.
const captureHtml = readFileSync(capturePath, 'utf8')
  .replace(
    '<iframe id="popup" src="../extension/popup.html"></iframe>',
    `<iframe id="popup" srcdoc="${srcdoc}"></iframe>`
  )
  .replace(
    'const shot = SHOTS[params.get(\'shot\')] || SHOTS.ready;',
    `const shot = SHOTS[${JSON.stringify(shot)}] || SHOTS.ready;`
  );

writeFileSync(outPath, captureHtml);
console.log(outPath);
