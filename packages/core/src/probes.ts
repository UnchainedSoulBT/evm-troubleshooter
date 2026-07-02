import {
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type { DecodedRevert } from "./decode/types";
import {
  erc20AllowanceSlot,
  erc20BalanceSlot,
  findErc20Slot,
  storageOverride,
  type StateOverrideEntry,
  type StorageLayout,
} from "./overrides";
import { simulateCall, type SimulateOutcome } from "./simulate";

const ERC20_PROBE_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export interface ProbeResult {
  label: string;
  outcome: SimulateOutcome;
  value?: bigint;
}

/** One-click read probe: balanceOf / allowance dry-run against the token. */
export async function runReadProbe(
  client: PublicClient,
  token: Address,
  probe:
    | { kind: "balanceOf"; owner: Address }
    | { kind: "allowance"; owner: Address; spender: Address },
): Promise<ProbeResult> {
  const data =
    probe.kind === "balanceOf"
      ? encodeFunctionData({
          abi: ERC20_PROBE_ABI,
          functionName: "balanceOf",
          args: [probe.owner],
        })
      : encodeFunctionData({
          abi: ERC20_PROBE_ABI,
          functionName: "allowance",
          args: [probe.owner, probe.spender],
        });

  const outcome = await simulateCall(client, { to: token, data });
  const label =
    probe.kind === "balanceOf"
      ? `balanceOf(${probe.owner})`
      : `allowance(${probe.owner}, ${probe.spender})`;
  return {
    label,
    outcome,
    ...(outcome.status === "success" && outcome.returnData !== "0x"
      ? { value: BigInt(outcome.returnData) }
      : {}),
  };
}

export type ProbeSuggestion =
  | {
      kind: "allowance";
      token: Address;
      owner: Address;
      spender: Address;
      needed?: bigint;
      description: string;
    }
  | {
      kind: "balance";
      token: Address;
      holder: Address;
      needed?: bigint;
      description: string;
    };

function argValue(
  revert: Extract<DecodedRevert, { kind: "custom" }>,
  name: string,
): unknown {
  return revert.args.find((a) => a.name === name)?.value;
}

/**
 * Derive isolation probes from a decoded revert (PLAN §5.5): an allowance or
 * balance shortfall becomes a suggested state override that would flip the
 * simulation to success.
 */
export function suggestProbes(
  revert: DecodedRevert,
  ctx: { token: Address; owner: Address; spender?: Address },
): ProbeSuggestion[] {
  const suggestions: ProbeSuggestion[] = [];

  const mentionsAllowance =
    (revert.kind === "custom" && /allowance/i.test(revert.errorName)) ||
    (revert.kind === "error-string" && /allowance/i.test(revert.reason));
  const mentionsBalance =
    (revert.kind === "custom" && /balance/i.test(revert.errorName)) ||
    (revert.kind === "error-string" && /balance/i.test(revert.reason));

  if (mentionsAllowance) {
    const spender =
      (revert.kind === "custom"
        ? (argValue(revert, "spender") as Address | undefined)
        : undefined) ??
      ctx.spender ??
      ctx.owner;
    const needed =
      revert.kind === "custom"
        ? (argValue(revert, "needed") as bigint | undefined)
        : undefined;
    suggestions.push({
      kind: "allowance",
      token: ctx.token,
      owner: ctx.owner,
      spender,
      ...(needed !== undefined ? { needed } : {}),
      description:
        "Override the allowance storage slot so the spender is approved, then re-simulate.",
    });
  }

  if (mentionsBalance) {
    const holder =
      (revert.kind === "custom"
        ? (argValue(revert, "sender") as Address | undefined)
        : undefined) ?? ctx.owner;
    const needed =
      revert.kind === "custom"
        ? (argValue(revert, "needed") as bigint | undefined)
        : undefined;
    suggestions.push({
      kind: "balance",
      token: ctx.token,
      holder,
      ...(needed !== undefined ? { needed } : {}),
      description:
        "Override the balance storage slot so the holder has enough, then re-simulate.",
    });
  }

  return suggestions;
}

const MAX_UINT =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as Hex;

/**
 * Build the state override that satisfies a suggestion, discovering the
 * token's storage slot by probing first. Returns null if the slot can't be
 * found (exotic layout) — the UI falls back to a manual-slot entry.
 */
export async function buildProbeOverride(
  client: PublicClient,
  suggestion: ProbeSuggestion,
  value: bigint = suggestion.needed ?? 0n,
): Promise<StateOverrideEntry | null> {
  if (suggestion.kind === "allowance") {
    const found = await findErc20Slot(client, suggestion.token, "allowance", {
      owner: suggestion.owner,
      spender: suggestion.spender,
    });
    if (!found) return null;
    return storageOverride(suggestion.token, [
      {
        slot: erc20AllowanceSlot(
          suggestion.owner,
          suggestion.spender,
          found.slotIndex,
          found.layout,
        ),
        value: valueToSlot(value === 0n ? MAX_UINT : value),
      },
    ]);
  }

  const found = await findErc20Slot(client, suggestion.token, "balance", {
    holder: suggestion.holder,
  });
  if (!found) return null;
  return storageOverride(suggestion.token, [
    {
      slot: erc20BalanceSlot(suggestion.holder, found.slotIndex, found.layout),
      value: valueToSlot(value),
    },
  ]);
}

function valueToSlot(value: bigint | Hex): Hex {
  if (typeof value === "string") return value;
  return `0x${value.toString(16).padStart(64, "0")}`;
}

export type { StorageLayout };
