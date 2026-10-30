#!/usr/bin/env node
/* global process, fetch, console */
// PH2-E2-06 Stage B preview test send (docs/ops/alerts-test-send.md).
// Reads ENVIRONMENT, ALERTS_SEND, ALERTS_TEST_ALLOWLIST, EMAIL_API_KEY and
// EMAIL_FROM from the process env; prints only the outcome (no addresses).
// Build first: pnpm build. Sends nothing unless every guard passes.
import { resendFetchClient, runPreviewTestSend } from '../dist/index.js';

const env = process.env;
const runId = process.argv[2] ?? new Date().toISOString().slice(0, 16);
const kinds = process.argv.slice(3);
const out = await runPreviewTestSend(
  env,
  {
    client: resendFetchClient(env.EMAIL_API_KEY ?? '', fetch),
    from: env.EMAIL_FROM ?? '',
    runId,
  },
  ...(kinds.length ? [kinds] : []),
);
console.log(JSON.stringify({ event: 'alerts.e2_06_test_send', runId, ...out }));
if (out.action === 'sent' && out.failed > 0) process.exitCode = 1;
