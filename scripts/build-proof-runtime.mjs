import { cp, mkdir, readFile, writeFile, readdir, realpath, symlink } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
// No secrets copied. Dependencies use the already-installed, pinned pnpm package.
const destination = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !destination.startsWith('/tmp/evergreen-paket-a-runtime-'))
  throw Error('Use an explicit temporary runtime destination');
const inputs = [
  'packages',
  'scripts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'tsconfig.base.json',
  '.npmrc',
  '.nvmrc',
];
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sourceCommit = git(['rev-parse', 'HEAD']);
function assertCommittedInputs() {
  if (git(['status', '--porcelain', '--untracked-files=all', '--', ...inputs]))
    throw Error('Commit runtime inputs before building a proof snapshot');
  if (git(['rev-parse', 'HEAD']) !== sourceCommit) throw Error('Source changed during snapshot');
}
assertCommittedInputs();
// dist is ignored: its presence does not establish which source produced it.
execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--build', '--force'], {
  stdio: 'pipe',
});
assertCommittedInputs();
await mkdir(destination, { mode: 0o700 });
for (const pkg of ['core', 'engine', 'shared-types']) {
  await mkdir(join(destination, 'packages', pkg), { recursive: true });
  await cp(`packages/${pkg}/dist`, join(destination, 'packages', pkg, 'dist'), { recursive: true });
  await cp(`packages/${pkg}/package.json`, join(destination, 'packages', pkg, 'package.json'));
}
await mkdir(join(destination, 'scripts'));
for (const file of [
  'engine-alert-run.mjs',
  'engine-recorder.mjs',
  'run-journal.mjs',
  'scheduler-watch.mjs',
  'run-save-proof.mjs',
  'check-save-proof-readiness.mjs',
])
  await cp('scripts/' + file, join(destination, 'scripts', file));
await writeFile(join(destination, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
await mkdir(join(destination, 'node_modules', '@evergreen-stellar'), { recursive: true });
await mkdir(join(destination, 'node_modules', '@stellar'), { recursive: true });
for (const pkg of ['core', 'shared-types'])
  await symlink(
    join(destination, 'packages', pkg),
    join(destination, 'node_modules', '@evergreen-stellar', pkg),
  );
await symlink(
  await realpath('node_modules/@stellar/stellar-sdk'),
  join(destination, 'node_modules', '@stellar', 'stellar-sdk'),
);
const files = {};
async function walk(dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules') continue;
    const path = join(dir, ent.name);
    if (ent.isDirectory()) await walk(path);
    else if (path.endsWith('.js') || path.endsWith('.mjs') || ent.name === 'package.json')
      files[relative(destination, path)] = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
  }
}
await walk(destination);
assertCommittedInputs();
await writeFile(
  join(destination, 'runtime-manifest.json'),
  JSON.stringify({ sourceCommit, runtimeRoot: destination, files }, null, 2) + '\n',
);
console.log(
  JSON.stringify({ sourceCommit, runtimeRoot: destination, fileCount: Object.keys(files).length }),
);
