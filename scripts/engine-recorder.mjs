import { lstat, mkdir, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/** One bounded local run. Retained intent files are never automatically reclaimed. */
export function createLocalSubmissionRecorder(path) {
  const filename = resolve(path);
  let handle;
  return {
    async assertReady() {
      await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
      try {
        await lstat(filename);
      } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
      }
      throw new Error('Attempt file already exists. Reconcile it before any new live execution.');
    },
    async record(intent) {
      if (!handle) handle = await open(filename, 'wx', 0o600);
      await handle.appendFile(JSON.stringify({ version: 1, intent }) + '\n');
      await handle.sync();
      // Persist the new directory entry as well as the file contents before send.
      const directory = await open(dirname(filename), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    },
    async close() {
      await handle?.close();
    },
  };
}
