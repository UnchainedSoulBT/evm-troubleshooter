import type { Address, Hex } from "viem";

export interface TraceNode {
  type: string; // CALL, DELEGATECALL, STATICCALL, CREATE, CREATE2, SELFDESTRUCT
  from: Address;
  to?: Address;
  value?: bigint;
  gas?: bigint;
  gasUsed?: bigint;
  input: Hex;
  output?: Hex;
  /** revert/error string as reported by the tracer */
  error?: string;
  /** decoded revert reason attached in the UI layer */
  revertReason?: string;
  logs?: TraceLog[];
  calls: TraceNode[];
  /** whether this node or any descendant reverted */
  reverted: boolean;
  depth: number;
}

export interface TraceLog {
  address: Address;
  topics: Hex[];
  data: Hex;
}

export type TraceSource = "debug_traceCall" | "trace_call" | "none";

export interface TraceResult {
  source: TraceSource;
  root: TraceNode | null;
  /** set when no tracer was available */
  unavailableReason?: string;
}

export interface AssetDelta {
  address: Address;
  /** null for native currency */
  token: Address | null;
  before: bigint;
  after: bigint;
  delta: bigint;
}
