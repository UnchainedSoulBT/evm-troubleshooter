/**
 * JSON-RPC methods the proxy will relay (PLAN §5.7). Everything else —
 * account, admin, signing, and node-management methods — is rejected.
 */
const ALLOWED_METHODS = new Set([
  "eth_call",
  "eth_estimateGas",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getBalance",
  "eth_getStorageAt",
  "eth_getLogs",
  "eth_chainId",
  "eth_blockNumber",
  "eth_gasPrice",
  "eth_feeHistory",
  "eth_maxPriorityFeePerGas",
  "web3_clientVersion",
  "debug_traceCall",
  "trace_call",
  "eth_sendRawTransaction",
]);

export function isMethodAllowed(method: unknown): method is string {
  return typeof method === "string" && ALLOWED_METHODS.has(method);
}
