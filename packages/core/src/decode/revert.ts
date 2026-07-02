import {
  decodeAbiParameters,
  decodeErrorResult,
  parseAbiItem,
  toFunctionSelector,
  type AbiParameter,
  type Hex,
} from "viem";

interface AbiError {
  type: "error";
  name: string;
  inputs: readonly AbiParameter[];
}
import { COMMON_ERROR_SIGNATURES, PANIC_CODES } from "./constants";
import type { DecodedParam, DecodedRevert, DecodeOptions } from "./types";

const ERROR_STRING_SELECTOR = "0x08c379a0";
const PANIC_SELECTOR = "0x4e487b71";

function errorSelector(item: AbiError): string {
  // errors share the 4-byte keccak selector rule with functions
  return toFunctionSelector(
    `function ${item.name}(${item.inputs.map((p) => p.type).join(",")})`,
  );
}

const BUILTIN_ERRORS: ReadonlyMap<string, AbiError> = new Map(
  COMMON_ERROR_SIGNATURES.map((sig) => {
    const item = parseAbiItem(sig) as AbiError;
    return [errorSelector(item), item];
  }),
);

function toParams(item: AbiError, values: readonly unknown[]): DecodedParam[] {
  return item.inputs.map((input, i) => ({
    ...(input.name ? { name: input.name } : {}),
    type: input.type,
    value: values[i],
  }));
}

function signatureOf(item: AbiError): string {
  return `${item.name}(${item.inputs.map((p) => p.type).join(",")})`;
}

function tryCustom(
  data: Hex,
  item: AbiError,
  source: "abi" | "builtin" | "selector-db",
): DecodedRevert | null {
  try {
    const { args } = decodeErrorResult({ abi: [item], data });
    const params = toParams(item, (args ?? []) as readonly unknown[]);
    return {
      kind: "custom",
      errorName: item.name,
      signature: signatureOf(item),
      args: params,
      source,
      message: `reverted with ${item.name}(${params
        .map((p) => String(p.value))
        .join(", ")})`,
      raw: data,
    };
  } catch {
    return null;
  }
}

/**
 * Decode revert data (PLAN §5.4): Error(string), Panic(uint256) with the
 * Solidity panic map, then custom errors via user ABI → builtin seed →
 * selector DB candidates.
 */
export async function decodeRevert(
  data: Hex,
  opts: DecodeOptions = {},
): Promise<DecodedRevert> {
  if (data === "0x" || data.length < 10) {
    return {
      kind: "empty",
      message:
        "reverted without data — an assert in old Solidity, a require without a message, or an out-of-gas",
      raw: data,
    };
  }

  const selector = data.slice(0, 10).toLowerCase();

  if (selector === ERROR_STRING_SELECTOR) {
    try {
      const [reason] = decodeAbiParameters(
        [{ type: "string" }],
        `0x${data.slice(10)}` as Hex,
      );
      return {
        kind: "error-string",
        reason,
        message: `reverted: ${reason}`,
        raw: data,
      };
    } catch {
      // malformed Error(string) — fall through to unknown
    }
  }

  if (selector === PANIC_SELECTOR) {
    try {
      const [code] = decodeAbiParameters(
        [{ type: "uint256" }],
        `0x${data.slice(10)}` as Hex,
      );
      const panicCode = Number(code);
      const panicDescription =
        PANIC_CODES[panicCode] ??
        `unknown panic code 0x${panicCode.toString(16)}`;
      return {
        kind: "panic",
        panicCode,
        panicDescription,
        message: `panicked (0x${panicCode.toString(16)}): ${panicDescription}`,
        raw: data,
      };
    } catch {
      // malformed Panic — fall through
    }
  }

  if (opts.abi) {
    for (const item of opts.abi) {
      if (item.type !== "error") continue;
      const decoded = tryCustom(data, item, "abi");
      if (decoded) return decoded;
    }
  }

  const builtin = BUILTIN_ERRORS.get(selector);
  if (builtin) {
    const decoded = tryCustom(data, builtin, "builtin");
    if (decoded) return decoded;
  }

  let candidates: string[] | undefined;
  if (opts.lookupSelector) {
    candidates = await opts
      .lookupSelector(selector as Hex, "error")
      .catch(() => []);
    for (const candidate of candidates ?? []) {
      try {
        const item = parseAbiItem(
          candidate.startsWith("error ") ? candidate : `error ${candidate}`,
        ) as AbiError;
        if (item.type !== "error") continue;
        const decoded = tryCustom(data, item, "selector-db");
        if (decoded) return decoded;
      } catch {
        continue;
      }
    }
  }

  return {
    kind: "unknown",
    message: `reverted with unrecognized error ${selector}`,
    ...(candidates?.length ? { candidates } : {}),
    raw: data,
  };
}
