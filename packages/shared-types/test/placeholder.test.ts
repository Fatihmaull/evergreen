import { describe, expect, it } from 'vitest';
import { SHARED_TYPES_PLACEHOLDER } from '../src/index.js';

describe('@evergreen/shared-types', () => {
  it('is importable before any real types exist, so CI is green on the skeleton', () => {
    expect(SHARED_TYPES_PLACEHOLDER).toBe(true);
  });
});
