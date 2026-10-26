/**
 * Auth settings, read once at startup. Every number is CONFIGURATION, never a
 * constant in code (docs/API.md §3). The defaults are Fatih's starting values
 * of 2026-10-20, and he may tune them; durations are in seconds.
 */
export interface AuthConfig {
  /** A session unused for this long is dead. */
  readonly sessionIdleTimeout: number;
  /** A session older than this is dead, however recently used. */
  readonly sessionAbsoluteTimeout: number;
  /** How long an email sign-in code is valid. */
  readonly signinCodeTtl: number;
  /** Wrong guesses after which a code is void. */
  readonly signinCodeMaxFailures: number;
  /** Digits in a sign-in code. */
  readonly signinCodeDigits: number;
  readonly emailSendsPerAddress: { readonly limit: number; readonly window: number };
  readonly emailSendsPerIp: { readonly limit: number; readonly window: number };
}

/**
 * `SIGNIN_CODE_DIGITS` defaults to 8, not 6. Fatih set the attempt and send
 * limits, not the length, so the arithmetic is written down here:
 *
 * - An attacker targeting one address gets at most 5 guesses per code and 3
 *   codes per 15 minutes (`SIGNIN_CODE_MAX_FAILURES` × `EMAIL_SENDS_PER_ADDRESS`).
 *   That is 15 guesses per 15 minutes, or 1,440 a day.
 * - 6 digits (10^6): about 0.14% chance a day, about 4% over a month of trying.
 * - 8 digits (10^8): about 0.0014% a day.
 *
 * A login that is not the authority over money still guards a watchlist, an
 * email address and the "Extend now" trigger, so 4% a month is too much.
 */
export const AUTH_DEFAULTS = {
  SESSION_IDLE_TIMEOUT: 7 * 24 * 60 * 60,
  SESSION_ABSOLUTE_TIMEOUT: 30 * 24 * 60 * 60,
  SIGNIN_CODE_TTL: 10 * 60,
  SIGNIN_CODE_MAX_FAILURES: 5,
  SIGNIN_CODE_DIGITS: 8,
  EMAIL_SENDS_PER_ADDRESS: 3,
  EMAIL_SENDS_PER_ADDRESS_WINDOW: 15 * 60,
  EMAIL_SENDS_PER_IP: 20,
  EMAIL_SENDS_PER_IP_WINDOW: 60 * 60,
} as const;

export type AuthSetting = keyof typeof AUTH_DEFAULTS;

/** Thrown at startup, so a misconfigured Worker never serves a request. */
export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
  }
}

/**
 * Settings from the Worker's environment, falling back to the defaults. An
 * empty string counts as unset. Anything else must be a positive whole number:
 * a typo must not silently become a zero limit or an endless session.
 */
export function loadAuthConfig(env: Readonly<Record<string, string | undefined>>): AuthConfig {
  const read = (name: AuthSetting): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return AUTH_DEFAULTS[name];
    if (!/^[1-9]\d*$/.test(raw)) {
      throw new AuthConfigError(`${name} must be a positive whole number, got "${raw}".`);
    }
    return Number(raw);
  };
  const config: AuthConfig = {
    sessionIdleTimeout: read('SESSION_IDLE_TIMEOUT'),
    sessionAbsoluteTimeout: read('SESSION_ABSOLUTE_TIMEOUT'),
    signinCodeTtl: read('SIGNIN_CODE_TTL'),
    signinCodeMaxFailures: read('SIGNIN_CODE_MAX_FAILURES'),
    signinCodeDigits: read('SIGNIN_CODE_DIGITS'),
    emailSendsPerAddress: {
      limit: read('EMAIL_SENDS_PER_ADDRESS'),
      window: read('EMAIL_SENDS_PER_ADDRESS_WINDOW'),
    },
    emailSendsPerIp: {
      limit: read('EMAIL_SENDS_PER_IP'),
      window: read('EMAIL_SENDS_PER_IP_WINDOW'),
    },
  };
  if (config.sessionIdleTimeout > config.sessionAbsoluteTimeout) {
    throw new AuthConfigError('SESSION_IDLE_TIMEOUT cannot exceed SESSION_ABSOLUTE_TIMEOUT.');
  }
  return config;
}
