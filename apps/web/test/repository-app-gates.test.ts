/** Regression tests for repository gates reaching the browser source tree. */
import { afterEach, describe, expect, test } from 'vitest';
import { ESLint } from 'eslint';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('repository gates on apps/web source', () => {
  test('check:locale rejects unpinned formatting in both browser file types', () => {
    const dir = mkdtempSync(join(tmpdir(), 'evergreen-app-gates-'));
    temporaryDirectories.push(dir);
    mkdirSync(join(dir, 'packages'));
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'apps/web/src/pages'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/web/src/pages/probe.mjs'),
      'export const count = (120909).toLocaleString();\n',
    );
    writeFileSync(
      join(dir, 'apps/web/src/pages/probe.ts'),
      'export const count = (120909).toLocaleString();\n',
    );

    const run = spawnSync(process.execPath, [join(ROOT, 'scripts/check-locale-pinning.mjs')], {
      cwd: dir,
      encoding: 'utf8',
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('apps/web/src/pages/probe.mjs');
    expect(run.stderr).toContain('apps/web/src/pages/probe.ts');
  });

  test('ESLint rejects a hand-written TTL comparison in browser JavaScript', async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const [result] = await eslint.lintText(
      'const remaining = 10; const threshold = 20; export const low = remaining < threshold;\n',
      { filePath: join(ROOT, 'apps/web/src/pages/__policy_probe__.mjs') },
    );

    expect(result.messages.map((message) => message.ruleId)).toContain('no-restricted-syntax');
  });
});
