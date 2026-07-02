import { ChainSwitcher } from "@/components/chain-switcher";
import { Troubleshooter } from "@/components/troubleshooter";
import { ChainProvider } from "@/lib/chain-context";

export default function Home() {
  return (
    <ChainProvider>
      <div className="flex min-h-screen flex-col">
        <header className="border-b">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <h1 className="text-lg font-semibold tracking-tight">
              EVM Transaction Troubleshooter
            </h1>
            <ChainSwitcher />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          <Troubleshooter />
        </main>
      </div>
    </ChainProvider>
  );
}
