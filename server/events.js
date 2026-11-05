import fs from 'node:fs';

// Server-Sent Events: tells every open tab that data changed, so edits made by
// another tab, the API or a file dropped into data/items/ show up live.
export function createEvents(watchDirs) {
  const clients = new Set();
  let timer = null;

  function broadcast(source = 'server') {
    clearTimeout(timer);
    // Debounce: one save touches several files.
    timer = setTimeout(() => {
      const msg = `event: changed\ndata: ${JSON.stringify({ source })}\n\n`;
      for (const res of clients) res.write(msg);
    }, 120);
  }

  for (const dir of watchDirs) {
    try { fs.watch(dir, () => broadcast('file')); }
    catch (e) { console.warn(`Kan ${dir} niet volgen: ${e.message}`); }
  }

  function handle(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
  }

  return { handle, broadcast };
}
