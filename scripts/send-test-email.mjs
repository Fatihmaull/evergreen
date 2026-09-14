// W1 evidence remains historical. W3 EmailChannel now owns the only Resend sender.
import console from 'node:console';
import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function runEmailSmoke({ args = [] } = {}) {
  const usage =
    'The W1 email probe is retired. Use pnpm email:notify --record <file> to preview a notification; --send is a separate explicit operation.';
  if (args.length !== 0 && !(args.length === 1 && args[0] === '--help')) throw new Error(usage);
  return { status: 'retired', usage };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await runEmailSmoke({ args: process.argv.slice(2) })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
