import { readFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { runEmailCommand } from '../packages/engine/dist/index.js';

const result = await runEmailCommand(process.argv.slice(2), {
  readFile: (path) => readFile(path, 'utf8'),
  env: (name) => process.env[name],
});
if (result.stdout) console.log(result.stdout);
if (result.stderr) console.error(result.stderr);
process.exitCode = result.exitCode;
