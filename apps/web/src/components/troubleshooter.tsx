"use client";

import {
  assetDiffFromPrestate,
  createClientForChain,
  decodeCalldata,
  decodeRevert,
  decodeShareState,
  detectInput,
  fetchTransaction,
  replayRequestFromTx,
  requestFromRawTx,
  simulateCall,
  traceCall,
  type DetectedInput,
  type FetchedTransaction,
  type ShareState,
  type SimulateOutcome,
  type SimulateRequest,
} from "@evm-troubleshooter/core";
import { isAddress, type Abi, type Address, type Hex } from "viem";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useChain } from "@/lib/chain-context";
import {
  fetchVerifiedAbi,
  lookupSelector,
  parseUserAbi,
} from "@/lib/decode-client";
import { rpcUrlFor } from "@/lib/rpc";
import { RecipePicker } from "./recipe-picker";
import {
  ResultsPanel,
  type DecodedBundle,
  type Results,
} from "./results-panel";

const KIND_LABEL: Record<DetectedInput["kind"], string> = {
  txHash: "transaction hash",
  rawTx: "signed raw tx",
  calldata: "calldata",
  jsonRequest: "JSON call request",
  unknown: "unrecognized",
};

export function Troubleshooter() {
  const { selected, selectChain, addCustomChain } = useChain();
  const [raw, setRaw] = useState("");
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [blockNumber, setBlockNumber] = useState("");
  const [abiText, setAbiText] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [pendingShare, setPendingShare] = useState<ShareState | null>(null);

  const userAbi = useMemo(() => parseUserAbi(abiText), [abiText]);
  const abiInvalid = abiText.trim() !== "" && userAbi === null;

  const detected = useMemo(() => (raw.trim() ? detectInput(raw) : null), [raw]);

  const needsTarget = detected?.kind === "calldata";
  const targetValid = !needsTarget || isAddress(to.trim());
  const fromValid = from.trim() === "" || isAddress(from.trim());
  const blockValid =
    blockNumber.trim() === "" || /^\d+$/.test(blockNumber.trim());
  const canRun =
    !!detected &&
    detected.kind !== "unknown" &&
    targetValid &&
    fromValid &&
    blockValid &&
    !running;

  function client() {
    return createClientForChain({
      chainId: selected.chainId,
      rpcUrl: rpcUrlFor(selected),
    });
  }

  function optionalFields(): Partial<SimulateRequest> {
    return {
      ...(from.trim() ? { from: from.trim() as Address } : {}),
      ...(blockNumber.trim()
        ? { blockNumber: BigInt(blockNumber.trim()) }
        : {}),
    };
  }

  async function resolveAbi(target?: Address): Promise<Abi | undefined> {
    if (userAbi) return userAbi;
    if (!target) return undefined;
    return (await fetchVerifiedAbi(selected.chainId, target)) ?? undefined;
  }

  async function decodeAll(
    data: Hex | undefined,
    target: Address | undefined,
    outcome: SimulateOutcome | null,
  ): Promise<DecodedBundle> {
    const abi = await resolveAbi(target);
    const opts = { ...(abi ? { abi } : {}), lookupSelector };
    const [call, revert] = await Promise.all([
      data && data !== "0x"
        ? decodeCalldata(data, opts)
        : Promise.resolve(null),
      outcome?.status === "revert"
        ? decodeRevert(outcome.revertData, opts)
        : Promise.resolve(null),
    ]);
    return { call, revert };
  }

  function shareCtx() {
    return {
      chainId: selected.chainId,
      chainName: selected.name,
      ...(selected.custom ? { rpcUrl: selected.rpcUrl } : {}),
    };
  }

  async function simulate(request: SimulateRequest) {
    const c = client();
    const [outcome, trace, assetDiff] = await Promise.all([
      simulateCall(c, request),
      traceCall(c, request),
      assetDiffFromPrestate(c, request),
    ]);
    const decoded = await decodeAll(request.data, request.to, outcome);
    return {
      request,
      outcome,
      decoded,
      traceBundle: { trace, assetDiff },
      share: shareCtx(),
    };
  }

  // Load a permalink (?s=…) on mount: switch to the encoded chain, then the
  // effect below reproduces the simulation once that chain is selected.
  // State updates are deferred a microtask so they run after hydration.
  useEffect(() => {
    const encoded = new URLSearchParams(window.location.search).get("s");
    if (!encoded) return;
    const state = decodeShareState(encoded);
    if (!state) return;
    void (async () => {
      await Promise.resolve();
      if (state.rpcUrl) {
        addCustomChain({ chainId: state.chainId, rpcUrl: state.rpcUrl });
      } else {
        selectChain(state.chainId);
      }
      setRaw(state.data ?? "");
      setTo(state.to);
      setFrom(state.from ?? "");
      setBlockNumber(state.blockNumber ?? "");
      setPendingShare(state);
    })();
    // one-shot on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingShare || selected.chainId !== pendingShare.chainId) return;
    const state = pendingShare;
    void (async () => {
      await Promise.resolve();
      setPendingShare(null);
      setRunning(true);
      try {
        const request: SimulateRequest = {
          to: state.to,
          ...(state.from ? { from: state.from } : {}),
          ...(state.data ? { data: state.data } : {}),
          ...(state.value !== undefined ? { value: BigInt(state.value) } : {}),
          ...(state.blockNumber !== undefined
            ? { blockNumber: BigInt(state.blockNumber) }
            : {}),
          ...(state.overrides?.length
            ? {
                stateOverride: state.overrides.map((o) => ({
                  address: o.address,
                  ...(o.stateDiff ? { stateDiff: o.stateDiff } : {}),
                  ...(o.balance !== undefined
                    ? { balance: BigInt(o.balance) }
                    : {}),
                })),
              }
            : {}),
        };
        setResults({ kind: "simulation", ...(await simulate(request)) });
      } finally {
        setRunning(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingShare, selected.chainId]);

  async function run() {
    if (!detected || detected.kind === "unknown") return;
    setRunning(true);
    setResults(null);
    try {
      switch (detected.kind) {
        case "txHash": {
          const fetched = await fetchTransaction(client(), detected.hash);
          if (!fetched) {
            setResults({
              kind: "message",
              tone: "error",
              text: `Transaction not found on ${selected.name}. Wrong chain, or the hash is unknown to this RPC.`,
            });
            break;
          }
          const decodedCall =
            fetched.tx.input && fetched.tx.input !== "0x"
              ? (
                  await decodeAll(
                    fetched.tx.input,
                    fetched.tx.to ?? undefined,
                    null,
                  )
                ).call
              : null;
          setResults({ kind: "transaction", fetched, decodedCall });
          break;
        }
        case "rawTx": {
          const request = await requestFromRawTx(detected.raw);
          setResults({
            kind: "simulation",
            ...(await simulate({ ...request, ...optionalFields() })),
            note:
              detected.chainId !== undefined &&
              detected.chainId !== selected.chainId
                ? `This raw tx targets chainId ${detected.chainId}, but you are simulating on ${selected.name} (${selected.chainId}).`
                : undefined,
          });
          break;
        }
        case "calldata": {
          setResults({
            kind: "simulation",
            ...(await simulate({
              to: to.trim() as Address,
              data: detected.data,
              ...optionalFields(),
            })),
          });
          break;
        }
        case "jsonRequest": {
          setResults({
            kind: "simulation",
            ...(await simulate(detected.request)),
          });
          break;
        }
      }
    } catch (err) {
      setResults({
        kind: "message",
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(false);
    }
  }

  async function replay(fetched: FetchedTransaction) {
    setRunning(true);
    try {
      const request = replayRequestFromTx(fetched.tx);
      const run = await simulate(request);
      setResults({
        kind: "transaction",
        fetched,
        decodedCall: run.decoded.call,
        replay: run,
      });
    } catch (err) {
      setResults({
        kind: "message",
        tone: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Troubleshoot a transaction</CardTitle>
              <CardDescription>
                Paste a tx hash, signed raw tx, calldata, or a JSON call request
                — the input type is detected automatically.
              </CardDescription>
            </div>
            <RecipePicker
              onApply={(t, data) => {
                setTo(t);
                setRaw(data);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Textarea
            data-testid="input-box"
            placeholder="0x…"
            className="min-h-24 font-mono text-sm"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          {detected ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Detected:</span>
              <Badge
                variant={detected.kind === "unknown" ? "outline" : "secondary"}
                data-testid="input-kind"
              >
                {KIND_LABEL[detected.kind]}
              </Badge>
              {detected.kind === "unknown" ? (
                <span className="text-sm text-destructive" role="alert">
                  {detected.reason}
                </span>
              ) : null}
            </div>
          ) : null}

          {needsTarget ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="to">To (contract)</Label>
                <Input
                  id="to"
                  data-testid="to-input"
                  placeholder="0x…"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-invalid={!targetValid && to.trim() !== ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="from">From (optional)</Label>
                <Input
                  id="from"
                  data-testid="from-input"
                  placeholder="0x…"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-invalid={!fromValid}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="block">Block (optional)</Label>
                <Input
                  id="block"
                  data-testid="block-input"
                  placeholder="latest"
                  value={blockNumber}
                  onChange={(e) => setBlockNumber(e.target.value)}
                  aria-invalid={!blockValid}
                />
              </div>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="abi">
              Contract ABI (optional — JSON or one signature per line;
              auto-resolved from Sourcify/Etherscan when omitted)
            </Label>
            <Textarea
              id="abi"
              data-testid="abi-input"
              placeholder='[{"type":"function", …}]  or  function transfer(address to, uint256 amount)'
              className="min-h-16 font-mono text-xs"
              value={abiText}
              onChange={(e) => setAbiText(e.target.value)}
              aria-invalid={abiInvalid}
            />
            {abiInvalid ? (
              <p className="text-sm text-destructive" role="alert">
                ABI not parseable — paste a JSON ABI array or human-readable
                signatures, one per line.
              </p>
            ) : null}
          </div>

          <div>
            <Button data-testid="run-button" onClick={run} disabled={!canRun}>
              {running ? "Running…" : "Run"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {results ? (
        <ResultsPanel results={results} onReplay={replay} running={running} />
      ) : null}
    </div>
  );
}
