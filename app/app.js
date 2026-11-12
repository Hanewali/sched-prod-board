import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000;

const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');
const status = document.querySelector('[data-testid="status"]');

const acked = new Set();
const pending = new Set();
let shownIds = '';

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

function rowHtml(i) {
  const done = acked.has(i.id);
  return `<li data-testid="incident-row" data-id="${esc(i.id)}" class="row ${esc(i.severity)}">
        <span class="id">${esc(i.id)}</span>
        <span class="sev">${esc(i.severity)}</span>
        <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
        <time datetime="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time>
        ${
          done
            ? '<span data-testid="acked" class="acked">acked</span>'
            : '<button type="button" data-testid="ack" class="ack">Ack</button>'
        }
      </li>`;
}

function render(incidents) {
  // Rebuild only when the set of incidents changes, so a click is never lost to a refresh.
  const ids = incidents.map((i) => i.id).join(',');
  if (ids !== shownIds) {
    shownIds = ids;
    list.innerHTML = incidents.map(rowHtml).join('');
  }
  empty.hidden = incidents.length > 0;
}

list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const id = btn.closest('[data-testid="incident-row"]').dataset.id;
  if (pending.has(id)) return;
  pending.add(id);
  btn.disabled = true;
  try {
    await ack(id);
    acked.add(id);
    const row = btn.closest('[data-testid="incident-row"]');
    btn.replaceWith(Object.assign(document.createElement('span'), { className: 'acked', textContent: 'acked' }));
    row.querySelector('.acked').dataset.testid = 'acked';
    status.textContent = '';
  } catch (err) {
    btn.disabled = false;
    status.textContent = `Ack failed for ${id}: ${err.message}`;
  } finally {
    pending.delete(id);
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
