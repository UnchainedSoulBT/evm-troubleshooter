"use client";

import {
  buildProbeOverride,
  createClientForChain,
  runReadProbe,
  simulateCall,
  suggestProbes,
  type DecodedCall,
  type ProbeResult,
  type ProbeSuggestion,
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
import { useChain } from "@/lib/chain-context";
import { rpcUrlFor } from "@/lib/rpc";
import type { Results } from "./results-panel";

interface ProbePanelProps {
  request: SimulateRequest;
  outcome: SimulateOutcome;
  decodedRevert: NonNullable<
    Extract<Results, { kind: "simulation" }>["decoded"]
  >["revert"];
  decodedCall?: DecodedCall | null;
}

/**
 * The allowance owner is the token holder, not msg.sender: for
 * transferFrom(from, to, amount) it is arg0, and the spender is msg.sender.
 * For a plain transfer/approve it is msg.sender itself.
 */
function allowanceParties(
  request: SimulateRequest,
  call?: DecodedCall | null,
): { owner: Address; spender?: Address } {
  const from = request.from;
  if (call?.functionName === "transferFrom" && call.args?.[0]) {
    const holder = call.args[0].value;
    if (typeof holder === "string" && isAddress(holder)) {
      return { owner: holder, ...(from ? { spender: from } : {}) };
    }
  }
  return from ? { owner: from } : { owner: request.to };
}

export function ProbePanel({
  request,
  outcome,
  decodedRevert,
  decodedCall,
}: ProbePanelProps) {
  const { selected } = useChain();
  const [reads, setReads] = useState<ProbeResult[]>([]);
  const [proof, setProof] = useState<SimulateOutcome | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failedSlot, setFailedSlot] = useState(false);

  const token = request.to;
  const parties = useMemo(
    () => allowanceParties(request, decodedCall),
    [request, decodedCall],
  );
  const owner = parties.owner;

  const suggestions = useMemo<ProbeSuggestion[]>(() => {
    if (!decodedRevert) return [];
    return suggestProbes(decodedRevert, {
      token,
      owner,
      ...(parties.spender ? { spender: parties.spender } : {}),
    });
  }, [decodedRevert, owner, parties.spender, token]);

  function client() {
    return createClientForChain({
      chainId: selected.chainId,
      rpcUrl: rpcUrlFor(selected),
    });
  }

  async function readProbe(
    probe:
      | { kind: "balanceOf"; owner: Address }
      | { kind: "allowance"; owner: Address; spender: Address },
  ) {
    setBusy(probe.kind);
    try {
      const result = await runReadProbe(client(), token, probe);
      setReads((prev) => [result, ...prev].slice(0, 6));
    } finally {
      setBusy(null);
    }
  }

  async function proveFix(suggestion: ProbeSuggestion) {
    setBusy("prove");
    setFailedSlot(false);
    setProof(null);
    try {
      const override = await buildProbeOverride(client(), suggestion);
      if (!override) {
        setFailedSlot(true);
        return;
      }
      const after = await simulateCall(client(), {
        ...request,
        stateOverride: [override],
      });
      setProof(after);
    } finally {
      setBusy(null);
    }
  }

  if (outcome.status !== "revert") return null;

  return (
    <Card data-testid="probe-panel">
      <CardHeader>
        <CardTitle>Isolate the cause</CardTitle>
        <CardDescription>
          Run read probes, or prove a fix by re-simulating with a state override
          — no on-chain transaction.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {owner ? (
            <Button
              variant="outline"
              size="sm"
              data-testid="probe-balanceof"
              disabled={busy !== null}
              onClick={() => readProbe({ kind: "balanceOf", owner })}
            >
              Probe balanceOf(from)
            </Button>
          ) : null}
          {suggestions
            .filter((s) => s.kind === "allowance")
            .map((s) => (
              <Button
                key="allowance-read"
                variant="outline"
                size="sm"
                data-testid="probe-allowance"
                disabled={busy !== null}
                onClick={() =>
                  readProbe({
                    kind: "allowance",
                    owner: s.owner,
                    spender: s.spender,
                  })
                }
              >
                Probe allowance(from, spender)
              </Button>
            ))}
        </div>

        {reads.length ? (
          <div className="grid gap-1" data-testid="probe-reads">
            {reads.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-2 border-b py-1 text-sm last:border-b-0"
              >
                <Badge
                  variant={
                    r.outcome.status === "success" ? "secondary" : "destructive"
                  }
                >
                  {r.outcome.status}
                </Badge>
                <span className="font-mono text-xs">{r.label}</span>
                {r.value !== undefined ? (
                  <span className="ml-auto font-mono text-xs">
                    = {r.value.toString()}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {suggestions.length ? (
          <div className="grid gap-3" data-testid="probe-suggestions">
            {suggestions.map((s, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="mb-2 text-sm">{s.description}</div>
                <Button
                  size="sm"
                  data-testid="prove-fix"
                  disabled={busy !== null}
                  onClick={() => proveFix(s)}
                >
                  {busy === "prove" ? "Simulating…" : "Prove the fix"}
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {failedSlot ? (
          <p className="text-sm text-amber-600" role="alert">
            Couldn&apos;t auto-detect this token&apos;s storage slot (exotic
            layout). Enter the slot manually to override it.
          </p>
        ) : null}

        {proof ? (
          <div
            className="rounded-md border p-3"
            data-testid="proof-result"
            data-status={proof.status}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                With the override applied:
              </span>
              <Badge
                variant={
                  proof.status === "success" ? "secondary" : "destructive"
                }
                data-testid="proof-status"
              >
                {proof.status === "success"
                  ? "Simulation succeeds ✓"
                  : proof.status}
              </Badge>
            </div>
            {proof.status === "success" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                The override eliminates the revert — this is the root cause.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
