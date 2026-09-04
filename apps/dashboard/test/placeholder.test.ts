import { describe, expect, it } from 'vitest';
import { DASHBOARD_PLACEHOLDER } from '../src/index.js';

describe('@evergreen/dashboard', () => {
  it('is importable before the app exists, so CI is green on the skeleton', () => {
    expect(DASHBOARD_PLACEHOLDER).toBe(true);
  });
});
