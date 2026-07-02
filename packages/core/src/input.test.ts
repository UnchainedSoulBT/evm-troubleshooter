import { parseEther, serializeTransaction } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { detectInput, detectInputKind, isHexData } from "./input";

// well-known anvil dev key #0 — test-only material
const DEV_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("isHexData", () => {
  it("accepts 0x-prefixed even-length hex", () => {
    expect(isHexData("0xdeadbeef")).toBe(true);
    expect(isHexData("0x")).toBe(true);
  });

  it("rejects odd-length, unprefixed, or non-hex input", () => {
    expect(isHexData("0xabc")).toBe(false);
    expect(isHexData("deadbeef")).toBe(false);
    expect(isHexData("0xzz")).toBe(false);
  });
});

describe("detectInput", () => {
  it("classifies a 32-byte hash", () => {
    const hash =
      "0x60286c0fee3a46697e3ea4b04bc229f5db4b65d001d93563351fb66d81301561";
    expect(detectInput(hash)).toEqual({ kind: "txHash", hash });
    expect(detectInputKind(hash)).toBe("txHash");
  });

  it("classifies a signed EIP-1559 raw tx and extracts its chainId", async () => {
    const account = privateKeyToAccount(DEV_KEY);
    const serialized = await account.signTransaction({
      chainId: 8453,
      type: "eip1559",
      to: "0x000000000000000000000000000000000000dEaD",
      value: parseEther("0.01"),
      nonce: 0,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      gas: 21_000n,
    });
    const detected = detectInput(serialized);
    expect(detected.kind).toBe("rawTx");
    if (detected.kind === "rawTx") {
      expect(detected.chainId).toBe(8453);
    }
  });

  it("classifies a signed legacy raw tx", () => {
    // legacy tx without EIP-155 protection, signed shape (r/s/v present)
    const serialized = serializeTransaction(
      {
        type: "legacy",
        to: "0x000000000000000000000000000000000000dEaD",
        value: 1n,
        nonce: 0,
        gasPrice: 1_000_000_000n,
        gas: 21_000n,
        chainId: 1,
      },
      {
        r: "0x1b5e176d927f8e9ab405058b2d2457392da3e20f328b16ddabcebc33eaac5fea",
        s: "0x4ba69724e8f69de52f0125ad8b3c5c2cef33019bac3249e2c0a2192766d1721c",
        v: 37n,
      },
    );
    const detected = detectInput(serialized);
    expect(detected.kind).toBe("rawTx");
    if (detected.kind === "rawTx") expect(detected.chainId).toBe(1);
  });

  it("classifies 4-byte-selector calldata", () => {
    const data =
      "0xa9059cbb000000000000000000000000000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000000000000000001";
    expect(detectInput(data)).toEqual({ kind: "calldata", data });
  });

  it("classifies a JSON call request with hex and decimal fields", () => {
    const detected = detectInput(
      JSON.stringify({
        from: "0x000000000000000000000000000000000000dEaD",
        to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        data: "0x70a08231",
        value: "1000000000000000000",
        blockNumber: "0x112a880",
      }),
    );
    expect(detected.kind).toBe("jsonRequest");
    if (detected.kind === "jsonRequest") {
      expect(detected.request.to).toBe(
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      );
      expect(detected.request.value).toBe(1000000000000000000n);
      expect(detected.request.blockNumber).toBe(18_000_000n);
    }
  });

  it("rejects a JSON request without a target address", () => {
    const detected = detectInput(JSON.stringify({ data: "0x70a08231" }));
    expect(detected.kind).toBe("unknown");
  });

  it("returns unknown for empty or non-hex input", () => {
    expect(detectInput("0x").kind).toBe("unknown");
    expect(detectInput("hello").kind).toBe("unknown");
    expect(detectInputKind("hello")).toBe("unknown");
  });
});
