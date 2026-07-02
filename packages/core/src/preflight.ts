import type { Address, Hex, PublicClient } from "viem";
import { simulateCall } from "./simulate";

export interface PreflightRequest {
  chainId: number;
  from: Address;
  to: Address;
  data?: Hex;
  value: bigint;
}

export interface PreflightCheck {
  id: "chainId" | "gas" | "nonce" | "balance" | "simulation";
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface PreflightReport {
  ok: boolean;
  checks: PreflightCheck[];
  gasEstimate?: bigint;
  nonce?: number;
  feePerGas?: bigint;
}

/**
 * Auto-run before enabling broadcast (PLAN §5.6): estimateGas, nonce,
 * balance ≥ value+fee, chainId match, and a final simulation. A simulated
 * revert fails loudly. Never throws — a failed check is data, not an error.
 */
export async function preflight(
  client: PublicClient,
  req: PreflightRequest,
): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];

  // chainId
  let chainId: number | undefined;
  try {
    chainId = await client.getChainId();
    checks.push({
      id: "chainId",
      label: "Chain ID matches",
      status: chainId === req.chainId ? "pass" : "fail",
      detail:
        chainId === req.chainId
          ? `connected to chain ${chainId}`
          : `wallet/RPC is on chain ${chainId}, tx targets ${req.chainId}`,
    });
  } catch {
    checks.push({
      id: "chainId",
      label: "Chain ID matches",
      status: "warn",
      detail: "could not read chain id",
    });
  }

  // fresh fees (never reuse stale/foreign fee fields — §5.3)
  let feePerGas: bigint | undefined;
  try {
    const fees = await client.estimateFeesPerGas();
    feePerGas = fees.maxFeePerGas ?? fees.gasPrice;
  } catch {
    try {
      feePerGas = await client.getGasPrice();
    } catch {
      feePerGas = undefined;
    }
  }

  // gas estimate
  let gasEstimate: bigint | undefined;
  try {
    gasEstimate = await client.estimateGas({
      account: req.from,
      to: req.to,
      ...(req.data !== undefined ? { data: req.data } : {}),
      value: req.value,
    });
    checks.push({
      id: "gas",
      label: "Gas estimated",
      status: "pass",
      detail: `${gasEstimate.toString()} gas`,
    });
  } catch (err) {
    checks.push({
      id: "gas",
      label: "Gas estimated",
      status: "warn",
      detail: `estimateGas failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }

  // nonce
  let nonce: number | undefined;
  try {
    nonce = await client.getTransactionCount({ address: req.from });
    checks.push({
      id: "nonce",
      label: "Nonce fetched",
      status: "pass",
      detail: `next nonce ${nonce}`,
    });
  } catch {
    checks.push({
      id: "nonce",
      label: "Nonce fetched",
      status: "warn",
      detail: "could not read nonce",
    });
  }

  // balance ≥ value + fee
  try {
    const balance = await client.getBalance({ address: req.from });
    const feeBudget =
      gasEstimate !== undefined && feePerGas !== undefined
        ? gasEstimate * feePerGas
        : 0n;
    const required = req.value + feeBudget;
    checks.push({
      id: "balance",
      label: "Balance covers value + fee",
      status: balance >= required ? "pass" : "fail",
      detail:
        balance >= required
          ? `balance ${balance} ≥ required ${required}`
          : `balance ${balance} < required ${required} (value + gas fee)`,
    });
  } catch {
    checks.push({
      id: "balance",
      label: "Balance covers value + fee",
      status: "warn",
      detail: "could not read balance",
    });
  }

  // final simulation
  const outcome = await simulateCall(client, {
    from: req.from,
    to: req.to,
    ...(req.data !== undefined ? { data: req.data } : {}),
    value: req.value,
  });
  checks.push({
    id: "simulation",
    label: "Simulation succeeds",
    status: outcome.status === "success" ? "pass" : "fail",
    detail:
      outcome.status === "success"
        ? "call simulates cleanly"
        : `would ${outcome.status}: ${outcome.message}`,
  });

  return {
    ok: checks.every((c) => c.status !== "fail"),
    checks,
    ...(gasEstimate !== undefined ? { gasEstimate } : {}),
    ...(nonce !== undefined ? { nonce } : {}),
    ...(feePerGas !== undefined ? { feePerGas } : {}),
  };
}
