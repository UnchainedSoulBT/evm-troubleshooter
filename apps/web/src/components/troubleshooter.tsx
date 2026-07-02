"use client";

import {
  createClientForChain,
  detectInput,
  fetchTransaction,
  replayRequestFromTx,
  requestFromRawTx,
  simulateCall,
  type DetectedInput,
  type FetchedTransaction,
  type SimulateOutcome,
  type SimulateRequest,
} from "@evm-troubleshooter/core";
import { isAddress, type Address } from "viem";
import { useMemo, useState } from "react";
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
import { rpcUrlFor } from "@/lib/rpc";
import { ResultsPanel, type Results } from "./results-panel";

const KIND_LABEL: Record<DetectedInput["kind"], string> = {
  txHash: "transaction hash",
  rawTx: "signed raw tx",
  calldata: "calldata",
  jsonRequest: "JSON call request",
  unknown: "unrecognized",
};

export function Troubleshooter() {
  const { selected } = useChain();
  const [raw, setRaw] = useState("");
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [blockNumber, setBlockNumber] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Results | null>(null);

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

  async function simulate(request: SimulateRequest) {
    const outcome = await simulateCall(client(), request);
    return { request, outcome };
  }

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
          setResults({ kind: "transaction", fetched });
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
      const outcome: SimulateOutcome = await simulateCall(client(), request);
      setResults({
        kind: "transaction",
        fetched,
        replay: { request, outcome },
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
          <CardTitle>Troubleshoot a transaction</CardTitle>
          <CardDescription>
            Paste a tx hash, signed raw tx, calldata, or a JSON call request —
            the input type is detected automatically.
          </CardDescription>
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
