import { spawn, type ChildProcess } from "node:child_process";

export interface AnvilInstance {
  rpcUrl: string;
  stop: () => void;
}

export const DEFAULT_FORK_URL =
  process.env.ETH_RPC_URL ?? "https://ethereum-rpc.publicnode.com";

interface AnvilOptions {
  forkUrl?: string;
  forkBlockNumber?: bigint;
  port?: number;
  /** override the fork's chain id (anvil keeps the forked id by default) */
  chainId?: number;
}

async function rpc(url: string, method: string, params: unknown[] = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc ${method}: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: unknown };
  if (body.error)
    throw new Error(`rpc ${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

export async function startAnvil(
  opts: AnvilOptions = {},
): Promise<AnvilInstance> {
  const port = opts.port ?? 8545 + Math.floor(Math.random() * 1000);
  const rpcUrl = `http://127.0.0.1:${port}`;
  const args = [
    "--port",
    String(port),
    "--fork-url",
    opts.forkUrl ?? DEFAULT_FORK_URL,
  ];
  if (opts.forkBlockNumber !== undefined) {
    args.push("--fork-block-number", opts.forkBlockNumber.toString());
  }
  if (opts.chainId !== undefined) {
    args.push("--chain-id", String(opts.chainId));
  }

  const bin = process.env.ANVIL_BIN ?? "anvil";
  const child: ChildProcess = spawn(bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `anvil exited (${child.exitCode}): ${stderr.slice(0, 500)}`,
      );
    }
    try {
      await rpc(rpcUrl, "eth_chainId");
      return { rpcUrl, stop: () => child.kill() };
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  child.kill();
  throw new Error(`anvil did not become ready in 60s: ${stderr.slice(0, 500)}`);
}

export { rpc };
