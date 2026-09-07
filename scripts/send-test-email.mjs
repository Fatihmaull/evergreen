#!/usr/bin/env node
/**
 * Send one test email through the configured provider. [W1-D5-04]
 *
 * The task is "a test email successfully sent from code" — not a notification
 * layer. That is `W3-D17-01`, behind the `NotificationChannel` interface. This
 * script exists only to prove the account, the key, and the network path work
 * before Week 3 depends on them, and it should be deleted once EmailChannel
 * lands rather than maintained alongside it.
 *
 * Usage:
 *   EMAIL_API_KEY=re_… EVERGREEN_ALERT_TO=you@example.com \
 *     node scripts/send-test-email.mjs
 *
 * Reads from .env if present. Never hardcode the key — see
 * docs/CONVENTIONS.md § Where each secret lives.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

// `fetch` is a global in Node 24 but has no `node:` module to import from, so
// take it explicitly rather than relying on an implicit global — same reason
// the other scripts import process and console by name.
const { fetch } = globalThis;

const PROVIDER_ENDPOINT = 'https://api.resend.com/emails';

// Resend's shared sandbox sender. Works with no domain verification, but only
// delivers to the address that owns the API key — which is exactly what a
// connectivity test needs. A verified domain comes later, if ever: alerts go to
// two people who both own their addresses.
const SANDBOX_FROM = 'Evergreen <onboarding@resend.dev>';

function loadDotEnv() {
  try {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env is fine — the values may come from the environment directly.
  }
}

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

loadDotEnv();

const key = process.env.EMAIL_API_KEY;
const to = process.env.EVERGREEN_ALERT_TO;

if (!key) die('EMAIL_API_KEY is not set. Put it in .env (gitignored) or the environment.');
if (!to) die('EVERGREEN_ALERT_TO is not set — no recipient to test against.');

const sentAt = new Date().toISOString();

const res = await fetch(PROVIDER_ENDPOINT, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: SANDBOX_FROM,
    to: [to],
    subject: 'Evergreen — email path verified (W1-D5-04)',
    text: [
      'This is the W1-D5-04 connectivity test for Evergreen.',
      '',
      `Sent at: ${sentAt}`,
      '',
      'If you are reading this, the provider account, the API key, and the',
      'network path all work — which is the whole point of the task. The real',
      'alerting layer lands in W3-D17-01 behind the NotificationChannel',
      'interface, and it must be verified in BOTH directions: a bump that',
      'succeeds and a bump that fails should each produce an email.',
      '',
      'Testnet only. No transaction was submitted to produce this message.',
    ].join('\n'),
  }),
});

const body = await res.text();

if (!res.ok) {
  console.error(`\n✖ send failed — HTTP ${res.status}`);
  console.error(body);
  console.error('\nCommon causes: key pasted with a trailing space; recipient is not');
  console.error('the address that owns the key (sandbox sender only delivers to it).\n');
  process.exit(1);
}

console.log('✓ email accepted by provider');
console.log(`  to:      ${to}`);
console.log(`  sent at: ${sentAt}`);
console.log(`  response: ${body}`);
console.log('\nCheck the inbox, then record the outcome in docs/EVIDENCE.md.');
