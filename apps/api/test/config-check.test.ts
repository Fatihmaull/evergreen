import { describe, expect, it } from 'vitest';
import { configCheck } from '../src/alerts/config-check.js';
import { API_REQUIRED_SETTINGS } from '../src/alerts/failure-modes.js';

const full = Object.fromEntries(API_REQUIRED_SETTINGS.map((n) => [n, `value-of-${n}`]));

describe('configCheck (F17/F18, log only)', () => {
  it('reports no problem when everything is set', () => {
    expect(configCheck({ ...full, THRESHOLD_FLOOR_LEDGERS: '1037' })).toEqual({
      event: 'alerts.f17_f18_config',
      thresholdFloor: null,
      missingSettings: [],
      problem: false,
    });
  });

  it('flags an unset or malformed floor', () => {
    expect(configCheck(full)).toMatchObject({ thresholdFloor: 'unset', problem: true });
    expect(configCheck({ ...full, THRESHOLD_FLOOR_LEDGERS: '10x' })).toMatchObject({
      thresholdFloor: 'malformed',
      problem: true,
    });
  });

  it('names missing settings and never logs a value', () => {
    const env = { ...full, THRESHOLD_FLOOR_LEDGERS: '1037', EMAIL_FROM: ' ', API: {} };
    delete (env as Record<string, unknown>)['DASHBOARD_ORIGIN'];
    const out = configCheck(env);
    expect(out.missingSettings).toEqual(['EMAIL_FROM', 'DASHBOARD_ORIGIN']);
    expect(JSON.stringify(out)).not.toContain('value-of-');
  });
});
