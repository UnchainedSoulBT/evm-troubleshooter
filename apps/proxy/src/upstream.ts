import { getChain } from "@evm-troubleshooter/core";

/**
 * Resolve the upstream RPC for a chainId. A server-side env var
 * `RPC_URL_<chainId>` (paid/keyed provider) takes precedence over the
 * public registry RPC. Keys therefore never reach the client.
 */
export function resolveUpstream(
  chainId: number,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env[`RPC_URL_${chainId}`] ?? getChain(chainId)?.rpcUrl;
}

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i,
];

/**
 * SSRF guard for the verbatim relay: only http(s) to public hosts, unless
 * ALLOW_PRIVATE_RPC=1 (local dev/tests against anvil).
 */
export function isRelayUrlAllowed(
  raw: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (env.ALLOW_PRIVATE_RPC === "1") return true;
  return !PRIVATE_HOST_PATTERNS.some((p) => p.test(url.hostname));
}
