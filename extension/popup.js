const $ = id => document.getElementById(id);
const ack = $('ack'), dry = $('dry'), limit = $('limit');
const startBtn = $('start'), stopBtn = $('stop');

function syncStart() {
  // Counting is harmless, so it doesn't require the backup acknowledgement.
  startBtn.disabled = !(ack.checked || dry.checked);
  startBtn.textContent = dry.checked ? 'Count photos' : 'Move photos to Trash';
}
ack.addEventListener('change', syncStart);
dry.addEventListener('change', syncStart);
syncStart();

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function render(s) {
  if (!s) return;
  $('n').textContent = (s.deleted || 0).toLocaleString();
  const msg = $('msg');
  msg.textContent = s.message || '';
  msg.classList.toggle('err', s.status === 'error');
  const busy = s.status === 'running';
  stopBtn.classList.toggle('hidden', !busy);
  startBtn.classList.toggle('hidden', busy);
}

startBtn.addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab.url?.startsWith('https://photos.google.com/')) {
    render({ status: 'error', message: 'Open photos.google.com in this tab first.' });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'START',
      options: { limit: Number(limit.value) || 0, dryRun: dry.checked },
    });
  } catch (e) {
    render({ status: 'error', message: 'Reload the Google Photos tab, then try again.' });
  }
});

stopBtn.addEventListener('click', async () => {
  const tab = await activeTab();
  try { await chrome.tabs.sendMessage(tab.id, { type: 'STOP' }); } catch (e) {}
});

$('trashLink').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://photos.google.com/trash' });
});

// Progress lives in the content script, so the popup can close and reopen
// mid-run without losing the count.
setInterval(async () => {
  const { sweepState } = await chrome.storage.session.get('sweepState');
  render(sweepState);
}, 500);
chrome.storage.session.get('sweepState').then(r => render(r.sweepState));
