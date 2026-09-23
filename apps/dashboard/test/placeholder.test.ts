/**
 * The route manifest must describe the site that was actually built.
 *
 * This replaces a test that asserted `DASHBOARD_PLACEHOLDER === true` — green
 * for three weeks while the published URL served a placeholder page, which is
 * the state `check-sow-completeness.mjs` counts as a MISSING deliverable rather
 * than a partial one.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROUTES, pageFor } from '../src/index.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

describe('@evergreen/dashboard', () => {
  it('publishes at least the twelve routes the site is built from', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(12);
  });

  it('has a built page behind every route it claims', () => {
    const missing = ROUTES.filter((r) => !existsSync(PUBLIC + pageFor(r.route))).map(
      (r) => r.route,
    );
    expect(missing, `routes with no built page: ${missing.join(', ')}`).toEqual([]);
  });

  it('claims no route twice', () => {
    const seen = ROUTES.map((r) => r.route);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('says of every route whether it reads the chain or committed data', () => {
    for (const route of ROUTES) {
      expect(['live', 'committed']).toContain(route.reads);
      expect(route.does.length).toBeGreaterThan(10);
    }
  });
});
