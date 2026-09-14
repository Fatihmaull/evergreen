import { mkdir, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

/** Private retained run directory. An existing run never executes again. */
export function createRunJournal(root) {
  let dir;
  async function write(name, value) {
    if (!dir) throw new Error('Journal not started');
    const f = await open(join(dir, name), 'wx', 0o600);
    try {
      await f.writeFile(JSON.stringify(value, null, 2) + '\n');
      await f.sync();
    } finally {
      await f.close();
    }
    const d = await open(dir, 'r');
    try {
      await d.sync();
    } finally {
      await d.close();
    }
  }
  const key = (id) => createHash('sha256').update(id).digest('hex');
  return {
    async start(runId) {
      if (!/^[A-Za-z0-9_.-]{1,128}$/.test(runId) || runId === '.' || runId === '..')
        throw new Error('Invalid run ID');
      await mkdir(root, { recursive: true, mode: 0o700 });
      dir = join(resolve(root), runId);
      await mkdir(dir, { mode: 0o700 });
      const parent = await open(resolve(root), 'r');
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
      await write('start.json', { runId, startedAt: new Date().toISOString() });
    },
    execution: (value) => write('execution.json', value),
    intent: (alert) => write(key(alert.id) + '.intent.json', alert),
    receipt: (receipt) => write(key(receipt.id) + '.receipt.json', receipt),
  };
}
