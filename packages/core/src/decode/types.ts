import type { Address, Hex } from "viem";

export interface DecodedParam {
  name?: string;
  type: string;
  value: unknown;
}

export type DecodeSource = "abi" | "builtin" | "selector-db" | "none";

export interface DecodedSubCall {
  /** where the sub-call is directed, when the container encodes it */
  to?: Address;
  value?: bigint;
  call: DecodedCall;
}

export interface DecodedCall {
  raw: Hex;
  selector: Hex;
  functionName?: string;
  signature?: string;
  args?: DecodedParam[];
  /** candidate signatures from the selector DB when nothing decoded */
  candidates?: string[];
  /** recursively expanded container payloads (multicall, Safe, EVC…) */
  subCalls?: DecodedSubCall[];
  source: DecodeSource;
}

export type DecodedRevert =
  | { kind: "empty"; message: string; raw: Hex }
  | { kind: "error-string"; message: string; reason: string; raw: Hex }
  | {
      kind: "panic";
      message: string;
      panicCode: number;
      panicDescription: string;
      raw: Hex;
    }
  | {
      kind: "custom";
      message: string;
      errorName: string;
      signature: string;
      args: DecodedParam[];
      source: DecodeSource;
      raw: Hex;
    }
  | { kind: "unknown"; message: string; candidates?: string[]; raw: Hex };

/** Network-backed signature lookup (openchain via the proxy); injectable. */
export type SelectorLookup = (
  selector: Hex,
  type: "function" | "error",
) => Promise<string[]>;

export interface DecodeOptions {
  abi?: import("viem").Abi;
  lookupSelector?: SelectorLookup;
  /** container recursion guard */
  maxDepth?: number;
}
