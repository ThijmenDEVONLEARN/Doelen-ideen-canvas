import fs from 'node:fs';
import path from 'node:path';

// One snapshot per day in data/backups/YYYY-MM-DD/. Old backups are never deleted automatically.
export function backupDaily(dataDir) {
  const day = new Date().toISOString().slice(0, 10);
  const target = path.join(dataDir, 'backups', day);
  if (fs.existsSync(target)) return null;
  fs.mkdirSync(target, { recursive: true });
  for (const name of ['items', 'canvas.json', 'activity.json']) {
    const src = path.join(dataDir, name);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(target, name), { recursive: true });
  }
  return target;
}

export function scheduleBackups(dataDir) {
  const run = () => {
    try {
      const made = backupDaily(dataDir);
      if (made) console.log(`Backup gemaakt: ${made}`);
    } catch (e) { console.error('Backup mislukt:', e.message); }
  };
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
