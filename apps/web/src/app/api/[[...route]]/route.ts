import { app } from "@evm-troubleshooter/proxy";
import { handle } from "hono/vercel";

// The proxy is a framework-agnostic Hono app (apps/proxy); mounting it here
// gives one Vercel deployment while keeping the proxy independently testable.
const handler = handle(app);

export { handler as GET, handler as POST };
