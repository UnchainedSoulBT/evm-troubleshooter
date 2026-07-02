import type { PublicClient } from "viem";

export interface ChainCapabilities {
  clientVersion: string | null;
  /** null means the RPC was unreachable */
  latestBlock: bigint | null;
  /** supports debug_traceCall (rich traces) */
  debug: boolean;
  /** serves state at historical blocks (historical replay) */
  archive: boolean;
  estimateGas: boolean;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
/**
 * Full nodes keep roughly the last 128 blocks of state; probing well past
 * that window separates archive nodes from pruned ones.
 */
const ARCHIVE_PROBE_DEPTH = 10_000n;

async function ok(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return true;
  } catch {
    return false;
  }
}

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/**
 * Cheap, side-effect-free feature detection for an RPC endpoint (PLAN §5.5).
 * Every check degrades to false/null — a probe must never throw.
 */
export async function probeCapabilities(
  client: PublicClient,
): Promise<ChainCapabilities> {
  const latestBlock = await orNull(client.getBlockNumber());

  const historicalBlock =
    latestBlock === null || latestBlock <= ARCHIVE_PROBE_DEPTH
      ? 1n
      : latestBlock - ARCHIVE_PROBE_DEPTH;

  const [clientVersion, debug, archive, estimateGas] = await Promise.all([
    orNull(client.request({ method: "web3_clientVersion" }) as Promise<string>),
    ok(
      client.request({
        // viem types don't cover debug_* methods; this is a raw probe
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        method: "debug_traceCall" as any,
        params: [
          { to: ZERO_ADDRESS },
          "latest",
          { tracer: "callTracer" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
      }),
    ),
    latestBlock === null
      ? Promise.resolve(false)
      : ok(
          client.request({
            method: "eth_getBalance",
            params: [ZERO_ADDRESS, `0x${historicalBlock.toString(16)}`],
          }),
        ),
    ok(client.estimateGas({ account: ZERO_ADDRESS, to: ZERO_ADDRESS })),
  ]);

  return { clientVersion, latestBlock, debug, archive, estimateGas };
}
