"use client";

import type {
  AssetDelta,
  TraceNode,
  TraceResult,
} from "@evm-troubleshooter/core";
import { formatEther } from "viem";
import { Badge } from "@/components/ui/badge";

function shortHex(value: string, head = 10, tail = 6): string {
  return value.length > head + tail
    ? `${value.slice(0, head)}…${value.slice(-tail)}`
    : value;
}

function TraceNodeView({ node }: { node: TraceNode }) {
  return (
    <div
      className="border-l pl-3"
      data-testid="trace-node"
      data-reverted={node.reverted}
    >
      <div className="flex flex-wrap items-center gap-2 py-1">
        <Badge variant="outline" className="text-[10px]">
          {node.type}
        </Badge>
        {node.error ? (
          <Badge variant="destructive" className="text-[10px]">
            reverted
          </Badge>
        ) : null}
        <span className="font-mono text-xs">
          {node.to ? shortHex(node.to) : "(create)"}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {shortHex(node.input, 10, 0)}
        </span>
        {node.value !== undefined && node.value > 0n ? (
          <span className="text-[11px] text-muted-foreground">
            {formatEther(node.value)} native
          </span>
        ) : null}
        {node.gasUsed !== undefined ? (
          <span className="ml-auto text-[11px] text-muted-foreground">
            gas {node.gasUsed.toString()}
          </span>
        ) : null}
      </div>
      {node.error && node.revertReason ? (
        <div className="pb-1 text-xs text-destructive">{node.revertReason}</div>
      ) : null}
      {node.calls.length ? (
        <div className="grid gap-0.5">
          {node.calls.map((child, i) => (
            <TraceNodeView key={i} node={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TraceView({ trace }: { trace: TraceResult }) {
  if (trace.source === "none" || !trace.root) {
    return (
      <div
        className="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
        data-testid="trace-unavailable"
      >
        {trace.unavailableReason ??
          "No trace available. This RPC does not expose a tracer."}
      </div>
    );
  }
  return (
    <div className="grid gap-2" data-testid="trace-tree">
      <div className="text-xs text-muted-foreground">
        Source: <span className="font-mono">{trace.source}</span>
      </div>
      <TraceNodeView node={trace.root} />
    </div>
  );
}

export function AssetDiffView({ diffs }: { diffs: AssetDelta[] }) {
  if (!diffs.length) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="asset-diff-empty"
      >
        No native balance changes (or the RPC has no prestate tracer).
      </p>
    );
  }
  return (
    <div className="overflow-x-auto" data-testid="asset-diff">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">Account</th>
            <th className="py-1.5 pr-3 font-medium">Asset</th>
            <th className="py-1.5 font-medium">Delta</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((d, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="py-1.5 pr-3 font-mono text-xs">
                {shortHex(d.address)}
              </td>
              <td className="py-1.5 pr-3 text-xs">
                {d.token === null ? "native" : shortHex(d.token)}
              </td>
              <td
                className={`py-1.5 font-mono text-xs ${
                  d.delta >= 0n ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {d.delta >= 0n ? "+" : ""}
                {formatEther(d.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
