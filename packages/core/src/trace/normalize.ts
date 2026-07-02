import type { Address, Hex } from "viem";
import type { TraceLog, TraceNode } from "./types";

function toBigInt(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && value.startsWith("0x")) {
    try {
      return BigInt(value);
    } catch {
      return undefined;
    }
  }
  if (typeof value === "number") return BigInt(value);
  return undefined;
}

interface GethCall {
  type?: string;
  from?: string;
  to?: string;
  value?: string;
  gas?: string;
  gasUsed?: string;
  input?: string;
  output?: string;
  error?: string;
  revertReason?: string;
  calls?: GethCall[];
  logs?: { address?: string; topics?: string[]; data?: string }[];
}

/** Geth/Erigon/Nethermind callTracer output → normalized tree. */
export function normalizeCallTracer(raw: GethCall, depth = 0): TraceNode {
  const children = (raw.calls ?? []).map((c) =>
    normalizeCallTracer(c, depth + 1),
  );
  const selfReverted = raw.error !== undefined && raw.error !== "";
  const reverted = selfReverted || children.some((c) => c.reverted);

  const logs: TraceLog[] | undefined = raw.logs?.map((l) => ({
    address: (l.address ?? "0x") as Address,
    topics: (l.topics ?? []) as Hex[],
    data: (l.data ?? "0x") as Hex,
  }));

  const node: TraceNode = {
    type: raw.type ?? "CALL",
    from: (raw.from ?? "0x") as Address,
    input: (raw.input ?? "0x") as Hex,
    calls: children,
    reverted,
    depth,
  };
  if (raw.to) node.to = raw.to as Address;
  const value = toBigInt(raw.value);
  if (value !== undefined) node.value = value;
  const gas = toBigInt(raw.gas);
  if (gas !== undefined) node.gas = gas;
  const gasUsed = toBigInt(raw.gasUsed);
  if (gasUsed !== undefined) node.gasUsed = gasUsed;
  if (raw.output) node.output = raw.output as Hex;
  if (selfReverted) node.error = raw.error;
  if (raw.revertReason) node.revertReason = raw.revertReason;
  if (logs?.length) node.logs = logs;
  return node;
}

interface ParityTrace {
  traceAddress?: number[];
  type?: string;
  error?: string;
  action?: {
    from?: string;
    to?: string;
    value?: string;
    gas?: string;
    input?: string;
    callType?: string;
  };
  result?: { gasUsed?: string; output?: string };
}

/**
 * Parity/OpenEthereum/Erigon `trace_call` output is a flat list keyed by
 * traceAddress path; rebuild the tree (PLAN §5.3 fallback chain).
 */
export function normalizeParityTrace(raw: ParityTrace[]): TraceNode {
  const nodeFor = (t: ParityTrace, depth: number): TraceNode => {
    const selfReverted = t.error !== undefined && t.error !== "";
    const node: TraceNode = {
      type: (t.action?.callType ?? t.type ?? "call").toUpperCase(),
      from: (t.action?.from ?? "0x") as Address,
      input: (t.action?.input ?? "0x") as Hex,
      calls: [],
      reverted: selfReverted,
      depth,
    };
    if (t.action?.to) node.to = t.action.to as Address;
    const value = toBigInt(t.action?.value);
    if (value !== undefined) node.value = value;
    const gas = toBigInt(t.action?.gas);
    if (gas !== undefined) node.gas = gas;
    const gasUsed = toBigInt(t.result?.gasUsed);
    if (gasUsed !== undefined) node.gasUsed = gasUsed;
    if (t.result?.output) node.output = t.result.output as Hex;
    if (selfReverted) node.error = t.error;
    return node;
  };

  const sorted = [...raw].sort(
    (a, b) => (a.traceAddress?.length ?? 0) - (b.traceAddress?.length ?? 0),
  );
  const byPath = new Map<string, TraceNode>();
  let root: TraceNode | null = null;

  for (const t of sorted) {
    const path = t.traceAddress ?? [];
    const node = nodeFor(t, path.length);
    byPath.set(path.join("."), node);
    if (path.length === 0) {
      root = node;
    } else {
      const parent = byPath.get(path.slice(0, -1).join("."));
      parent?.calls.push(node);
    }
  }

  // bubble reverts up
  const bubble = (n: TraceNode): boolean => {
    const childReverted = n.calls.map(bubble).some(Boolean);
    n.reverted = n.reverted || childReverted;
    return n.reverted;
  };
  if (root) bubble(root);

  return root ?? nodeFor(sorted[0] ?? {}, 0);
}
