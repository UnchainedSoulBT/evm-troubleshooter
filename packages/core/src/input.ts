import {
  isAddress,
  parseTransaction,
  type Address,
  type Hex,
  type TransactionSerialized,
} from "viem";

export type InputKind =
  "txHash" | "calldata" | "rawTx" | "jsonRequest" | "unknown";

export interface JsonCallRequest {
  from?: Address;
  to: Address;
  data?: Hex;
  value?: bigint;
  gas?: bigint;
  blockNumber?: bigint;
}

export type DetectedInput =
  | { kind: "txHash"; hash: Hex }
  | { kind: "rawTx"; raw: Hex; chainId?: number }
  | { kind: "calldata"; data: Hex }
  | { kind: "jsonRequest"; request: JsonCallRequest }
  | { kind: "unknown"; reason: string };

const HEX_RE = /^0x[0-9a-fA-F]*$/;

export function isHexData(value: string): boolean {
  return HEX_RE.test(value) && value.length % 2 === 0;
}

function toBigInt(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value))
    return BigInt(value);
  if (typeof value === "string" && value !== "") {
    try {
      return BigInt(value); // handles both decimal and 0x-hex strings
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseJsonRequest(value: string): DetectedInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { kind: "unknown", reason: "invalid JSON" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "unknown", reason: "JSON input must be an object" };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.to !== "string" || !isAddress(obj.to)) {
    return {
      kind: "unknown",
      reason: "JSON request needs a valid `to` address",
    };
  }
  const request: JsonCallRequest = { to: obj.to };
  if (typeof obj.from === "string" && isAddress(obj.from))
    request.from = obj.from;
  if (typeof obj.data === "string" && isHexData(obj.data))
    request.data = obj.data as Hex;
  const value_ = toBigInt(obj.value);
  if (value_ !== undefined) request.value = value_;
  const gas = toBigInt(obj.gas);
  if (gas !== undefined) request.gas = gas;
  const blockNumber = toBigInt(obj.blockNumber);
  if (blockNumber !== undefined) request.blockNumber = blockNumber;
  return { kind: "jsonRequest", request };
}

/**
 * Classify a pasted input: tx hash (32-byte hex), signed raw tx (parseable
 * RLP / typed-tx envelope, with its embedded chainId when present), plain
 * calldata, or a JSON call request.
 */
export function detectInput(rawInput: string): DetectedInput {
  const value = rawInput.trim();

  if (value.startsWith("{")) return parseJsonRequest(value);

  if (!isHexData(value)) {
    return { kind: "unknown", reason: "input is not 0x-prefixed hex or JSON" };
  }
  if (value === "0x") {
    return { kind: "unknown", reason: "empty hex input" };
  }
  if (value.length === 66) {
    return { kind: "txHash", hash: value as Hex };
  }

  try {
    const tx = parseTransaction(value as TransactionSerialized);
    // signed-payload guard: unsigned serialized txs also parse; a raw tx
    // for simulation/broadcast must carry a signature
    if (tx.r !== undefined && tx.s !== undefined) {
      return {
        kind: "rawTx",
        raw: value as Hex,
        ...(tx.chainId !== undefined ? { chainId: tx.chainId } : {}),
      };
    }
  } catch {
    // not a raw tx — fall through to calldata
  }

  return { kind: "calldata", data: value as Hex };
}

/** Kind-only convenience over {@link detectInput}. */
export function detectInputKind(rawInput: string): InputKind {
  return detectInput(rawInput).kind;
}
