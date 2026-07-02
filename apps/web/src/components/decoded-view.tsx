"use client";

import type { DecodedCall, DecodedRevert } from "@evm-troubleshooter/core";
import { Badge } from "@/components/ui/badge";
import { formatArgValue } from "@/lib/decode-client";

const SOURCE_LABEL: Record<string, string> = {
  abi: "verified/pasted ABI",
  builtin: "built-in signature",
  "selector-db": "signature database",
  none: "unresolved",
};

function ArgsTable({ args }: { args: NonNullable<DecodedCall["args"]> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {args.map((arg, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="py-1.5 pr-3 text-muted-foreground">
                {arg.name ?? `arg${i}`}
              </td>
              <td className="py-1.5 pr-3 font-mono text-xs">{arg.type}</td>
              <td className="break-all py-1.5 font-mono text-xs">
                {formatArgValue(arg.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DecodedCallView({
  call,
  depth = 0,
}: {
  call: DecodedCall;
  depth?: number;
}) {
  return (
    <div
      className={depth > 0 ? "border-l-2 pl-3" : undefined}
      data-testid={depth === 0 ? "decoded-call" : "decoded-subcall"}
    >
      <div className="flex flex-wrap items-center gap-2">
        {call.functionName ? (
          <>
            <span className="font-mono text-sm font-semibold">
              {call.signature ?? call.functionName}
            </span>
            <Badge variant="outline" className="text-xs">
              {SOURCE_LABEL[call.source]}
            </Badge>
          </>
        ) : (
          <>
            <span className="font-mono text-sm">selector {call.selector}</span>
            <Badge variant="outline" className="text-xs">
              unknown function
            </Badge>
          </>
        )}
      </div>

      {call.args?.length ? (
        <div className="mt-2">
          <ArgsTable args={call.args} />
        </div>
      ) : null}

      {!call.functionName && call.candidates?.length ? (
        <div className="mt-2 text-sm" data-testid="selector-candidates">
          <span className="text-muted-foreground">
            Possible signatures (signature DB):
          </span>
          <ul className="mt-1 list-inside list-disc font-mono text-xs">
            {call.candidates.slice(0, 5).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {call.subCalls?.length ? (
        <div className="mt-3 grid gap-3">
          {call.subCalls.map((sub, i) => (
            <div key={i}>
              <div className="mb-1 text-xs text-muted-foreground">
                #{i + 1}
                {sub.to ? (
                  <>
                    {" → "}
                    <span className="font-mono">{sub.to}</span>
                  </>
                ) : null}
                {sub.value !== undefined && sub.value > 0n
                  ? ` (value ${sub.value})`
                  : null}
              </div>
              <DecodedCallView call={sub.call} depth={depth + 1} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DecodedRevertView({ revert }: { revert: DecodedRevert }) {
  return (
    <div data-testid="decoded-revert" className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">{revert.kind}</Badge>
        <span className="text-sm" data-testid="decoded-revert-message">
          {revert.message}
        </span>
      </div>
      {revert.kind === "custom" && revert.args.length ? (
        <ArgsTable args={revert.args} />
      ) : null}
      {revert.kind === "unknown" && revert.candidates?.length ? (
        <div className="text-sm">
          <span className="text-muted-foreground">Possible errors:</span>
          <ul className="mt-1 list-inside list-disc font-mono text-xs">
            {revert.candidates.slice(0, 5).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
