import type { Address, Hex } from "viem";

export interface ContainerItem {
  to?: Address;
  value?: bigint;
  data: Hex;
}

type Unpacker = (args: readonly unknown[]) => ContainerItem[];

const bytesArray = (value: unknown): Hex[] =>
  Array.isArray(value) ? (value as Hex[]) : [];

/**
 * Container-call registry (PLAN §5.4): canonical signature → how to unpack
 * its sub-calls. Keys must match `signatureOf` in calldata.ts.
 */
export const CONTAINER_UNPACKERS: ReadonlyMap<string, Unpacker> = new Map<
  string,
  Unpacker
>([
  // Uniswap V3 periphery & friends
  [
    "multicall(bytes[])",
    (args) => bytesArray(args[0]).map((data) => ({ data })),
  ],
  [
    "multicall(uint256,bytes[])",
    (args) => bytesArray(args[1]).map((data) => ({ data })),
  ],
  [
    "multicall(bytes32,bytes[])",
    (args) => bytesArray(args[1]).map((data) => ({ data })),
  ],
  // Gnosis Safe
  [
    "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)",
    (args) => [
      {
        to: args[0] as Address,
        value: args[1] as bigint,
        data: args[2] as Hex,
      },
    ],
  ],
  // Multicall3
  [
    "aggregate((address,bytes)[])",
    (args) =>
      (args[0] as { target: Address; callData: Hex }[]).map((c) => ({
        to: c.target,
        data: c.callData,
      })),
  ],
  [
    "aggregate3((address,bool,bytes)[])",
    (args) =>
      (args[0] as { target: Address; callData: Hex }[]).map((c) => ({
        to: c.target,
        data: c.callData,
      })),
  ],
  [
    "aggregate3Value((address,bool,uint256,bytes)[])",
    (args) =>
      (args[0] as { target: Address; value: bigint; callData: Hex }[]).map(
        (c) => ({ to: c.target, value: c.value, data: c.callData }),
      ),
  ],
  // Ethereum Vault Connector
  [
    "batch((address,address,uint256,bytes)[])",
    (args) =>
      (
        args[0] as {
          targetContract: Address;
          value: bigint;
          data: Hex;
        }[]
      ).map((item) => ({
        to: item.targetContract,
        value: item.value,
        data: item.data,
      })),
  ],
]);

/**
 * Container signatures that must decode without network lookups — merged
 * into the builtin seed by constants consumers.
 */
export const CONTAINER_SIGNATURES = [
  "function multicall(bytes[] data)",
  "function multicall(uint256 deadline, bytes[] data)",
  "function multicall(bytes32 previousBlockhash, bytes[] data)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)",
  "function aggregate((address target, bytes callData)[] calls) returns (uint256 blockNumber, bytes[] returnData)",
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) returns ((bool success, bytes returnData)[] returnData)",
  "function aggregate3Value((address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
  "function batch((address targetContract, address onBehalfOfAccount, uint256 value, bytes data)[] items) payable",
  // Permit2 — decoded (not expanded); shown with named tuple fields
  "function permit(address owner, ((address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline) permitSingle, bytes signature)",
  "function permit(address owner, ((address token, uint160 amount, uint48 expiration, uint48 nonce)[] details, address spender, uint256 sigDeadline) permitBatch, bytes signature)",
] as const;
