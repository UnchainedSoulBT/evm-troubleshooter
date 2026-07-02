interface Entry {
  value: string;
  expiresAt: number;
}

export interface CacheOptions {
  maxEntries: number;
  ttlMs: number;
  now?: () => number;
}

/** Tiny LRU with TTL for immutable JSON-RPC reads. */
export function createCache(opts: CacheOptions) {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, Entry>();

  return {
    get(key: string): string | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      // refresh recency
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key: string, value: string) {
      if (entries.size >= opts.maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { value, expiresAt: now() + opts.ttlMs });
    },
  };
}

const CACHEABLE_METHODS = new Set([
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getCode",
  "eth_getBlockByNumber",
]);

function isHexBlockTag(tag: unknown): boolean {
  return typeof tag === "string" && /^0x[0-9a-fA-F]+$/.test(tag);
}

/**
 * Whether a request/response pair is immutable and safe to cache:
 * mined transactions/receipts, code/blocks pinned to a numeric block.
 * "latest"/"pending" tagged reads and unmined lookups never cache.
 */
export function isCacheable(
  method: string,
  params: unknown[],
  result: unknown,
): boolean {
  if (!CACHEABLE_METHODS.has(method)) return false;
  if (result === null || result === undefined) return false;

  switch (method) {
    case "eth_getTransactionByHash":
    case "eth_getTransactionReceipt":
      return (result as { blockNumber?: unknown }).blockNumber != null;
    case "eth_getCode":
      return isHexBlockTag(params[1]);
    case "eth_getBlockByNumber":
      return isHexBlockTag(params[0]);
    default:
      return false;
  }
}

export function cacheKey(
  upstream: string,
  method: string,
  params: unknown[],
): string {
  return `${upstream}|${method}|${JSON.stringify(params)}`;
}
