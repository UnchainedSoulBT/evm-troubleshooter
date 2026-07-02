import {
  encodeAbiParameters,
  keccak256,
  pad,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

export interface StateOverrideEntry {
  address: Address;
  balance?: bigint;
  nonce?: number;
  code?: Hex;
  /** targeted slot writes over existing state */
  stateDiff?: { slot: Hex; value: Hex }[];
  /** full state replacement */
  state?: { slot: Hex; value: Hex }[];
}

export function balanceOverride(
  address: Address,
  balance: bigint,
): StateOverrideEntry {
  return { address, balance };
}

export function nonceOverride(
  address: Address,
  nonce: number,
): StateOverrideEntry {
  return { address, nonce };
}

export function codeOverride(address: Address, code: Hex): StateOverrideEntry {
  return { address, code };
}

export function storageOverride(
  address: Address,
  stateDiff: { slot: Hex; value: Hex }[],
): StateOverrideEntry {
  return { address, stateDiff };
}

/** Combine entries so each address appears once (stateDiffs concatenated). */
export function mergeOverrides(
  entries: StateOverrideEntry[],
): StateOverrideEntry[] {
  const byAddress = new Map<string, StateOverrideEntry>();
  for (const entry of entries) {
    const key = entry.address.toLowerCase();
    const existing = byAddress.get(key);
    if (!existing) {
      byAddress.set(key, { ...entry });
      continue;
    }
    if (entry.balance !== undefined) existing.balance = entry.balance;
    if (entry.nonce !== undefined) existing.nonce = entry.nonce;
    if (entry.code !== undefined) existing.code = entry.code;
    if (entry.stateDiff) {
      existing.stateDiff = [...(existing.stateDiff ?? []), ...entry.stateDiff];
    }
    if (entry.state) {
      existing.state = [...(existing.state ?? []), ...entry.state];
    }
  }
  return [...byAddress.values()];
}

export type StorageLayout = "solidity" | "vyper";

function mappingSlot(key: Hex, slotIndex: bigint, layout: StorageLayout): Hex {
  // Solidity: keccak(abi.encode(key, slot)); Vyper: keccak(abi.encode(slot, key))
  const encoded =
    layout === "solidity"
      ? encodeAbiParameters(
          [{ type: "bytes32" }, { type: "uint256" }],
          [pad(key), slotIndex],
        )
      : encodeAbiParameters(
          [{ type: "uint256" }, { type: "bytes32" }],
          [slotIndex, pad(key)],
        );
  return keccak256(encoded);
}

function nestedMappingSlot(
  parentSlot: Hex,
  key: Hex,
  layout: StorageLayout,
): Hex {
  const encoded =
    layout === "solidity"
      ? encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }],
          [pad(key), parentSlot],
        )
      : encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }],
          [parentSlot, pad(key)],
        );
  return keccak256(encoded);
}

/** Storage slot for `balances[holder]` at mapping slot `slotIndex`. */
export function erc20BalanceSlot(
  holder: Address,
  slotIndex: bigint,
  layout: StorageLayout = "solidity",
): Hex {
  return mappingSlot(pad(holder), slotIndex, layout);
}

/** Storage slot for `allowance[owner][spender]` at mapping slot `slotIndex`. */
export function erc20AllowanceSlot(
  owner: Address,
  spender: Address,
  slotIndex: bigint,
  layout: StorageLayout = "solidity",
): Hex {
  const inner = mappingSlot(pad(owner), slotIndex, layout);
  return nestedMappingSlot(inner, pad(spender), layout);
}

export interface FoundSlot {
  slotIndex: bigint;
  layout: StorageLayout;
}

const PROBE_MAGIC = pad("0x2222222222222222", { size: 32 });
const MAX_SLOT_SCAN = 30n;

/**
 * Discover a token's balance/allowance mapping slot by brute-force override
 * probing (PLAN §5.5, the technique behind the isolation demo): write a
 * magic value at each candidate slot and see which one the getter returns.
 * Purely simulated — never mutates chain state.
 */
export async function findErc20Slot(
  client: PublicClient,
  token: Address,
  kind: "balance" | "allowance",
  probe: {
    holder?: Address;
    owner?: Address;
    spender?: Address;
  } = {},
): Promise<FoundSlot | null> {
  const holder = probe.holder ?? "0x0000000000000000000000000000000000000abc";
  const owner = probe.owner ?? holder;
  const spender = probe.spender ?? "0x0000000000000000000000000000000000000def";

  const data =
    kind === "balance"
      ? (`0x70a08231${pad(holder as Hex).slice(2)}` as Hex) // balanceOf(holder)
      : (`0xdd62ed3e${pad(owner as Hex).slice(2)}${pad(spender as Hex).slice(2)}` as Hex); // allowance(owner,spender)

  for (const layout of ["solidity", "vyper"] as const) {
    for (let slotIndex = 0n; slotIndex < MAX_SLOT_SCAN; slotIndex++) {
      const slot =
        kind === "balance"
          ? erc20BalanceSlot(holder, slotIndex, layout)
          : erc20AllowanceSlot(owner, spender, slotIndex, layout);
      try {
        const result = await client.call({
          to: token,
          data,
          stateOverride: [
            { address: token, stateDiff: [{ slot, value: PROBE_MAGIC }] },
          ],
        });
        if (result.data && BigInt(result.data) === BigInt(PROBE_MAGIC)) {
          return { slotIndex, layout };
        }
      } catch {
        // slot not writable / call reverted — keep scanning
      }
    }
  }
  return null;
}
