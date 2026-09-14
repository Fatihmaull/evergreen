import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
const builder = resolve('scripts/build-proof-runtime.mjs');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'runtime-source-test-'));
  const destination = root.replace('runtime-source-test-', 'evergreen-w3-save-runtime-test-');
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'pipe', timeout: 30000 });
  await symlink(resolve('node_modules'), join(root, 'node_modules'));
  await writeFile(join(root, '.gitignore'), 'node_modules/\n**/dist/\n**/*.tsbuildinfo\n');
  await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const pkgs = ['core', 'engine', 'shared-types'];
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({ files: [], references: pkgs.map((p) => ({ path: 'packages/' + p })) }),
  );
  for (const p of pkgs) {
    const dir = join(root, 'packages', p);
    await mkdir(join(dir, 'src'), { recursive: true });
    await mkdir(join(dir, 'dist'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    await writeFile(join(dir, 'src/index.ts'), 'export const marker = "committed-source";\n');
    await writeFile(join(dir, 'dist/index.js'), 'export const marker = "stale-output";\n');
    await writeFile(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          composite: true,
          rootDir: 'src',
          outDir: 'dist',
          types: [],
          skipLibCheck: true,
        },
        include: ['src/**/*.ts'],
      }),
    );
  }
  await mkdir(join(root, 'scripts'));
  for (const name of [
    'engine-alert-run',
    'engine-recorder',
    'run-journal',
    'scheduler-watch',
    'run-save-proof',
    'check-save-proof-readiness',
  ])
    await writeFile(join(root, 'scripts', name + '.mjs'), '// committed script\n');
  run('git', ['init', '--quiet']);
  run('git', ['add', '.']);
  run('git', [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'fixture',
  ]);
  return {
    root,
    destination,
    run,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
      await rm(destination, { recursive: true, force: true });
    },
  };
}
test('runtime rebuilds ignored stale dist before attributing the snapshot to HEAD', async () => {
  const f = await fixture();
  try {
    f.run(process.execPath, [builder, f.destination]);
    assert.match(
      await readFile(join(f.destination, 'packages/engine/dist/index.js'), 'utf8'),
      /committed-source/,
    );
  } finally {
    await f.cleanup();
  }
});
test('runtime refuses modified or untracked source instead of claiming HEAD provenance', async () => {
  for (const filename of ['packages/engine/src/index.ts', 'packages/engine/src/new.ts']) {
    const f = await fixture();
    try {
      await writeFile(join(f.root, filename), 'export const marker = "uncommitted-source";\n');
      assert.throws(() => f.run(process.execPath, [builder, f.destination]), /Command failed/);
    } finally {
      await f.cleanup();
    }
  }
});
