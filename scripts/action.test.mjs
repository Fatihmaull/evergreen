/**
 * Tests for `action.yml` — the `evergreen-check` GitHub Action.
 *
 * A composite action cannot be run locally without GitHub's runner, so the
 * usual failure is that it ships untested and breaks on its first real
 * workflow. This extracts the action's own `run:` script and executes it under
 * bash with a stub `npx` on PATH, so every branch — validation, the CLI's four
 * exit codes, the job summary — is exercised against the real script text.
 *
 * The injection cases matter most: this action runs in OTHER people's CI, with
 * inputs they control. Every input must reach the shell through `env`, and a
 * crafted input must be refused, never executed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const C = 'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL';

/** The `run:` body of the step with id `scan`, exactly as GitHub would run it. */
function actionScript() {
  const yml = readFileSync('action.yml', 'utf8');
  const at = yml.indexOf('- id: scan');
  assert.ok(at > 0, 'action.yml must have a step with id: scan');
  const run = yml.indexOf('run: |', at);
  const lines = yml.slice(run).split('\n').slice(1);
  const indent = /^(\s*)/.exec(lines[0])[1].length;
  const body = [];
  for (const line of lines) {
    if (line.trim() !== '' && /^(\s*)/.exec(line)[1].length < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n');
}

/**
 * Run the action's script with a stub `npx` that records its argv and exits
 * with `cliExit`. Returns the exit code, outputs, summary and the argv the CLI
 * actually received.
 */
function runAction({
  contracts,
  threshold = '17280',
  version = 'latest',
  keysFile = '',
  noDataKeys = 'false',
  requireScope = 'true',
  cliExit = 0,
}) {
  const dir = mkdtempSync(join(tmpdir(), 'evergreen-action-'));
  const argvFile = join(dir, 'argv');
  const stub = join(dir, 'npx');
  writeFileSync(
    stub,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > '${argvFile}'\necho "stub scan output"\nexit ${cliExit}\n`,
  );
  chmodSync(stub, 0o755);
  const script = join(dir, 'run.sh');
  writeFileSync(script, actionScript());
  const output = join(dir, 'output');
  const summary = join(dir, 'summary');
  writeFileSync(output, '');
  writeFileSync(summary, '');
  let code = 0;
  try {
    execFileSync('bash', [script], {
      cwd: dir,
      stdio: 'pipe',
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        EVERGREEN_CONTRACTS: contracts,
        EVERGREEN_THRESHOLD: threshold,
        EVERGREEN_VERSION: version,
        EVERGREEN_KEYS_FILE: keysFile,
        EVERGREEN_NO_DATA_KEYS: noDataKeys,
        EVERGREEN_REQUIRE_SCOPE: requireScope,
      },
    });
  } catch (error) {
    code = error.status;
  }
  return {
    code,
    output: readFileSync(output, 'utf8'),
    summary: readFileSync(summary, 'utf8'),
    argv: existsSync(argvFile) ? readFileSync(argvFile, 'utf8').trim().split('\n') : null,
    dir,
  };
}

test('passes the contracts and threshold through to the published CLI', () => {
  const r = runAction({ contracts: `${A} ${C}`, threshold: '120960' });
  assert.equal(r.code, 0);
  assert.deepEqual(r.argv, [
    '--yes',
    '@evergreen-stellar/cli@latest',
    'scan',
    A,
    C,
    '--threshold',
    '120960',
    '--require-declared-scope',
  ]);
  assert.match(r.output, /exit-code=0/);
});

// ── Scope ──────────────────────────────────────────────────────────────────
// packages/cli/README.md has promised that evergreen-check sets
// --require-declared-scope by default. Without it a green build means only
// "the entries I could see are healthy" — instance and code — and says nothing
// about persistent storage, which is the false-green this project guards
// against everywhere else.
test('requires declared scope by default, as the CLI README promises', () => {
  const r = runAction({ contracts: A });
  assert.ok(r.argv.includes('--require-declared-scope'));
});

test("require-declared-scope: 'false' omits it", () => {
  const r = runAction({ contracts: A, requireScope: 'false' });
  assert.equal(r.argv.includes('--require-declared-scope'), false);
});

test('passes a keys file through as a single quoted argument', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evergreen-keys-'));
  const keys = join(dir, 'keys with spaces.json');
  writeFileSync(keys, '{"dataKeys":[]}');
  const r = runAction({ contracts: A, keysFile: keys });
  assert.equal(r.code, 0);
  const at = r.argv.indexOf('--keys-file');
  assert.ok(at > 0);
  assert.equal(r.argv[at + 1], keys, 'a path with spaces must survive as ONE argument');
});

test('refuses a keys file that does not exist, without running the CLI', () => {
  const r = runAction({ contracts: A, keysFile: '/nonexistent/keys.json' });
  assert.equal(r.code, 2);
  assert.equal(r.argv, null);
});

test("no-data-keys: 'true' passes the declaration through", () => {
  const r = runAction({ contracts: A, noDataKeys: 'true' });
  assert.ok(r.argv.includes('--no-data-keys'));
});

for (const [field, value] of [
  ['noDataKeys', 'yes'],
  ['noDataKeys', 'TRUE'],
  ['requireScope', '1'],
  ['requireScope', ''],
]) {
  test(`refuses ${field} ${JSON.stringify(value)} — booleans are exactly 'true' or 'false'`, () => {
    const r = runAction({ contracts: A, [field]: value });
    assert.equal(r.code, 2);
    assert.equal(r.argv, null);
  });
}

test('accepts contracts separated by newlines, as a YAML block scalar gives them', () => {
  const r = runAction({ contracts: `${A}\n${C}\n` });
  assert.equal(r.code, 0);
  assert.ok(r.argv.includes(A) && r.argv.includes(C));
});

// The four CLI exit codes. 1 and 3 must FAIL the job as well as 2 — an
// incomplete scan is not evidence of health.
for (const [cliExit, word] of [
  [0, 'Healthy'],
  [1, 'At or below threshold'],
  [2, 'Error'],
  [3, 'Scan incomplete'],
]) {
  test(`CLI exit ${cliExit} → job exit ${cliExit}, summary says "${word}"`, () => {
    const r = runAction({ contracts: A, cliExit });
    assert.equal(r.code, cliExit);
    assert.match(r.output, new RegExp(`exit-code=${cliExit}`));
    assert.match(r.summary, new RegExp(word));
    assert.match(r.summary, /stub scan output/, 'the scan output reaches the summary');
  });
}

test('pins the CLI version when one is given', () => {
  const r = runAction({ contracts: A, version: '0.1.0' });
  assert.equal(r.argv[1], '@evergreen-stellar/cli@0.1.0');
});

// Bad input must fail loudly and must NEVER reach the CLI with a default in
// its place — a silently-defaulted threshold is a green build against a
// margin the repository never asked for.
for (const threshold of ['0', '-5', 'abc', '17_280', '1.5', '', '017280']) {
  test(`refuses threshold ${JSON.stringify(threshold)} without running the CLI`, () => {
    const r = runAction({ contracts: A, threshold });
    assert.equal(r.code, 2);
    assert.equal(r.argv, null, 'the CLI must not have been invoked');
  });
}

for (const contracts of ['', '   ', 'not-a-contract', A.slice(0, 55), `${A}x`, A.toLowerCase()]) {
  test(`refuses contracts ${JSON.stringify(contracts.slice(0, 20))} without running the CLI`, () => {
    const r = runAction({ contracts });
    assert.equal(r.code, 2);
    assert.equal(r.argv, null);
  });
}

// ── Injection ──────────────────────────────────────────────────────────────
// Each payload, if it were ever evaluated, would create a file named `pwned`
// in the working directory. None may.
const PAYLOADS = [
  '$(touch pwned)',
  '`touch pwned`',
  `${A}; touch pwned`,
  `${A} && touch pwned`,
  `${A} | touch pwned`,
  `${A}\ntouch pwned`,
];
for (const payload of PAYLOADS) {
  test(`contracts payload ${JSON.stringify(payload.slice(-18))} is refused, not executed`, () => {
    const r = runAction({ contracts: payload });
    assert.equal(r.code, 2);
    assert.equal(existsSync(join(r.dir, 'pwned')), false, 'payload was executed');
  });
}
for (const [field, payload] of [
  ['threshold', '$(touch pwned)'],
  ['threshold', '17280; touch pwned'],
  ['version', 'latest; touch pwned'],
  ['version', '$(touch pwned)'],
  ['keysFile', '$(touch pwned)'],
  ['keysFile', 'keys.json; touch pwned'],
  ['noDataKeys', 'true; touch pwned'],
  ['requireScope', '$(touch pwned)'],
]) {
  test(`${field} payload ${JSON.stringify(payload)} is refused, not executed`, () => {
    const r = runAction({ contracts: A, [field]: payload });
    assert.equal(r.code, 2);
    assert.equal(existsSync(join(r.dir, 'pwned')), false, 'payload was executed');
    assert.equal(r.argv, null);
  });
}

/** An input's declared default, read from action.yml rather than mirrored. */
function inputDefault(name) {
  const yml = readFileSync('action.yml', 'utf8');
  const block = yml.slice(yml.indexOf(`\n  ${name}:`));
  const m = /\n\s+default:\s*'?([^'\n]*)'?/.exec(block.slice(0, block.indexOf('\n  ', 3) + 400));
  assert.ok(m, `action.yml declares no default for ${name}`);
  return m[1];
}

/**
 * The action must not depend on the CALLER's package manager.
 *
 * `package-manager-cache` defaults to TRUE in setup-node@v5, which makes it
 * detect the caller's lockfile and shell out to that package manager. In a
 * repository with a `pnpm-lock.yaml` and no pnpm on the runner — the default for
 * every pnpm user — the job dies with "Unable to locate executable file: pnpm"
 * before this action runs a line of its own.
 *
 * Not hypothetical: measured 2026-09-25 in run 36095134361, where both demo jobs
 * failed here and the scan step was skipped. This action installs with
 * `npx --yes` and reads no lockfile, so there is nothing to cache.
 *
 * The harness executes the `run:` body and never sees the `uses:` steps, so no
 * other test in this file can catch a regression here.
 */
test('setup-node does not touch the caller’s package manager', () => {
  const yml = readFileSync('action.yml', 'utf8');
  const step = yml.slice(yml.indexOf('actions/setup-node@'));
  const block = step.slice(0, step.indexOf('\n    - ') + 1 || undefined);
  assert.match(
    block,
    /package-manager-cache:\s*false/,
    'action.yml must set package-manager-cache: false — it defaults to true and ' +
      'then requires the caller’s package manager to exist on the runner',
  );
});

// The harness passes each input explicitly, mirroring the defaults — so it
// cannot see a default change in action.yml itself. These read the file.
// Found by mutation: flipping require-declared-scope's default to 'false'
// failed nothing until this test existed.
test('declared defaults are the ones the README and the harness assume', () => {
  assert.equal(inputDefault('require-declared-scope'), 'true');
  assert.equal(inputDefault('no-data-keys'), 'false');
  assert.equal(inputDefault('threshold'), '17280');
  assert.equal(inputDefault('version'), 'latest');
});

test('no input is interpolated with ${{ }} inside a run: body', () => {
  // The structural guarantee the injection tests rely on. GitHub expands
  // `${{ inputs.x }}` into the script TEXT before bash sees it, so the tests
  // above cannot catch it — only reading the file can.
  const script = actionScript();
  assert.doesNotMatch(script, /\$\{\{/);
});
