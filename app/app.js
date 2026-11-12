import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000;

const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');
const status = document.querySelector('[data-testid="status"]');

const acked = new Set();
const pending = new Set();

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Viewer's locale and zone decide the order (dd/mm or mm/dd) and the clock; the UTC value stays in datetime.
const timeFmt = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const localTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFmt.format(d);
};

function rowEl(i) {
  const li = document.createElement('li');
  li.dataset.testid = 'incident-row';
  li.dataset.id = i.id;
  li.className = `row ${i.severity}`;
  li.innerHTML = `
        <span class="id">${esc(i.id)}</span>
        <span class="sev">${esc(i.severity)}</span>
        <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
        <time datetime="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time>
        ${
          acked.has(i.id)
            ? '<span data-testid="acked" class="acked">acked</span>'
            : '<button type="button" data-testid="ack" class="ack">Ack</button>'
        }`;
  return li;
}

// Rows already on screen are never rebuilt: a new incident is inserted at the top and the rest stay put,
// so a row under the pointer, a focused button or an open confirm is not torn down by a refresh.
function render(incidents) {
  const have = new Map([...list.children].map((li) => [li.dataset.id, li]));
  const want = new Set(incidents.map((i) => i.id));
  for (const [id, li] of have) if (!want.has(id)) li.remove();
  incidents.forEach((i, at) => {
    const li = have.get(i.id) ?? rowEl(i);
    if (list.children[at] !== li) list.insertBefore(li, list.children[at] ?? null);
  });
  empty.hidden = incidents.length > 0;
}

// Ack asks first: the confirm is fixed on screen (it never moves with the list) and names the incident id.
const confirmBox = document.querySelector('[data-testid="confirm"]');
const confirmText = confirmBox.querySelector('.confirm-text');
const confirmAck = confirmBox.querySelector('[data-testid="confirm-ack"]');
const confirmCancel = confirmBox.querySelector('[data-testid="confirm-cancel"]');
let asking = null;

function ask(id) {
  asking = id;
  confirmText.textContent = `Ack ${id}?`;
  confirmBox.dataset.id = id;
  confirmBox.hidden = false;
  confirmAck.focus();
}

function closeConfirm() {
  asking = null;
  confirmBox.hidden = true;
  delete confirmBox.dataset.id;
}

list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  ask(btn.closest('[data-testid="incident-row"]').dataset.id);
});

confirmCancel.addEventListener('click', closeConfirm);
document.addEventListener('keydown', (e) => e.key === 'Escape' && asking && closeConfirm());

confirmAck.addEventListener('click', async () => {
  const id = asking;
  if (!id || pending.has(id)) return;
  pending.add(id);
  confirmAck.disabled = true;
  try {
    await ack(id);
    acked.add(id);
    const row = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
    row?.querySelector('[data-testid="ack"]')?.replaceWith(
      Object.assign(document.createElement('span'), { className: 'acked', textContent: 'acked' }),
    );
    const mark = row?.querySelector('.acked');
    if (mark) mark.dataset.testid = 'acked';
    status.textContent = '';
    closeConfirm();
  } catch (err) {
    status.textContent = `Ack failed for ${id}: ${err.message}`;
  } finally {
    pending.delete(id);
    confirmAck.disabled = false;
  }
});

async function refresh() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    loader.hidden = true;
    status.textContent = '';
  } catch (err) {
    status.textContent = `Could not refresh: ${err.message}`;
  }
}

async function loop() {
  await refresh();
  setTimeout(loop, REFRESH_MS);
}

loop();
