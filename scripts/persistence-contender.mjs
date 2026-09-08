// Separate OS process for the integration probe; never part of the offline test command.
import process from 'node:process';
import { claim, connect, schemaName } from './persistence-store.mjs';

const [schema, entryKey, owner, operation = 'claim'] = process.argv.slice(2);
let client;
try {
  schemaName(schema);
  client = await connect(process.env.PERSISTENCE_DATABASE_URL);
  const { rows } = await client.query('SELECT pg_backend_pid() AS pid');
  process.send({ ready: true, backendPid: rows[0].pid });
  process.once('message', async () => {
    try {
      const value =
        operation === 'read'
          ? (
              await client.query(
                `SELECT record FROM ${schemaName(schema)}.history ORDER BY entry_key`,
              )
            ).rows
          : await claim(client, schema, entryKey, owner);
      await client.end();
      process.send({ value }, () => process.disconnect());
    } catch {
      await client.end().catch(() => {});
      process.send({ failed: true }, () => process.disconnect());
      process.exitCode = 1;
    }
  });
} catch {
  if (client) await client.end().catch(() => {});
  if (process.send) process.send({ failed: true }, () => process.disconnect());
  process.exitCode = 1;
}
