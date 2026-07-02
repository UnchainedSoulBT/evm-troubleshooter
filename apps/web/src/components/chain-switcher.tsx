"use client";

import { isHexData } from "@evm-troubleshooter/core";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChain } from "@/lib/chain-context";

function CapabilityBadges() {
  const { capabilities, probing } = useChain();

  if (probing) {
    return (
      <Badge variant="outline" data-testid="capability-probing">
        probing RPC…
      </Badge>
    );
  }
  if (!capabilities) return null;

  if (capabilities.latestBlock === null) {
    return (
      <Badge variant="destructive" data-testid="capability-offline">
        RPC unreachable
      </Badge>
    );
  }

  const items: { label: string; on: boolean }[] = [
    { label: "trace", on: capabilities.debug },
    { label: "archive", on: capabilities.archive },
    { label: "estimateGas", on: capabilities.estimateGas },
  ];

  return (
    <div className="flex items-center gap-1.5" data-testid="capability-badges">
      {items.map(({ label, on }) => (
        <Badge
          key={label}
          variant={on ? "secondary" : "outline"}
          data-testid={`capability-${label}`}
          data-on={on}
          className={on ? "" : "opacity-50 line-through"}
          title={
            on
              ? `${label} supported by this RPC`
              : `${label} not available on this RPC — features degrade gracefully`
          }
        >
          {label}
        </Badge>
      ))}
    </div>
  );
}

function AddCustomChainDialog() {
  const { addCustomChain } = useChain();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const chainIdRaw = String(form.get("chainId") ?? "").trim();
    const rpcUrl = String(form.get("rpcUrl") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();

    const chainId = Number(chainIdRaw);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      setError("Chain ID must be a positive integer");
      return;
    }
    if (isHexData(rpcUrl) || !/^https?:\/\/.+/.test(rpcUrl)) {
      setError("RPC URL must start with http:// or https://");
      return;
    }

    addCustomChain({ chainId, rpcUrl, ...(name ? { name } : {}) });
    setError(null);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="add-chain-button">
          Add chain
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a custom chain / RPC</DialogTitle>
          <DialogDescription>
            Bring your own RPC for any EVM chain. Using a known chain ID
            overrides that chain&apos;s default RPC.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="chainId">Chain ID</Label>
            <Input
              id="chainId"
              name="chainId"
              placeholder="31337"
              required
              inputMode="numeric"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rpcUrl">RPC URL</Label>
            <Input
              id="rpcUrl"
              name="rpcUrl"
              placeholder="https://rpc.example.com"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input id="name" name="name" placeholder="My chain" />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" data-testid="add-chain-submit">
              Add & switch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ChainSwitcher() {
  const { chains, selected, selectChain } = useChain();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={String(selected.chainId)}
        onValueChange={(v) => selectChain(Number(v))}
      >
        <SelectTrigger className="w-52" data-testid="chain-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {chains.map((chain) => (
            <SelectItem key={chain.chainId} value={String(chain.chainId)}>
              {chain.name}
              {chain.custom ? " •" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AddCustomChainDialog />
      <CapabilityBadges />
    </div>
  );
}
