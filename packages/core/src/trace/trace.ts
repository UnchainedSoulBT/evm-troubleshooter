import { toHex, type Address, type Hex, type PublicClient } from "viem";
import type { SimulateRequest } from "../simulate";
import { normalizeCallTracer, normalizeParityTrace } from "./normalize";
import type { AssetDelta, TraceResult } from "./types";

function blockTag(req: SimulateRequest): Hex | "latest" {
  return req.blockNumber !== undefined ? toHex(req.blockNumber) : "latest";
}

function callObject(req: SimulateRequest) {
  return {
    ...(req.from !== undefined ? { from: req.from } : {}),
    to: req.to,
    ...(req.data !== undefined ? { data: req.data } : {}),
    ...(req.value !== undefined ? { value: toHex(req.value) } : {}),
    ...(req.gas !== undefined ? { gas: toHex(req.gas) } : {}),
  };
}

/**
 * Full call trace with the PLAN §5.3 fallback chain: debug_traceCall
 * (callTracer + withLog) → trace_call (Parity) → none. Both shapes
 * normalize into one tree model.
 */
export async function traceCall(
  client: PublicClient,
  req: SimulateRequest,
): Promise<TraceResult> {
  const tag = blockTag(req);

  try {
    const raw = await client.request({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      method: "debug_traceCall" as any,
      params: [
        callObject(req),
        tag,
        { tracer: "callTracer", tracerConfig: { withLog: true } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    if (raw && typeof raw === "object") {
      return {
        source: "debug_traceCall",
        root: normalizeCallTracer(
          raw as Parameters<typeof normalizeCallTracer>[0],
        ),
      };
    }
  } catch {
    // fall through to parity
  }

  try {
    const raw = await client.request({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      method: "trace_call" as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: [callObject(req), ["trace"], tag] as any,
    });
    if (Array.isArray(raw) && raw.length > 0) {
      return {
        source: "trace_call",
        root: normalizeParityTrace(
          raw as Parameters<typeof normalizeParityTrace>[0],
        ),
      };
    }
  } catch {
    // fall through to none
  }

  return {
    source: "none",
    root: null,
    unavailableReason:
      "This RPC does not support debug_traceCall or trace_call. Pass/fail simulation is still available; connect a trace-capable RPC for the full tree.",
  };
}

interface PrestateAccount {
  balance?: string;
  nonce?: number;
  code?: string;
  storage?: Record<string, string>;
}
type PrestateDiff = {
  pre: Record<string, PrestateAccount>;
  post: Record<string, PrestateAccount>;
};

function toBig(v: string | undefined): bigint {
  if (!v) return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

/**
 * Asset diff from prestateTracer (diff mode): native balance deltas per
 * account (PLAN §5.3). ERC-20 transfer deltas are derived from the trace
 * logs in the UI layer; this covers native value movement.
 */
export async function assetDiffFromPrestate(
  client: PublicClient,
  req: SimulateRequest,
): Promise<AssetDelta[]> {
  let raw: PrestateDiff;
  try {
    raw = (await client.request({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      method: "debug_traceCall" as any,
      params: [
        callObject(req),
        blockTag(req),
        { tracer: "prestateTracer", tracerConfig: { diffMode: true } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    })) as PrestateDiff;
  } catch {
    return [];
  }

  if (!raw || typeof raw !== "object" || !raw.pre) return [];

  const addresses = new Set<string>([
    ...Object.keys(raw.pre ?? {}),
    ...Object.keys(raw.post ?? {}),
  ]);

  const deltas: AssetDelta[] = [];
  for (const address of addresses) {
    const before = toBig(raw.pre?.[address]?.balance);
    const after = toBig(raw.post?.[address]?.balance);
    if (before !== after) {
      deltas.push({
        address: address as Address,
        token: null,
        before,
        after,
        delta: after - before,
      });
    }
  }
  return deltas;
}
