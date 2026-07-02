import type { SelectorLookup } from "@evm-troubleshooter/core";
import { parseAbi, type Abi, type Address } from "viem";

// module-level caches: signatures and verified ABIs are immutable
const selectorCache = new Map<string, string[]>();
const abiCache = new Map<string, Abi | null>();

/** Selector-DB lookup through the app's proxy (openchain, cached). */
export const lookupSelector: SelectorLookup = async (selector, type) => {
  const key = `${type}|${selector}`;
  const cached = selectorCache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(`/api/selectors/${type}/${selector}`);
    if (!res.ok) return [];
    const { results } = (await res.json()) as { results: string[] };
    selectorCache.set(key, results);
    return results;
  } catch {
    return [];
  }
};

/** Resolve a verified ABI via the proxy (Sourcify → Etherscan), cached. */
export async function fetchVerifiedAbi(
  chainId: number,
  address: Address,
): Promise<Abi | null> {
  const key = `${chainId}|${address.toLowerCase()}`;
  if (abiCache.has(key)) return abiCache.get(key) ?? null;
  try {
    const res = await fetch(`/api/abi/${chainId}/${address}`);
    if (!res.ok) {
      abiCache.set(key, null);
      return null;
    }
    const { abi } = (await res.json()) as { abi: Abi };
    abiCache.set(key, abi);
    return abi;
  } catch {
    return null;
  }
}

/**
 * Parse a user-pasted ABI: a JSON ABI array, or human-readable signatures
 * (one per line). Returns null when it parses to nothing usable.
 */
export function parseUserAbi(text: string): Abi | null {
  const value = text.trim();
  if (!value) return null;
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as Abi;
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }
  try {
    const lines = value
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const abi = parseAbi(lines);
    return abi.length > 0 ? abi : null;
  } catch {
    return null;
  }
}

/** Display helper: stringify decoded arg values (bigint-safe). */
export function formatArgValue(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  if (Array.isArray(value) || (value !== null && typeof value === "object")) {
    return JSON.stringify(value, (_, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  }
  return String(value);
}
