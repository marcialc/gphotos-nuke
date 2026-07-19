const $ = id => document.getElementById(id);
const ack = $('ack'), limit = $('limit');
const startBtn = $('start'), stopBtn = $('stop'), trashLink = $('trashLink');
// Three mutually exclusive views: config (idle/error), running, done.
const cfgEls  = document.querySelectorAll('.cfg');
const runEls  = document.querySelectorAll('.run-only');
const doneEls = document.querySelectorAll('.done-only');

function syncStart() {
  startBtn.disabled = !ack.checked;
}
ack.addEventListener('change', syncStart);
syncStart();

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

let lastShown = null;   // last count rendered, to trigger the pop animation

function render(s) {
  if (!s) return;
  const view = s.status === 'running' ? 'run'
             : s.status === 'done'    ? 'done'
             : 'idle';   // idle or error both fall back to the config view

  cfgEls.forEach(el  => el.classList.toggle('hidden', view !== 'idle'));
  runEls.forEach(el  => el.classList.toggle('hidden', view !== 'run'));
  doneEls.forEach(el => el.classList.toggle('hidden', view !== 'done'));
  trashLink.classList.toggle('hidden', view === 'run');   // useful at rest and when done

  // Idle / error status block.
  $('n').textContent = (s.deleted || 0).toLocaleString();
  const msg = $('msg');
  msg.textContent = s.message || '';
  msg.classList.toggle('err', s.status === 'error');

  if (view === 'done') $('dnum').textContent = (s.deleted || 0).toLocaleString();

  if (view !== 'run') { lastShown = null; return; }

  // --- live progress panel ---
  const done = s.deleted || 0;
  const goal = s.goal || 0;
  const inFlight = s.inFlight || 0;

  const pnum = $('pnum');
  pnum.textContent = done.toLocaleString();
  if (lastShown !== null && done !== lastShown) {
    pnum.classList.remove('pop');
    void pnum.offsetWidth;          // restart the animation
    pnum.classList.add('pop');
  }
  lastShown = done;

  const bar = $('bar');
  if (goal > 0) {
    $('pgoal').textContent = ' / ' + goal.toLocaleString();
    const pct = Math.min(100, Math.round((done / goal) * 100));
    bar.classList.remove('indet');
    $('barfill').style.width = pct + '%';
    $('ppct').textContent = pct + '%';
  } else {
    $('pgoal').textContent = '';
    bar.classList.add('indet');
    $('barfill').style.width = '';
    $('ppct').textContent = '';
  }

  $('plabel').textContent = inFlight ? `Moving ${inFlight}…` : 'Working…';
  $('pmeta').textContent = 'moved to Trash';
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
      options: { limit: Number(limit.value) || 0 },
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

// "Delete more" — clear the done state and return to the config view.
$('again').addEventListener('click', async () => {
  const tab = await activeTab();
  try { await chrome.tabs.sendMessage(tab.id, { type: 'RESET' }); } catch (e) {}
  render({ status: 'idle', deleted: 0, message: 'Ready when you are.' });
});

// Progress lives in the content script; poll it so the popup can close and
// reopen mid-run without losing the count.
setInterval(async () => {
  const tab = await activeTab();
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    render(res?.state);
  } catch (e) { /* no content script on this tab — nothing to show */ }
}, 500);
