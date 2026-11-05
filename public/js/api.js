let pending = 0;
let failed = false;
const statusListeners = new Set();

export function onSaveStatus(cb) { statusListeners.add(cb); cb(saveStatus()); }
function saveStatus() { return failed ? 'error' : pending ? 'saving' : 'saved'; }
function notify() { for (const cb of statusListeners) cb(saveStatus()); }

export async function api(method, url, body) {
  const write = method !== 'GET';
  if (write) { pending++; notify(); }
  try {
    const isBlob = body instanceof Blob;
    const res = await fetch(url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': isBlob ? body.type : 'application/json' },
      body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server gaf ${res.status}`);
    if (write) failed = false;
    return data;
  } catch (err) {
    if (write) failed = true;
    throw err;
  } finally {
    if (write) { pending--; notify(); }
  }
}

/** Calls cb whenever data on the server changed (another tab, the API, or a file in data/items/). */
export function onServerChange(cb) {
  const es = new EventSource('/api/events');
  es.addEventListener('changed', cb);
  es.addEventListener('open', () => { if (failed) { failed = false; notify(); } });
  es.addEventListener('error', () => { failed = true; notify(); });
}
