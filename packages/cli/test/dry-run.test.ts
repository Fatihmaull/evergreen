import { describe, expect, it } from 'vitest';
import { runExtendCli } from '../src/extend.js';

/**
 * `W2-D11-04` — dry-run, exercised in BOTH directions.
 *
 * The task does not ask whether dry-run runs. It asks for proof that it does
 * **not submit**, which is a different claim: a run that silently did nothing
 * and a run that silently submitted look identical from the outside, and only
 * one of them costs money and moves a ledger.
 *
 * `W3-D19-02` states the requirement plainly — *prove it does not submit, not
 * just that it runs* — and names its ancestor: the `W1-D4-00` testnet guard
 * that refused every deploy and looked fine, because nothing ever failed
 * loudly. A safety default only ever observed permitting things has the same
 * shape.
 *
 * So the assertions here are about the seams that would have to be touched for
 * a submission to occur: the signer factory and the send call. Neither is
 * allowed to be reached.
 */

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const PAYER = 'GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE';

/**
 * The seam at this layer is `run(request, preview)`. A submission can only
 * happen if `request.submit` is true — `executeExtensions` gates the signer
 * factory and the send call on exactly that flag — so capturing what is passed
 * is capturing whether a submission was authorised.
 */
function spy() {
  const calls: { submit: boolean }[] = [];
  const deps = {
    sourceAccount: PAYER,
    readKeysFile: () => Promise.resolve('{"dataKeys":[]}'),
    run: (request: { submit: boolean }) => {
      calls.push({ submit: request.submit });
      // Shape mirrors ExtendReport as `runExtendCli` actually consumes it.
      return Promise.resolve({
        plan: { contractId: A, additionalLedgers: 1000, entries: [], warnings: [] },
        result: {
          mode: request.submit ? 'live' : 'dry-run',
          ok: true,
          records: [],
          skipped: [],
          unattempted: [],
        },
        previews: [],
      });
    },
    preview: () => {},
  } as unknown as Parameters<typeof runExtendCli>[1];
  return { deps, calls };
}

describe('W2-D11-04 — dry-run does not SUBMIT, not merely does not crash', () => {
  it('🔴 never authorises a submission when --submit is absent', async () => {
    const { deps, calls } = spy();
    const out = await runExtendCli(['extend', A, '--ledgers', '1000'], deps);
    expect(out.exitCode).toBe(0);
    // The load-bearing assertion: `executeExtensions` gates the signer factory
    // and the send call on this flag, so false here means no signature can exist.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.submit).toBe(false);
  });

  it('🔴 never authorises a submission with --dry-run stated explicitly', async () => {
    const { deps, calls } = spy();
    const out = await runExtendCli(['extend', A, '--ledgers', '1000', '--dry-run'], deps);
    expect(out.exitCode).toBe(0);
    expect(calls[0]?.submit).toBe(false);
  });

  it('says which mode it ran in, so the output is self-describing', async () => {
    const { deps } = spy();
    const out = await runExtendCli(['extend', A, '--ledgers', '1000'], deps);
    expect(`${out.stdout}${out.stderr}`).toMatch(/dry-run/i);
  });
});

describe('W2-D11-04 — the flag refuses a contradiction rather than resolving it', () => {
  it('🔴 rejects --submit and --dry-run together', async () => {
    // Any precedence rule here is a coin-flip on a live transaction. If
    // --submit wins, a script that added --dry-run for safety submits anyway.
    // If --dry-run wins, an operator who typed --submit believes they sent
    // something and did not.
    const { deps, calls } = spy();
    const out = await runExtendCli(
      ['extend', A, '--ledgers', '1000', '--submit', '--dry-run'],
      deps,
    );
    expect(out.exitCode).not.toBe(0);
    expect(out.stderr).toContain('mutually exclusive');
    // Refused before anything ran at all.
    expect(calls).toHaveLength(0);
  });

  it('explains that dry-run is already the default', async () => {
    const { deps } = spy();
    const out = await runExtendCli(
      ['extend', A, '--ledgers', '1000', '--dry-run', '--submit'],
      deps,
    );
    expect(out.stderr).toContain('already the default');
  });

  it('still rejects an unknown flag — the parser did not become permissive', async () => {
    // Adding one accepted flag is exactly when a parser quietly starts
    // accepting others.
    const { deps } = spy();
    const out = await runExtendCli(['extend', A, '--ledgers', '1000', '--yolo'], deps);
    expect(out.exitCode).not.toBe(0);
    expect(out.stderr).toContain('Unknown');
  });

  it('rejects a repeated --dry-run like any other repeated option', async () => {
    const { deps } = spy();
    const out = await runExtendCli(
      ['extend', A, '--ledgers', '1000', '--dry-run', '--dry-run'],
      deps,
    );
    expect(out.exitCode).not.toBe(0);
  });
});

describe('W2-D11-04 — the OTHER direction: --submit must still authorise', () => {
  it('🔴 passes submit:true when --submit is given with its required options', async () => {
    // Without this the suite proves only that nothing ever submits, which is
    // also what a completely broken command would prove. The guard has to
    // permit as well as refuse — the W1-D4-00 lesson.
    const { deps, calls } = spy();
    await runExtendCli(
      [
        'extend',
        A,
        '--ledgers',
        '1000',
        '--submit',
        '--secret-env',
        'X',
        '--max-fee-stroops',
        '100000',
      ],
      deps,
    );
    expect(calls[0]?.submit).toBe(true);
  });

  it('refuses --submit without a fee cap rather than submitting unbounded', async () => {
    const { deps, calls } = spy();
    const out = await runExtendCli(
      ['extend', A, '--ledgers', '1000', '--submit', '--secret-env', 'X'],
      deps,
    );
    expect(out.exitCode).not.toBe(0);
    expect(calls).toHaveLength(0);
  });
});
