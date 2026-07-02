import { encodeFunctionData, parseAbi, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { decodeCalldata } from "./calldata";

const ERC20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const DEAD = "0x000000000000000000000000000000000000dEaD" as const;
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;

const TRANSFER = encodeFunctionData({
  abi: ERC20,
  functionName: "transfer",
  args: [DEAD, 123n],
});

describe("decodeCalldata", () => {
  it("decodes with a user-supplied ABI (named args)", async () => {
    const decoded = await decodeCalldata(TRANSFER, { abi: ERC20 });
    expect(decoded.functionName).toBe("transfer");
    expect(decoded.source).toBe("abi");
    expect(decoded.args).toEqual([
      { name: "to", type: "address", value: DEAD },
      { name: "amount", type: "uint256", value: 123n },
    ]);
  });

  it("decodes ERC-20 calls with zero network lookups (builtin seed)", async () => {
    const decoded = await decodeCalldata(TRANSFER, {});
    expect(decoded.functionName).toBe("transfer");
    expect(decoded.source).toBe("builtin");
    expect(decoded.args?.[1]?.value).toBe(123n);
  });

  it("falls back to the selector DB and decodes with the first fitting candidate", async () => {
    const abi = parseAbi(["function frobnicate(uint256 x)"]);
    const data = encodeFunctionData({
      abi,
      functionName: "frobnicate",
      args: [42n],
    });
    const decoded = await decodeCalldata(data, {
      lookupSelector: async () => ["frobnicate(uint256)"],
    });
    expect(decoded.functionName).toBe("frobnicate");
    expect(decoded.source).toBe("selector-db");
    expect(decoded.args?.[0]?.value).toBe(42n);
  });

  it("surfaces candidates when nothing decodes", async () => {
    const decoded = await decodeCalldata("0xdeadbeef" as Hex, {
      lookupSelector: async () => ["mystery(uint256)"],
    });
    expect(decoded.source).toBe("none");
    expect(decoded.candidates).toEqual(["mystery(uint256)"]);
    expect(decoded.selector).toBe("0xdeadbeef");
  });

  it("expands multicall(bytes[]) into decoded sub-calls (§8 scenario 3)", async () => {
    const inner1 = encodeFunctionData({
      abi: ERC20,
      functionName: "approve",
      args: [USDC, 500n],
    });
    const inner2 = TRANSFER;
    const multicall = encodeFunctionData({
      abi: parseAbi(["function multicall(bytes[] data)"]),
      functionName: "multicall",
      args: [[inner1, inner2]],
    });

    const decoded = await decodeCalldata(multicall, {});
    expect(decoded.functionName).toBe("multicall");
    expect(decoded.subCalls).toHaveLength(2);
    expect(decoded.subCalls?.[0]?.call.functionName).toBe("approve");
    expect(decoded.subCalls?.[1]?.call.functionName).toBe("transfer");
  });

  it("expands the deadline variant multicall(uint256,bytes[])", async () => {
    const multicall = encodeFunctionData({
      abi: parseAbi(["function multicall(uint256 deadline, bytes[] data)"]),
      functionName: "multicall",
      args: [1_700_000_000n, [TRANSFER]],
    });
    const decoded = await decodeCalldata(multicall, {});
    expect(decoded.subCalls).toHaveLength(1);
    expect(decoded.subCalls?.[0]?.call.functionName).toBe("transfer");
  });

  it("expands Gnosis Safe execTransaction with target + value", async () => {
    const safeAbi = parseAbi([
      "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)",
    ]);
    const exec = encodeFunctionData({
      abi: safeAbi,
      functionName: "execTransaction",
      args: [USDC, 0n, TRANSFER, 0, 0n, 0n, 0n, DEAD, DEAD, "0x"],
    });
    const decoded = await decodeCalldata(exec, {});
    expect(decoded.subCalls).toHaveLength(1);
    expect(decoded.subCalls?.[0]?.to).toBe(USDC);
    expect(decoded.subCalls?.[0]?.value).toBe(0n);
    expect(decoded.subCalls?.[0]?.call.functionName).toBe("transfer");
  });

  it("expands Multicall3 aggregate3 and EVC batch", async () => {
    const m3 = encodeFunctionData({
      abi: parseAbi([
        "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) returns ((bool success, bytes returnData)[])",
      ]),
      functionName: "aggregate3",
      args: [[{ target: USDC, allowFailure: false, callData: TRANSFER }]],
    });
    const decodedM3 = await decodeCalldata(m3, {});
    expect(decodedM3.subCalls?.[0]?.to).toBe(USDC);
    expect(decodedM3.subCalls?.[0]?.call.functionName).toBe("transfer");

    const evc = encodeFunctionData({
      abi: parseAbi([
        "function batch((address targetContract, address onBehalfOfAccount, uint256 value, bytes data)[] items)",
      ]),
      functionName: "batch",
      args: [
        [
          {
            targetContract: USDC,
            onBehalfOfAccount: DEAD,
            value: 0n,
            data: TRANSFER,
          },
        ],
      ],
    });
    const decodedEvc = await decodeCalldata(evc, {});
    expect(decodedEvc.subCalls?.[0]?.to).toBe(USDC);
    expect(decodedEvc.subCalls?.[0]?.call.functionName).toBe("transfer");
  });

  it("caps container recursion depth", async () => {
    const multicallAbi = parseAbi(["function multicall(bytes[] data)"]);
    let payload: Hex = TRANSFER;
    for (let i = 0; i < 8; i++) {
      payload = encodeFunctionData({
        abi: multicallAbi,
        functionName: "multicall",
        args: [[payload]],
      });
    }
    const decoded = await decodeCalldata(payload, { maxDepth: 3 });
    let depth = 0;
    let cursor = decoded;
    while (cursor.subCalls?.[0]) {
      depth++;
      cursor = cursor.subCalls[0].call;
    }
    expect(depth).toBeLessThanOrEqual(3);
  });
});
