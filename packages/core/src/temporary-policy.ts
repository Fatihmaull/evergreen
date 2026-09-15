import { Address, xdr } from '@stellar/stellar-sdk';
import type { EvergreenConfig } from '@evergreen-stellar/shared-types';

/** Canonical declared key; only temporary ContractData can carry retention consent. */
export function temporaryKey(value: string, owner: string): string {
  const key = xdr.LedgerKey.fromXDR(value.trim(), 'base64');
  if (
    key.type !== 'contractData' ||
    key.contractData.durability.name !== 'temporary' ||
    key.contractData.key.type === 'scvLedgerKeyContractInstance' ||
    Address.fromScAddress(key.contractData.contract).toString() !== owner
  )
    throw new Error('Expected a temporary key owned by this contract');
  return key.toXDR('base64');
}

export function temporaryConsent(
  config: EvergreenConfig,
  entryKey: string,
  owner: string,
): { allowed: boolean; reason: string } {
  const disabled = {
    allowed: false,
    reason:
      'Temporary retention disabled: every registration must explicitly opt in for this declared key.',
  };
  try {
    const key = temporaryKey(entryKey, owner);
    const rows = config.contracts.filter((c) => c.id === owner);
    if (!rows.length) return disabled;
    for (const row of rows) {
      if (!row.dataKeys?.some((k) => k.trim() === key)) return disabled;
      const policies =
        row.temporaryEntryPolicies?.filter((p) => temporaryKey(p.entryKey, owner) === key) ?? [];
      if (policies.length !== 1 || policies[0]?.autoExtend !== true) return disabled;
    }
    return {
      allowed: true,
      reason: 'Temporary retention explicitly enabled for this key by every registration.',
    };
  } catch {
    return disabled;
  }
}
