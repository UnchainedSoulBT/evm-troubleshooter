import { BroadcastPanel } from "@/components/broadcast-panel";
import { ChainSwitcher } from "@/components/chain-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Troubleshooter } from "@/components/troubleshooter";
import { Web3Provider } from "@/components/web3-provider";
import { ChainProvider } from "@/lib/chain-context";

export default function Home() {
  return (
    <Web3Provider>
      <ChainProvider>
        <div className="flex min-h-screen flex-col">
          <header className="border-b">
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <h1 className="text-lg font-semibold tracking-tight">
                EVM Transaction Troubleshooter
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <ChainSwitcher />
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-4 py-8">
            <Troubleshooter />
            <BroadcastPanel />
          </main>
        </div>
      </ChainProvider>
    </Web3Provider>
  );
}
