"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useChain } from "@/lib/chain-context";

const EXAMPLES = [
  {
    label: "Failing transferFrom (no allowance)",
    hint: "calldata + USDC target — reverts, then isolate with a probe",
    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    from: "0x000000000000000000000000000000000000dEaD",
    data: "0x23b872dd000000000000000000000000f977814e90da44bfa03b6295a0616a897441acec000000000000000000000000000000000000000000000000000000000000dead00000000000000000000000000000000000000000000000000000000000f4240",
  },
  {
    label: "USDC balanceOf (read)",
    hint: "calldata — simulates a view call",
    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    data: "0x70a08231000000000000000000000000f977814e90da44bfa03b6295a0616a897441acec",
  },
];

export function Intro({
  onExample,
}: {
  onExample: (ex: { to: string; from?: string; data: string }) => void;
}) {
  const { selected } = useChain();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>What this does</CardTitle>
        <CardDescription>
          Paste a transaction hash, calldata, a signed raw tx, or a JSON call
          request. It simulates the call on {selected.name} (no gas, no
          broadcast), decodes calldata and revert reasons, lets you isolate the
          root cause with state overrides, and shows the full call trace — then
          you can broadcast a corrected tx with your own wallet.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          data-testid="toggle-examples"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide examples" : "Show examples"}
        </Button>
        {open ? (
          <div className="grid gap-2" data-testid="examples">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                data-testid="example"
                onClick={() =>
                  onExample({
                    to: ex.to,
                    ...(ex.from ? { from: ex.from } : {}),
                    data: ex.data,
                  })
                }
                className="rounded-md border p-3 text-left transition-colors hover:bg-accent"
              >
                <div className="text-sm font-medium">{ex.label}</div>
                <div className="text-xs text-muted-foreground">{ex.hint}</div>
              </button>
            ))}
            <p className="text-xs text-muted-foreground">
              Examples use Ethereum mainnet addresses — switch to a chain with a
              working public RPC (or add your own) before running.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
