/**
 * One definition each, shown as a tooltip. The words are the ones the audit
 * listed. Titles are the explanation; the visible word stays the product's.
 */
const GLOSSARY = {
  TTL: 'How many ledgers a Soroban entry stays live before it is archived or deleted. A ledger is about five seconds. The count is the truth; a date is an estimate.',
  rent: 'The XLM the network charges to extend that lifetime. It is separate from Evergreen’s fee.',
  allowance:
    'A capped permission for the engine to pull XLM from your wallet. It is not access to the contract. Email sign-in cannot grant it.',
  cap: 'The most the engine may pull before you approve again. A new approve replaces the cap. It does not add to it.',
  spender: 'The engine account your allowance names. Only that account can pull.',
  autopilot:
    'Evergreen extending a watched contract on a schedule, paid from your allowance, once the ledgers left fall below the threshold you set.',
  'blast radius':
    'Other contracts that share this code. If that shared entry is archived, they stop together.',
  'data keys':
    'Contract storage beyond the instance and the code. A scan without them does not cover those entries.',
} as const;

export type GlossaryWord = keyof typeof GLOSSARY;

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

export function term(word: GlossaryWord): string {
  return `<abbr class="term" title="${esc(GLOSSARY[word])}">${esc(word)}</abbr>`;
}

/** Every audited term, so a page can offer the full set without inventing copy. */
export function glossaryHtml(): string {
  const words = Object.keys(GLOSSARY) as GlossaryWord[];
  return `<details class="block glossary"><summary>Words used here</summary><p class="note">${words
    .map((word) => term(word))
    .join(' · ')}</p></details>`;
}
