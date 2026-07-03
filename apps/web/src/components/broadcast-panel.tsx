"use client";

import {
  encodeCall,
  preflight,
  writableFunctions,
  type PreflightReport,
} from "@evm-troubleshooter/core";
import {
  isAddress,
  type Abi,
  type AbiFunction,
  type Address,
  type Hex,
} from "viem";
import { useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useWalletClient,
} from "wagmi";
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
import { parseUserAbi } from "@/lib/decode-client";

function ConnectRow() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="wallet-connected"
      >
        <Badge variant="secondary" className="font-mono text-xs">
          {address.slice(0, 8)}…{address.slice(-6)}
        </Badge>
        <span className="text-xs text-muted-foreground">chain {chainId}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => disconnect()}
          data-testid="wallet-disconnect"
        >
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {connectors.map((c) => (
        <Button
          key={c.uid}
          variant="outline"
          size="sm"
          disabled={isPending}
          data-testid={`connect-${c.id}`}
          onClick={() => connect({ connector: c })}
        >
          Connect {c.name}
        </Button>
      ))}
    </div>
  );
}

export function BroadcastPanel() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [target, setTarget] = useState("");
  const [abiText, setAbiText] = useState("");
  const [fnIndex, setFnIndex] = useState(0);
  const [args, setArgs] = useState<string[]>([]);
  const [value, setValue] = useState("0");
  const [rawTx, setRawTx] = useState("");

  const [report, setReport] = useState<PreflightReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abi = useMemo<Abi | null>(() => parseUserAbi(abiText), [abiText]);
  const fns = useMemo<AbiFunction[]>(
    () => (abi ? writableFunctions(abi) : []),
    [abi],
  );
  const fn = fns[fnIndex];

  const encoded = useMemo(() => {
    if (!fn) return null;
    return encodeCall(fn, args);
  }, [fn, args]);

  const targetValid = isAddress(target.trim());
  const calldata: Hex | undefined = encoded?.ok ? encoded.data : undefined;

  async function runPreflight() {
    if (!publicClient || !address || !targetValid) return;
    setBusy("preflight");
    setError(null);
    try {
      const r = await preflight(publicClient, {
        chainId: chainId ?? 0,
        from: address,
        to: target.trim() as Address,
        ...(calldata ? { data: calldata } : {}),
        value: BigInt(value || "0"),
      });
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function broadcast() {
    if (!walletClient || !publicClient || !address || !targetValid) return;
    setBusy("broadcast");
    setError(null);
    setReceiptStatus(null);
    try {
      const hash = await walletClient.sendTransaction({
        account: address,
        to: target.trim() as Address,
        ...(calldata ? { data: calldata } : {}),
        value: BigInt(value || "0"),
      });
      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setReceiptStatus(receipt.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function relayRaw() {
    if (!publicClient) return;
    setBusy("raw");
    setError(null);
    setReceiptStatus(null);
    try {
      const hash = await publicClient.sendRawTransaction({
        serializedTransaction: rawTx.trim() as Hex,
      });
      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setReceiptStatus(receipt.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card data-testid="broadcast-panel">
      <CardHeader>
        <CardTitle>Build &amp; broadcast</CardTitle>
        <CardDescription>
          Client-side only — your key never touches a server. Compose a call or
          relay a pre-signed raw tx.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ConnectRow />

        <div className="grid gap-2">
          <Label htmlFor="bcast-to">Target contract</Label>
          <Input
            id="bcast-to"
            data-testid="bcast-to"
            placeholder="0x…"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-invalid={target.trim() !== "" && !targetValid}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="bcast-abi">Contract ABI</Label>
          <Textarea
            id="bcast-abi"
            data-testid="bcast-abi"
            placeholder="function transfer(address to, uint256 amount)"
            className="min-h-16 font-mono text-xs"
            value={abiText}
            onChange={(e) => {
              setAbiText(e.target.value);
              setFnIndex(0);
              setArgs([]);
            }}
          />
        </div>

        {fns.length ? (
          <div className="grid gap-2">
            <Label htmlFor="bcast-fn">Function</Label>
            <select
              id="bcast-fn"
              data-testid="bcast-fn"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={fnIndex}
              onChange={(e) => {
                setFnIndex(Number(e.target.value));
                setArgs([]);
              }}
            >
              {fns.map((f, i) => (
                <option key={i} value={i}>
                  {f.name}({f.inputs.map((p) => p.type).join(", ")})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {fn?.inputs.map((input, i) => (
          <div key={i} className="grid gap-2">
            <Label htmlFor={`arg-${i}`}>
              {input.name || `arg${i}`} ({input.type})
            </Label>
            <Input
              id={`arg-${i}`}
              data-testid={`bcast-arg-${i}`}
              value={args[i] ?? ""}
              onChange={(e) => {
                const next = [...args];
                next[i] = e.target.value;
                setArgs(next);
              }}
            />
          </div>
        ))}

        <div className="grid gap-2">
          <Label htmlFor="bcast-value">Value (wei)</Label>
          <Input
            id="bcast-value"
            data-testid="bcast-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        {encoded && !encoded.ok ? (
          <p className="text-sm text-destructive" role="alert">
            {encoded.errors.join("; ")}
          </p>
        ) : calldata ? (
          <div
            className="font-mono text-xs break-all"
            data-testid="bcast-calldata"
          >
            {calldata}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!isConnected || !targetValid || busy !== null}
            data-testid="bcast-preflight"
            onClick={runPreflight}
          >
            {busy === "preflight" ? "Checking…" : "Run pre-flight"}
          </Button>
          <Button
            disabled={
              !isConnected ||
              !targetValid ||
              busy !== null ||
              report?.ok === false
            }
            data-testid="bcast-send"
            onClick={broadcast}
          >
            {busy === "broadcast" ? "Broadcasting…" : "Broadcast"}
          </Button>
        </div>

        {report ? (
          <div className="grid gap-1" data-testid="preflight-report">
            {report.checks.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <Badge
                  variant={
                    c.status === "pass"
                      ? "secondary"
                      : c.status === "warn"
                        ? "outline"
                        : "destructive"
                  }
                  data-testid={`check-${c.id}`}
                  data-status={c.status}
                >
                  {c.status}
                </Badge>
                <span>{c.label}</span>
                <span className="text-xs text-muted-foreground">
                  {c.detail}
                </span>
              </div>
            ))}
            {report.ok === false ? (
              <p className="text-sm font-medium text-destructive" role="alert">
                Pre-flight failed — broadcasting is disabled until the failing
                checks pass.
              </p>
            ) : null}
          </div>
        ) : null}

        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Relay a pre-signed raw transaction
          </summary>
          <div className="mt-2 grid gap-2">
            <Textarea
              data-testid="raw-tx"
              placeholder="0x02f8…"
              className="min-h-16 font-mono text-xs"
              value={rawTx}
              onChange={(e) => setRawTx(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null || !rawTx.trim()}
              data-testid="relay-raw"
              onClick={relayRaw}
            >
              {busy === "raw" ? "Relaying…" : "Relay raw tx"}
            </Button>
          </div>
        </details>

        {txHash ? (
          <div
            className="rounded-md border p-3"
            data-testid="broadcast-result"
            data-receipt={receiptStatus ?? "pending"}
          >
            <div className="text-sm">
              Broadcast tx:{" "}
              <span
                className="font-mono text-xs break-all"
                data-testid="tx-hash"
              >
                {txHash}
              </span>
            </div>
            {receiptStatus ? (
              <Badge
                className="mt-1"
                variant={
                  receiptStatus === "success" ? "secondary" : "destructive"
                }
                data-testid="receipt-status"
              >
                receipt: {receiptStatus}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                waiting for receipt…
              </span>
            )}
          </div>
        ) : null}

        {error ? (
          <p
            className="text-sm text-destructive"
            role="alert"
            data-testid="bcast-error"
          >
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
