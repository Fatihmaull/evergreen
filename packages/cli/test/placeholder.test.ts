import { describe, expect, it } from 'vitest';
import { CLI_PLACEHOLDER } from '../src/index.js';

describe('evergreen (cli)', () => {
  it('is importable before any commands exist, so CI is green on the skeleton', () => {
    expect(CLI_PLACEHOLDER).toBe(true);
  });
});
