import { describe, expect, it } from "vitest";
import { toMarkdownReport } from "./report";
import type { DecodedCall, DecodedRevert } from "./decode/types";
import type { SimulateOutcome, SimulateRequest } from "./simulate";

const request: SimulateRequest = {
  from: "0x000000000000000000000000000000000000dEaD",
  to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  data: "0x23b872dd",
  value: 0n,
};

const decodedCall: DecodedCall = {
  raw: "0x23b872dd",
  selector: "0x23b872dd",
  functionName: "transferFrom",
  signature: "transferFrom(address,address,uint256)",
  args: [
    { name: "from", type: "address", value: request.from },
    { name: "to", type: "address", value: request.to },
    { name: "amount", type: "uint256", value: 1000000n },
  ],
  source: "builtin",
};

const revert: DecodedRevert = {
  kind: "error-string",
  reason: "ERC20: transfer amount exceeds allowance",
  message: "reverted: ERC20: transfer amount exceeds allowance",
  raw: "0x08c379a0",
};

describe("toMarkdownReport", () => {
  it("includes chain, request, decode, and result sections", () => {
    const outcome: SimulateOutcome = {
      status: "revert",
      revertData: "0x08c379a0",
      message: "reverted",
    };
    const md = toMarkdownReport({
      chainName: "Ethereum",
      chainId: 1,
      request,
      outcome,
      decodedCall,
      decodedRevert: revert,
    });
    expect(md).toContain("# EVM Transaction Troubleshooter report");
    expect(md).toContain("Ethereum");
    expect(md).toContain("transferFrom(address,address,uint256)");
    expect(md).toContain("ERC20: transfer amount exceeds allowance");
    expect(md).toContain("Reverted");
    // bigints render as decimal strings, never [object Object]
    expect(md).not.toContain("[object");
    expect(md).toContain("1000000");
  });

  it("renders a success outcome with return data", () => {
    const md = toMarkdownReport({
      chainName: "Base",
      chainId: 8453,
      request,
      outcome: { status: "success", returnData: "0x01" },
    });
    expect(md).toContain("Success");
    expect(md).toContain("0x01");
  });
});
