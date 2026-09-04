import { describe, expect, it } from 'vitest';
import { ENGINE_PLACEHOLDER } from '../src/index.js';

describe('@evergreen/engine', () => {
  it('is importable before the run loop exists, so CI is green on the skeleton', () => {
    expect(ENGINE_PLACEHOLDER).toBe(true);
  });
});
