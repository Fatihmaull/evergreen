import { describe, expect, it } from 'vitest';
import { isValidBumpWindow } from '../src/index.js';

// #442: the tenant planner re-checks what the watch_items schema CHECK guards
// (`threshold_ledgers > 0 AND extend_to_ledgers > threshold_ledgers`), through
// core, so the comparison keeps one home. These pin the helper to that CHECK.
describe('isValidBumpWindow', () => {
  it('accepts a target strictly above a positive threshold', () => {
    expect(isValidBumpWindow(17_280, 120_960)).toBe(true);
    expect(isValidBumpWindow(1, 2)).toBe(true);
  });

  it('🔴 refuses a target equal to the threshold: a bump that buys nothing', () => {
    expect(isValidBumpWindow(17_280, 17_280)).toBe(false);
  });

  it('🔴 refuses a target below the threshold', () => {
    expect(isValidBumpWindow(17_280, 17_279)).toBe(false);
  });

  it('🔴 refuses a zero threshold, as the schema does, though isValidThreshold allows 0', () => {
    expect(isValidBumpWindow(0, 100)).toBe(false);
  });

  it.each([
    ['a fractional threshold', 1.5, 10],
    ['a fractional target', 10, 20.5],
    ['a negative threshold', -5, 10],
    ['NaN', Number.NaN, 10],
    ['an infinite target', 10, Number.POSITIVE_INFINITY],
  ])('🔴 refuses %s', (_, threshold, extendTo) => {
    expect(isValidBumpWindow(threshold, extendTo)).toBe(false);
  });
});
