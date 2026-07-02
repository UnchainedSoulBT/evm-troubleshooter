import type { Hash, PublicClient, Transaction, TransactionReceipt } from "viem";
import type { SimulateRequest } from "./simulate";

export interface FetchedTransaction {
  tx: Transaction;
  /** null while the transaction is still pending */
  receipt: TransactionReceipt | null;
}

/** Look up a transaction and its receipt; null when the hash is unknown. */
export async function fetchTransaction(
  client: PublicClient,
  hash: Hash,
): Promise<FetchedTransaction | null> {
  let tx: Transaction;
  try {
    tx = await client.getTransaction({ hash });
  } catch {
    return null;
  }
  const receipt = await client
    .getTransactionReceipt({ hash })
    .catch(() => null);
  return { tx, receipt };
}

/**
 * Turn a mined transaction into a historical-replay request. Pinned to the
 * parent block: eth_call at block N runs on post-block-N state, so the
 * closest cheap approximation of the tx's pre-state is block N−1 (exact
 * intra-block position replay needs tracing infra we intentionally skip).
 */
export function replayRequestFromTx(tx: Transaction): SimulateRequest {
  if (tx.to === null) {
    throw new Error("contract-creation transactions cannot be replayed here");
  }
  if (tx.blockNumber === null) {
    throw new Error("transaction is pending — nothing to replay yet");
  }
  return {
    from: tx.from,
    to: tx.to,
    data: tx.input,
    value: tx.value,
    gas: tx.gas,
    blockNumber: tx.blockNumber - 1n,
  };
}
