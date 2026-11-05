import { describe, expect, it } from 'vitest';
import {
  dismissSupportTip,
  inCi,
  monthKey,
  parseSupportTipState,
  supportTip,
  type SupportTipInput,
} from '../src/support-tip.js';

// A syntactically valid G-address generated for tests; not Evergreen's treasury.
const ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const NOW = new Date('2026-10-22T12:00:00Z');

const base: SupportTipInput = {
  args: ['scan', 'CABC'],
  stderrIsTTY: true,
  env: { EVERGREEN_SUPPORT_ADDRESS: ADDRESS },
  now: NOW,
  state: {},
};

describe('support tip', () => {
  it('shows once to a human at a terminal, with the configured address, on stderr text', () => {
    const d = supportTip(base);
    expect(d.text).toContain(ADDRESS);
    expect(d.text).toContain('evergreen tip --dismiss');
    expect(d.nextState).toEqual({ lastMonth: '2026-10' });
  });

  it('shows at most once a month', () => {
    expect(supportTip({ ...base, state: { lastMonth: '2026-10' } }).text).toBeUndefined();
    expect(
      supportTip({
        ...base,
        state: { lastMonth: '2026-10' },
        now: new Date('2026-11-01T00:00:00Z'),
      }).text,
    ).toBeDefined();
  });

  it('is dismissible for the month', () => {
    const state = dismissSupportTip(NOW);
    expect(supportTip({ ...base, state }).text).toBeUndefined();
    expect(
      supportTip({ ...base, state, now: new Date('2026-11-02T00:00:00Z') }).text,
    ).toBeDefined();
  });

  it('never shows when stderr is not a TTY', () => {
    expect(supportTip({ ...base, stderrIsTTY: false })).toEqual({});
  });

  it('never shows with --json', () => {
    expect(supportTip({ ...base, args: ['scan', 'CABC', '--json'] })).toEqual({});
  });

  it.each([
    'CI',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'BUILDKITE',
    'CIRCLECI',
    'TF_BUILD',
    'JENKINS_URL',
  ])('never shows in CI (%s)', (name) => {
    expect(supportTip({ ...base, env: { ...base.env, [name]: 'true' } })).toEqual({});
  });

  it('treats CI=false and CI=0 as not CI', () => {
    expect(inCi({ CI: 'false' })).toBe(false);
    expect(inCi({ CI: '0' })).toBe(false);
  });

  it('can be turned off for good', () => {
    expect(supportTip({ ...base, env: { ...base.env, EVERGREEN_NO_SUPPORT_TIP: '1' } })).toEqual(
      {},
    );
  });

  it('has no address compiled in: none configured, or an invalid one, means no tip', () => {
    expect(supportTip({ ...base, env: {} })).toEqual({});
    expect(supportTip({ ...base, env: { EVERGREEN_SUPPORT_ADDRESS: 'GNOPE' } })).toEqual({});
  });

  it('reads a corrupt or foreign state file as never shown', () => {
    expect(parseSupportTipState(undefined)).toEqual({});
    expect(parseSupportTipState('{oops')).toEqual({});
    expect(parseSupportTipState('{"lastMonth":"soon"}')).toEqual({});
    expect(parseSupportTipState('{"lastMonth":"2026-09"}')).toEqual({ lastMonth: '2026-09' });
  });

  it('keys months in UTC', () => {
    expect(monthKey(new Date('2026-10-31T23:30:00-02:00'))).toBe('2026-11');
  });
});
