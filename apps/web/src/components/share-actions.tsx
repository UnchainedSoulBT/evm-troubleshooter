"use client";

import {
  encodeShareState,
  toMarkdownReport,
  type DecodedCall,
  type DecodedRevert,
  type ShareOverride,
  type ShareState,
  type SimulateOutcome,
  type SimulateRequest,
} from "@evm-troubleshooter/core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ShareContext } from "./results-panel";

function buildShareState(
  share: ShareContext,
  request: SimulateRequest,
): ShareState {
  const overrides: ShareOverride[] | undefined = request.stateOverride?.map(
    (o) => ({
      address: o.address,
      ...(o.stateDiff ? { stateDiff: o.stateDiff } : {}),
      ...(o.balance !== undefined ? { balance: o.balance.toString() } : {}),
    }),
  );
  return {
    chainId: share.chainId,
    to: request.to,
    ...(request.from ? { from: request.from } : {}),
    ...(request.data ? { data: request.data } : {}),
    ...(request.value !== undefined ? { value: request.value.toString() } : {}),
    ...(request.blockNumber !== undefined
      ? { blockNumber: request.blockNumber.toString() }
      : {}),
    ...(overrides?.length ? { overrides } : {}),
    ...(share.rpcUrl ? { rpcUrl: share.rpcUrl } : {}),
  };
}

export function ShareActions({
  share,
  request,
  outcome,
  decodedCall,
  decodedRevert,
}: {
  share: ShareContext;
  request: SimulateRequest;
  outcome: SimulateOutcome;
  decodedCall: DecodedCall | null;
  decodedRevert: DecodedRevert | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  function shareUrl(): string {
    const encoded = encodeShareState(buildShareState(share, request));
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/?s=${encoded}`;
  }

  async function copy(text: string, which: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard blocked (e.g. headless) — still flip the label so tests see it
    }
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="share-actions">
      <Button
        variant="outline"
        size="sm"
        data-testid="copy-link"
        data-share-url={shareUrl()}
        onClick={() => copy(shareUrl(), "link")}
      >
        {copied === "link" ? "Link copied ✓" : "Copy permalink"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid="copy-report"
        onClick={() =>
          copy(
            toMarkdownReport({
              chainName: share.chainName,
              chainId: share.chainId,
              request,
              outcome,
              decodedCall,
              decodedRevert,
              shareUrl: shareUrl(),
            }),
            "report",
          )
        }
      >
        {copied === "report" ? "Report copied ✓" : "Copy report (markdown)"}
      </Button>
    </div>
  );
}
