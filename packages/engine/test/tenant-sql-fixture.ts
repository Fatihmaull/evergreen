/** Shared by the opt-in Postgres test and the PGlite test, so both check the same rows. */
import { C, G, U1, U2 } from './tenant-fixtures.js';

export const TENANT_DB_FILES = [
  'schema.sql',
  '0002_jobs_daily_limit_per_user.sql',
  '0003_auth_rate_counters_wallet_challenges.sql',
] as const;

export const TENANT_FIXTURE_SQL = `
      INSERT INTO users (id, email) VALUES ('${U1}', 'u1@example.invalid'), ('${U2}', 'u2@example.invalid');
      INSERT INTO wallets (network, account, user_id) VALUES ('testnet', '${G('A')}', '${U1}'), ('testnet', '${G('B')}', '${U2}');
      INSERT INTO watch_items (user_id, network, contract_id, scope, autopilot_enabled, payer_network, payer_account,
        threshold_ledgers, extend_to_ledgers, budget_per_job_max, budget_per_30d_max) VALUES
        ('${U1}', 'testnet', '${C('A')}', '{"noDataKeys":true}', true, 'testnet', '${G('A')}', 1000, 5000, 100, 300),
        ('${U2}', 'testnet', '${C('A')}', '{"noDataKeys":true}', true, 'testnet', '${G('B')}', 1000, 5000, 100, 300),
        ('${U1}', 'testnet', '${C('B')}', '{"noDataKeys":true}', true, 'testnet', '${G('A')}', 1000, 5000, 100, 300),
        ('${U2}', 'testnet', '${C('C')}', '{"noDataKeys":true}', true, 'testnet', '${G('A')}', 1000, 5000, 100, 300),
        ('${U2}', 'testnet', '${C('D')}', '{"noDataKeys":true}', true, 'testnet', '${G('B')}', 1000, 5000, 100, 300);
      INSERT INTO watch_items (user_id, network, contract_id, scope, removed_at) VALUES
        ('${U1}', 'testnet', '${C('Z')}', '{"noDataKeys":true}', now());
      INSERT INTO jobs (id, user_id, network, contract_id, kind, payer_account, status, autopilot_window, pull_tx_hash, pulled_at, pull_amount) VALUES
        ('10000000-0000-4000-8000-000000000001', '${U1}', 'testnet', '${C('A')}', 'autopilot', '${G('A')}', 'refunded', 1, 'p1', now() - interval '1 day', 100),
        ('10000000-0000-4000-8000-000000000002', '${U1}', 'testnet', '${C('A')}', 'autopilot', '${G('A')}', 'extended', 2, 'p2', now() - interval '31 days', 100),
        ('10000000-0000-4000-8000-000000000003', '${U2}', 'testnet', '${C('A')}', 'autopilot', '${G('B')}', 'extended', 3, 'p3', now() - interval '1 day', 250),
        ('10000000-0000-4000-8000-000000000004', '${U2}', 'testnet', '${C('D')}', 'autopilot', '${G('B')}', 'extended', 4, 'p4', now() - interval '1 day', 70);
      INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash) VALUES
        ('10000000-0000-4000-8000-000000000001', 'testnet', '${G('A')}', '${C('A')}', 'pull', 100, 'p1'),
        ('10000000-0000-4000-8000-000000000001', 'testnet', '${G('A')}', '${C('A')}', 'refund', 40, 'r1'),
        ('10000000-0000-4000-8000-000000000001', 'testnet', '${G('A')}', '${C('A')}', 'rent', 50, NULL),
        ('10000000-0000-4000-8000-000000000002', 'testnet', '${G('A')}', '${C('A')}', 'pull', 100, 'p2'),
        ('10000000-0000-4000-8000-000000000003', 'testnet', '${G('B')}', '${C('A')}', 'pull', 250, 'p3');
`;
