import { describe, expect, it } from 'vitest';
import { CORE_PLACEHOLDER } from '../src/index.js';

describe('@evergreen/core', () => {
  it('is importable before any real logic exists, so CI is green on the skeleton', () => {
    expect(CORE_PLACEHOLDER).toBe(true);
  });
});
