import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupDaily } from '../server/backup.js';

test('backupDaily copies items once per day', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-'));
  fs.mkdirSync(path.join(dir, 'items'));
  fs.writeFileSync(path.join(dir, 'items', 'a.md'), 'x');
  fs.writeFileSync(path.join(dir, 'canvas.json'), '{}');
  const target = backupDaily(dir);
  assert.ok(fs.existsSync(path.join(target, 'items', 'a.md')));
  assert.ok(fs.existsSync(path.join(target, 'canvas.json')));
  assert.equal(backupDaily(dir), null);
});
