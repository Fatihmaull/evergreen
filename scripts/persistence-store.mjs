// W1-D6-04 experiment only. This is not the W3 engine persistence adapter.
import { URL } from 'node:url';
import { Client } from 'pg';

export function connectionOptions(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Set PERSISTENCE_DATABASE_URL to a dedicated PostgreSQL test database');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    url.pathname.length < 2
  ) {
    throw new Error('Use a PostgreSQL connection string with a host, username and database');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  for (const name of url.searchParams.keys()) {
    if (!['sslmode', 'channel_binding'].includes(name)) {
      throw new Error('Unsupported connection option; use a plain PostgreSQL connection string');
    }
  }
  const mode = url.searchParams.get('sslmode');
  if (!local && mode && !['require', 'verify-full'].includes(mode)) {
    throw new Error('Hosted connections require verified TLS');
  }
  if (local && mode && mode !== 'disable') {
    throw new Error('The disposable localhost probe expects sslmode=disable or no SSL option');
  }
  const binding = url.searchParams.get('channel_binding');
  if (binding && binding !== 'require') throw new Error('Unsupported channel binding option');
  try {
    return {
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port || 5432),
      database: decodeURIComponent(url.pathname.slice(1)),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      // Do not let pg's URI parser reinterpret sslmode=require as unverified TLS.
      ssl: local ? false : { rejectUnauthorized: true },
      enableChannelBinding: binding === 'require',
      connectionTimeoutMillis: 10_000,
      statement_timeout: 5_000,
      query_timeout: 10_000,
      application_name: 'evergreen-w1-persistence-spike',
    };
  } catch {
    throw new Error('Invalid connection string encoding');
  }
}

export function schemaName(value) {
  if (!/^evergreen_spike_[a-f0-9]{32}$/.test(value)) {
    throw new Error('Only an isolated generated spike schema is allowed');
  }
  return `"${value}"`;
}

export async function connect(value) {
  const client = new Client(connectionOptions(value));
  // A lost idle connection must not emit an unhandled error or expose credentials.
  client.on('error', () => {});
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
}

export async function createSchema(client, schema) {
  const table = schemaName(schema);
  await client.query('BEGIN');
  try {
    await client.query(`CREATE SCHEMA ${table}`);
    await client.query(`
    CREATE TABLE ${table}.claims (
      network text NOT NULL CHECK (network = 'testnet'),
      entry_key text NOT NULL,
      owner uuid NOT NULL,
      generation integer NOT NULL CHECK (generation > 0),
      expires_at timestamptz NOT NULL,
      phase text NOT NULL CHECK (phase IN ('claimed', 'pending', 'completed')),
      transaction_hash text,
      PRIMARY KEY (network, entry_key),
      CHECK ((phase = 'claimed' AND transaction_hash IS NULL)
        OR (phase <> 'claimed' AND transaction_hash IS NOT NULL AND transaction_hash ~ '^[a-f0-9]{64}$'))
    );
    CREATE TABLE ${table}.history (
      network text NOT NULL CHECK (network = 'testnet'),
      entry_key text NOT NULL,
      transaction_hash text NOT NULL,
      record jsonb NOT NULL CHECK (COALESCE(record->>'outcome' = 'succeeded', false)),
      PRIMARY KEY (network, entry_key, transaction_hash)
    )`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/** Atomic insert/takeover. Payer is deliberately not part of the entry lock key. */
export async function claim(client, schema, entryKey, owner) {
  const result = await client.query(
    `INSERT INTO ${schemaName(schema)}.claims AS current
       (network, entry_key, owner, generation, expires_at, phase)
     VALUES ('testnet', $1, $2, 1, clock_timestamp() + interval '30 seconds', 'claimed')
     ON CONFLICT (network, entry_key) DO UPDATE
       SET owner = EXCLUDED.owner, generation = current.generation + 1,
           expires_at = EXCLUDED.expires_at
       WHERE current.phase = 'claimed' AND current.expires_at <= clock_timestamp()
     RETURNING generation`,
    [entryKey, owner],
  );
  return result.rows[0]?.generation ?? null;
}

/** Persist the known envelope hash BEFORE any send. Pending work never expires into a new send. */
export async function prepare(client, schema, entryKey, owner, generation, transactionHash) {
  const result = await client.query(
    `UPDATE ${schemaName(schema)}.claims
       SET phase = 'pending', transaction_hash = $4
     WHERE network = 'testnet' AND entry_key = $1 AND owner = $2 AND generation = $3
       AND phase = 'claimed' AND expires_at > clock_timestamp() RETURNING entry_key`,
    [entryKey, owner, generation, transactionHash],
  );
  return result.rowCount === 1;
}

/** Synthetic confirmation only: W3 must first reconcile this exact hash with the chain. */
export async function complete(client, schema, entryKey, transactionHash, record) {
  const table = schemaName(schema);
  await client.query('BEGIN');
  try {
    const updated = await client.query(
      `UPDATE ${table}.claims SET phase = 'completed'
       WHERE network = 'testnet' AND entry_key = $1 AND transaction_hash = $2
         AND phase = 'pending' RETURNING entry_key`,
      [entryKey, transactionHash],
    );
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(`INSERT INTO ${table}.history VALUES ('testnet', $1, $2, $3::jsonb)`, [
      entryKey,
      transactionHash,
      JSON.stringify(record),
    ]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
