"use client";

import {
  createClientForChain,
  DEFAULT_CHAIN_ID,
  mergeChains,
  probeCapabilities,
  type ChainCapabilities,
  type CustomChainConfig,
  type MergedChain,
} from "@evm-troubleshooter/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { rpcUrlFor } from "./rpc";

const SELECTED_KEY = "evmtb.selectedChain";
const CUSTOM_KEY = "evmtb.customChains";

interface ChainPrefs {
  selected: number;
  custom: CustomChainConfig[];
}

const DEFAULT_PREFS: ChainPrefs = { selected: DEFAULT_CHAIN_ID, custom: [] };

// localStorage-backed external store: SSR renders defaults, the client
// snapshot takes over after hydration (the useSyncExternalStore contract).
let prefsCache: ChainPrefs | null = null;
const listeners = new Set<() => void>();

function loadPrefs(): ChainPrefs {
  try {
    const selected = Number(
      localStorage.getItem(SELECTED_KEY) ?? DEFAULT_CHAIN_ID,
    );
    const custom = JSON.parse(
      localStorage.getItem(CUSTOM_KEY) ?? "[]",
    ) as CustomChainConfig[];
    return {
      selected: Number.isInteger(selected) ? selected : DEFAULT_CHAIN_ID,
      custom: Array.isArray(custom) ? custom : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function getSnapshot(): ChainPrefs {
  prefsCache ??= loadPrefs();
  return prefsCache;
}

function getServerSnapshot(): ChainPrefs {
  return DEFAULT_PREFS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function updatePrefs(next: ChainPrefs) {
  prefsCache = next;
  try {
    localStorage.setItem(SELECTED_KEY, String(next.selected));
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next.custom));
  } catch {
    // persistence is best-effort (private browsing, quota)
  }
  listeners.forEach((l) => l());
}

interface ChainContextValue {
  chains: MergedChain[];
  selected: MergedChain;
  selectChain: (chainId: number) => void;
  addCustomChain: (config: CustomChainConfig) => void;
  removeCustomChain: (chainId: number) => void;
  capabilities: ChainCapabilities | null;
  probing: boolean;
}

const ChainContext = createContext<ChainContextValue | null>(null);

export function ChainProvider({ children }: { children: ReactNode }) {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const chains = useMemo(() => mergeChains(prefs.custom), [prefs.custom]);
  const selected =
    chains.find((c) => c.chainId === prefs.selected) ??
    (chains.find((c) => c.chainId === DEFAULT_CHAIN_ID) as MergedChain);

  const selectChain = useCallback((chainId: number) => {
    updatePrefs({ ...getSnapshot(), selected: chainId });
  }, []);

  const addCustomChain = useCallback((config: CustomChainConfig) => {
    const current = getSnapshot();
    updatePrefs({
      selected: config.chainId,
      custom: [
        ...current.custom.filter((c) => c.chainId !== config.chainId),
        config,
      ],
    });
  }, []);

  const removeCustomChain = useCallback((chainId: number) => {
    const current = getSnapshot();
    updatePrefs({
      selected:
        current.selected === chainId ? DEFAULT_CHAIN_ID : current.selected,
      custom: current.custom.filter((c) => c.chainId !== chainId),
    });
  }, []);

  // probe result is keyed by chain+rpc; a key mismatch means "still probing"
  const probeKey = `${selected.chainId}::${selected.rpcUrl}::${selected.custom ?? false}`;
  const [probeResult, setProbeResult] = useState<{
    key: string;
    caps: ChainCapabilities;
  } | null>(null);

  useEffect(() => {
    let stale = false;
    const client = createClientForChain({
      chainId: selected.chainId,
      rpcUrl: rpcUrlFor(selected),
    });
    probeCapabilities(client).then((caps) => {
      if (!stale) setProbeResult({ key: probeKey, caps });
    });
    return () => {
      stale = true;
    };
  }, [probeKey, selected]);

  const capabilities = probeResult?.key === probeKey ? probeResult.caps : null;
  const probing = capabilities === null;

  const value = useMemo(
    () => ({
      chains,
      selected,
      selectChain,
      addCustomChain,
      removeCustomChain,
      capabilities,
      probing,
    }),
    [
      chains,
      selected,
      selectChain,
      addCustomChain,
      removeCustomChain,
      capabilities,
      probing,
    ],
  );

  return (
    <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
  );
}

export function useChain(): ChainContextValue {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("useChain must be used within ChainProvider");
  return ctx;
}
