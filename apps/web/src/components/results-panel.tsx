"use client";

import type {
  DecodedCall,
  DecodedRevert,
  FetchedTransaction,
  SimulateOutcome,
  SimulateRequest,
} from "@evm-troubleshooter/core";
import { formatEther } from "viem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DecodedCallView, DecodedRevertView } from "./decoded-view";
import { ProbePanel } from "./probe-panel";

export interface DecodedBundle {
  call: DecodedCall | null;
  revert: DecodedRevert | null;
}

export interface SimulationRun {
  request: SimulateRequest;
  outcome: SimulateOutcome;
  decoded?: DecodedBundle;
}

export type Results =
  | { kind: "message"; tone: "error" | "info"; text: string }
  | {
      kind: "transaction";
      fetched: FetchedTransaction;
      decodedCall?: DecodedCall | null;
      replay?: SimulationRun;
    }
  | {
      kind: "simulation";
      request: SimulateRequest;
      outcome: SimulateOutcome;
      decoded?: DecodedBundle;
      note?: string;
    };

function DecodedSection({ decoded }: { decoded: DecodedBundle }) {
  if (!decoded.call && !decoded.revert) {
    return <p className="text-sm text-muted-foreground">Nothing to decode.</p>;
  }
  return (
    <div className="grid gap-4">
      {decoded.revert ? <DecodedRevertView revert={decoded.revert} /> : null}
      {decoded.call ? <DecodedCallView call={decoded.call} /> : null}
    </div>
  );
}

function Mono({
  children,
  "data-testid": testId,
}: {
  children: React.ReactNode;
  "data-testid"?: string;
}) {
  return (
    <span
      data-testid={testId}
      className="break-all font-mono text-xs sm:text-sm"
    >
      {children}
    </span>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[10rem_1fr]">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: SimulateOutcome }) {
  if (outcome.status === "success") {
    return (
      <Badge data-testid="sim-status" data-status="success">
        Success
      </Badge>
    );
  }
  if (outcome.status === "revert") {
    return (
      <Badge
        variant="destructive"
        data-testid="sim-status"
        data-status="revert"
      >
        Reverted
      </Badge>
    );
  }
  return (
    <Badge variant="outline" data-testid="sim-status" data-status="error">
      RPC error
    </Badge>
  );
}

function SimulationCard({ run, note }: { run: SimulationRun; note?: string }) {
  const { request, outcome } = run;
  const body = (
    <>
      {request.from ? (
        <Row label="From">
          <Mono>{request.from}</Mono>
        </Row>
      ) : null}
      <Row label="To">
        <Mono>{request.to}</Mono>
      </Row>
      {request.blockNumber !== undefined ? (
        <Row label="Pinned block">
          <Mono>{request.blockNumber.toString()}</Mono>
        </Row>
      ) : null}
      {outcome.status === "success" ? (
        <Row label="Return data">
          <Mono data-testid="return-data">
            {outcome.returnData === "0x" ? "(empty)" : outcome.returnData}
          </Mono>
        </Row>
      ) : null}
      {outcome.status === "revert" ? (
        <>
          <Row label="Revert reason">
            <span className="text-sm" data-testid="revert-message">
              {outcome.message}
            </span>
          </Row>
          <Row label="Revert data">
            <Mono data-testid="revert-data">
              {outcome.revertData === "0x"
                ? "(no data returned)"
                : outcome.revertData}
            </Mono>
          </Row>
        </>
      ) : null}
      {outcome.status === "error" ? (
        <Row label="Error">
          <span className="text-sm" data-testid="rpc-error">
            {outcome.message}
          </span>
        </Row>
      ) : null}
    </>
  );

  return (
    <Card data-testid="simulation-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Simulation <OutcomeBadge outcome={outcome} />
        </CardTitle>
        {note ? (
          <CardDescription className="text-amber-600 dark:text-amber-500">
            {note}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {run.decoded ? (
          <Tabs defaultValue="decoded">
            <TabsList>
              <TabsTrigger value="decoded" data-testid="tab-decoded">
                Decoded
              </TabsTrigger>
              <TabsTrigger value="result" data-testid="tab-result">
                Result
              </TabsTrigger>
            </TabsList>
            <TabsContent value="decoded" className="pt-2">
              <DecodedSection decoded={run.decoded} />
            </TabsContent>
            <TabsContent value="result" className="pt-2">
              {body}
            </TabsContent>
          </Tabs>
        ) : (
          body
        )}
      </CardContent>
    </Card>
  );
}

export function ResultsPanel({
  results,
  onReplay,
  running,
}: {
  results: Results;
  onReplay: (fetched: FetchedTransaction) => void;
  running: boolean;
}) {
  if (results.kind === "message") {
    return (
      <Card>
        <CardContent className="pt-6">
          <p
            className={
              results.tone === "error" ? "text-destructive" : undefined
            }
            role={results.tone === "error" ? "alert" : undefined}
            data-testid="result-message"
          >
            {results.text}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (results.kind === "simulation") {
    return (
      <div className="grid gap-6">
        <SimulationCard
          run={{
            request: results.request,
            outcome: results.outcome,
            ...(results.decoded ? { decoded: results.decoded } : {}),
          }}
          note={results.note}
        />
        {results.outcome.status === "revert" ? (
          <ProbePanel
            request={results.request}
            outcome={results.outcome}
            decodedRevert={results.decoded?.revert ?? null}
            decodedCall={results.decoded?.call ?? null}
          />
        ) : null}
      </div>
    );
  }

  const { tx, receipt } = results.fetched;
  const txBody = (
    <>
      <Row label="From">
        <Mono>{tx.from}</Mono>
      </Row>
      <Row label="To">
        <Mono>{tx.to ?? "(contract creation)"}</Mono>
      </Row>
      <Row label="Value">
        <span className="text-sm">{formatEther(tx.value)} native</span>
      </Row>
      <Row label="Block">
        <Mono>{tx.blockNumber?.toString() ?? "pending"}</Mono>
      </Row>
      {receipt ? (
        <Row label="Gas used">
          <Mono>{receipt.gasUsed.toString()}</Mono>
        </Row>
      ) : null}
      <Row label="Calldata">
        <Mono>
          {tx.input.length > 400
            ? `${tx.input.slice(0, 400)}… (${(tx.input.length - 2) / 2} bytes)`
            : tx.input}
        </Mono>
      </Row>
    </>
  );
  return (
    <div className="grid gap-6">
      <Card data-testid="tx-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Transaction
            {receipt ? (
              <Badge
                variant={
                  receipt.status === "success" ? "secondary" : "destructive"
                }
                data-testid="tx-status"
              >
                {receipt.status === "success"
                  ? "Confirmed"
                  : "Reverted on-chain"}
              </Badge>
            ) : (
              <Badge variant="outline" data-testid="tx-status">
                Pending
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            <Mono>{tx.hash}</Mono>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results.decodedCall !== undefined ? (
            <Tabs defaultValue="decoded">
              <TabsList>
                <TabsTrigger value="decoded" data-testid="tab-decoded">
                  Decoded
                </TabsTrigger>
                <TabsTrigger value="result" data-testid="tab-result">
                  Details
                </TabsTrigger>
              </TabsList>
              <TabsContent value="decoded" className="pt-2">
                {results.decodedCall ? (
                  <DecodedCallView call={results.decodedCall} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No calldata to decode (plain value transfer).
                  </p>
                )}
              </TabsContent>
              <TabsContent value="result" className="pt-2">
                {txBody}
              </TabsContent>
            </Tabs>
          ) : (
            txBody
          )}
          {tx.to && tx.blockNumber !== null ? (
            <div className="pt-3">
              <Button
                variant="outline"
                size="sm"
                data-testid="replay-button"
                disabled={running}
                onClick={() => onReplay(results.fetched)}
              >
                {running ? "Replaying…" : "Replay at parent block"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {results.replay ? <SimulationCard run={results.replay} /> : null}
    </div>
  );
}
