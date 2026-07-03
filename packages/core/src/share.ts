import type { Address, Hex } from "viem";

export interface ShareOverride {
  address: Address;
  stateDiff?: { slot: Hex; value: Hex }[];
  balance?: string;
}

/** A fully reproducible simulation request (strings so it JSON-serializes). */
export interface ShareState {
  chainId: number;
  to: Address;
  from?: Address;
  data?: Hex;
  value?: string;
  blockNumber?: string;
  overrides?: ShareOverride[];
  /** custom RPC for a BYO chain, so a permalink reproduces off-registry chains */
  rpcUrl?: string;
}

function toBase64Url(input: string): string {
  const b64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(input)))
      : Buffer.from(input, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  if (typeof atob === "function") {
    return decodeURIComponent(escape(atob(padded)));
  }
  return Buffer.from(padded, "base64").toString("utf8");
}

export function encodeShareState(state: ShareState): string {
  return toBase64Url(JSON.stringify(state));
}

function isValidShareState(value: unknown): value is ShareState {
  if (value === null || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return typeof s.chainId === "number" && typeof s.to === "string";
}

export function decodeShareState(encoded: string): ShareState | null {
  if (!encoded) return null;
  try {
    const json = fromBase64Url(encoded);
    const parsed = JSON.parse(json);
    return isValidShareState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
