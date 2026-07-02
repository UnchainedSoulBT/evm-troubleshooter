import {
  encodeFunctionData,
  isAddress,
  type Abi,
  type AbiFunction,
  type Hex,
} from "viem";

/** Non-view/pure functions — the ones worth building a tx for. */
export function writableFunctions(abi: Abi): AbiFunction[] {
  return abi.filter(
    (item): item is AbiFunction =>
      item.type === "function" &&
      item.stateMutability !== "view" &&
      item.stateMutability !== "pure",
  );
}

export type ParseResult =
  { ok: true; value: unknown } | { ok: false; error: string };

/** Parse one user-entered arg string into the value its ABI type expects. */
export function parseArgInput(type: string, raw: string): ParseResult {
  const value = raw.trim();

  if (type.endsWith("[]")) {
    const inner = type.slice(0, -2);
    let items: string[];
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) throw new Error("not an array");
      items = parsed.map((v) => String(v));
    } catch {
      // also accept comma-separated
      items = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim());
      if (items.length === 1 && items[0] === "") items = [];
    }
    const out: unknown[] = [];
    for (const item of items) {
      const r = parseArgInput(inner, item);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return { ok: true, value: out };
  }

  if (type === "address") {
    return isAddress(value)
      ? { ok: true, value }
      : { ok: false, error: "invalid address" };
  }
  if (type === "bool") {
    if (value === "true") return { ok: true, value: true };
    if (value === "false") return { ok: true, value: false };
    return { ok: false, error: "expected true or false" };
  }
  if (type.startsWith("uint") || type.startsWith("int")) {
    try {
      const n = BigInt(value);
      if (type.startsWith("uint") && n < 0n) {
        return { ok: false, error: "unsigned value cannot be negative" };
      }
      return { ok: true, value: n };
    } catch {
      return { ok: false, error: "expected an integer" };
    }
  }
  if (type === "bytes" || /^bytes\d+$/.test(type)) {
    return /^0x[0-9a-fA-F]*$/.test(value)
      ? { ok: true, value: value as Hex }
      : { ok: false, error: "expected 0x-prefixed hex" };
  }
  if (type === "string") {
    return { ok: true, value };
  }
  // tuples and other complex types: accept JSON
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, error: `unsupported type ${type}` };
  }
}

export type EncodeResult =
  { ok: true; data: Hex } | { ok: false; errors: string[] };

/** Validate each arg, then encode calldata (per-arg errors, no throw). */
export function encodeCall(fn: AbiFunction, rawArgs: string[]): EncodeResult {
  const values: unknown[] = [];
  const errors: string[] = [];

  fn.inputs.forEach((input, i) => {
    const raw = rawArgs[i] ?? "";
    const parsed = parseArgInput(input.type, raw);
    if (parsed.ok) {
      values.push(parsed.value);
    } else {
      errors.push(`${input.name || `arg${i}`}: ${parsed.error}`);
    }
  });

  if (errors.length) return { ok: false, errors };

  try {
    const data = encodeFunctionData({
      abi: [fn],
      functionName: fn.name,
      args: values,
    });
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}
