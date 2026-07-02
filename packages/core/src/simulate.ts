import {
  BaseError,
  parseTransaction,
  recoverTransactionAddress,
  type Address,
  type Hex,
  type PublicClient,
  type StateOverride,
  type TransactionSerialized,
} from "viem";

export interface SimulateRequest {
  from?: Address;
  to: Address;
  data?: Hex;
  value?: bigint;
  gas?: bigint;
  /** pin to a historical block for replay (requires archive on old blocks) */
  blockNumber?: bigint;
  /** fake balances/allowances/storage/code — wired fully in Phase 5 */
  stateOverride?: StateOverride;
}

export type SimulateOutcome =
  | { status: "success"; returnData: Hex }
  | { status: "revert"; revertData: Hex; message: string }
  | { status: "error"; message: string };

interface RpcErrorLike {
  code?: number;
  data?: unknown;
  message?: string;
}

/** Dig raw revert bytes out of viem's wrapped error chain. */
function extractRevertData(err: unknown): Hex | undefined {
  let current: unknown = err;
  while (current !== null && typeof current === "object") {
    const { data } = current as RpcErrorLike;
    if (typeof data === "string" && data.startsWith("0x") && data.length > 2) {
      return data as Hex;
    }
    if (
      data !== null &&
      typeof data === "object" &&
      "data" in data &&
      typeof (data as { data: unknown }).data === "string"
    ) {
      return (data as { data: Hex }).data;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function isRevert(err: unknown): boolean {
  let current: unknown = err;
  while (current !== null && typeof current === "object") {
    const { code, message } = current as RpcErrorLike;
    if (code === 3) return true;
    if (typeof message === "string" && /revert/i.test(message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Layer (a) of the simulation engine (PLAN §5.3): eth_call, optionally
 * pinned to a block, optionally with state overrides. Returns the raw
 * outcome; decoding is the Phase 4 subsystem's job.
 */
export async function simulateCall(
  client: PublicClient,
  req: SimulateRequest,
): Promise<SimulateOutcome> {
  try {
    const { data } = await client.call({
      ...(req.from !== undefined ? { account: req.from } : {}),
      to: req.to,
      ...(req.data !== undefined ? { data: req.data } : {}),
      ...(req.value !== undefined ? { value: req.value } : {}),
      ...(req.gas !== undefined ? { gas: req.gas } : {}),
      ...(req.blockNumber !== undefined
        ? { blockNumber: req.blockNumber }
        : {}),
      ...(req.stateOverride !== undefined
        ? { stateOverride: req.stateOverride }
        : {}),
    });
    return { status: "success", returnData: data ?? "0x" };
  } catch (err) {
    const message =
      err instanceof BaseError
        ? err.shortMessage
        : err instanceof Error
          ? err.message
          : String(err);
    if (isRevert(err)) {
      return {
        status: "revert",
        revertData: extractRevertData(err) ?? "0x",
        message,
      };
    }
    return { status: "error", message };
  }
}

/**
 * Build a simulation request from a signed raw tx (PLAN §5.3 battle rules):
 * recover the sender — many nodes treat a missing `from` as msg.sender 0x0
 * and revert spuriously — and drop the signed fee fields, which go stale
 * and cause false failures. The gas limit is kept.
 */
export async function requestFromRawTx(raw: Hex): Promise<SimulateRequest> {
  const tx = parseTransaction(raw as TransactionSerialized);
  if (tx.to === undefined || tx.to === null) {
    throw new Error(
      "raw tx has no `to` address (contract creation is not simulatable here)",
    );
  }
  const from = await recoverTransactionAddress({
    serializedTransaction: raw as TransactionSerialized & { r: Hex; s: Hex },
  });
  return {
    from,
    to: tx.to,
    ...(tx.data !== undefined ? { data: tx.data } : {}),
    ...(tx.value !== undefined ? { value: tx.value } : {}),
    ...(tx.gas !== undefined ? { gas: tx.gas } : {}),
  };
}
