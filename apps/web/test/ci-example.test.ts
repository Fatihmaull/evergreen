import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render } from '../src/pages/docs/ci.mjs';

const cli = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../packages/cli/package.json', import.meta.url)),
    'utf8',
  ),
) as { version: string };

test('copyable CI example separates the public Action tag from the CLI version and declares scope', () => {
  const html = render({ cli, thresholds: { warn: 120960 } });

  expect(html).toContain('uses: actions/checkout@v4');
  expect(html).toContain('uses: Fatihmaull/evergreen@v1');
  expect(html).toContain(`version: &#39;${cli.version}&#39;`);
  expect(html).toContain('keys-file: &#39;.evergreen/keys.json&#39;');
  expect(html).not.toContain(`evergreen@v${cli.version}`);
});
