export type InputKind = "txHash" | "calldata" | "rawTx" | "unknown";

const HEX_RE = /^0x[0-9a-fA-F]*$/;

export function isHexData(value: string): boolean {
  return HEX_RE.test(value) && value.length % 2 === 0;
}

/**
 * Classify a pasted input. A 32-byte hex string is a tx hash; RLP/typed-tx
 * payloads (raw txs) and plain calldata are disambiguated in Phase 3 — for
 * now any other even-length hex is treated as calldata.
 */
export function detectInputKind(raw: string): InputKind {
  const value = raw.trim();
  if (!isHexData(value)) return "unknown";
  if (value.length === 66) return "txHash";
  if (value.length > 2) return "calldata";
  return "unknown";
}
