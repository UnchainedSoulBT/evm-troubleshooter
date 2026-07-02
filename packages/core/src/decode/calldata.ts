import {
  decodeFunctionData,
  parseAbiItem,
  toFunctionSelector,
  type Abi,
  type AbiFunction,
  type AbiParameter,
  type Hex,
} from "viem";
import { COMMON_SELECTORS } from "./constants";
import { CONTAINER_UNPACKERS } from "./containers";
import type {
  DecodedCall,
  DecodedParam,
  DecodeOptions,
  DecodeSource,
} from "./types";

const DEFAULT_MAX_DEPTH = 5;

function toParams(
  inputs: readonly AbiParameter[],
  values: readonly unknown[],
): DecodedParam[] {
  return inputs.map((input, i) => ({
    ...(input.name ? { name: input.name } : {}),
    type: input.type,
    value: values[i],
  }));
}

function canonicalType(param: AbiParameter): string {
  if (param.type.startsWith("tuple") && "components" in param) {
    const inner = param.components.map(canonicalType).join(",");
    return `(${inner})${param.type.slice("tuple".length)}`;
  }
  return param.type;
}

function signatureOf(fn: AbiFunction): string {
  return `${fn.name}(${fn.inputs.map(canonicalType).join(",")})`;
}

interface Attempt {
  fn: AbiFunction;
  args: readonly unknown[];
  source: DecodeSource;
}

function tryDecodeWith(
  data: Hex,
  abi: Abi,
  source: DecodeSource,
): Attempt | null {
  try {
    const { functionName, args } = decodeFunctionData({ abi, data });
    const fn = abi.find(
      (item): item is AbiFunction =>
        item.type === "function" &&
        item.name === functionName &&
        toFunctionSelector(item) === data.slice(0, 10).toLowerCase(),
    );
    if (!fn) return null;
    return { fn, args: (args ?? []) as readonly unknown[], source };
  } catch {
    return null;
  }
}

/** Normalize an openchain-style signature ("transfer(address,uint256)"). */
function abiFromSignature(sig: string): Abi | null {
  try {
    const item = parseAbiItem(
      sig.startsWith("function ") ? sig : `function ${sig}`,
    );
    return item.type === "function" ? [item] : null;
  } catch {
    return null;
  }
}

/**
 * Decode calldata into a human-readable call (PLAN §5.4). Resolution order:
 * user ABI → builtin selector seed → selector DB candidates. Container
 * selectors (multicall, Safe, EVC, Multicall3) expand recursively.
 */
export async function decodeCalldata(
  data: Hex,
  opts: DecodeOptions = {},
): Promise<DecodedCall> {
  const depth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const selector = data.slice(0, 10).toLowerCase() as Hex;
  const base: DecodedCall = { raw: data, selector, source: "none" };

  if (data.length < 10) {
    return { ...base, selector: data as Hex };
  }

  let attempt: Attempt | null = null;

  if (opts.abi) attempt = tryDecodeWith(data, opts.abi, "abi");

  if (!attempt) {
    const builtin = COMMON_SELECTORS.get(selector);
    if (builtin) {
      const abi = abiFromSignature(builtin);
      if (abi) attempt = tryDecodeWith(data, abi, "builtin");
    }
  }

  let candidates: string[] | undefined;
  if (!attempt && opts.lookupSelector) {
    candidates = await opts
      .lookupSelector(selector, "function")
      .catch(() => []);
    for (const candidate of candidates ?? []) {
      const abi = abiFromSignature(candidate);
      if (!abi) continue;
      attempt = tryDecodeWith(data, abi, "selector-db");
      if (attempt) break;
    }
  }

  if (!attempt) {
    return {
      ...base,
      ...(candidates?.length ? { candidates } : {}),
    };
  }

  const call: DecodedCall = {
    ...base,
    functionName: attempt.fn.name,
    signature: signatureOf(attempt.fn),
    args: toParams(attempt.fn.inputs, attempt.args),
    source: attempt.source,
  };

  const unpacker = CONTAINER_UNPACKERS.get(signatureOf(attempt.fn));
  if (unpacker && depth > 0) {
    const items = unpacker(attempt.args);
    call.subCalls = await Promise.all(
      items.map(async (item) => ({
        ...(item.to !== undefined ? { to: item.to } : {}),
        ...(item.value !== undefined ? { value: item.value } : {}),
        call: await decodeCalldata(item.data, {
          ...opts,
          maxDepth: depth - 1,
        }),
      })),
    );
  }

  return call;
}
