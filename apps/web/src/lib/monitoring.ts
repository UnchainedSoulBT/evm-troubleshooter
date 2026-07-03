/**
 * Minimal error-monitoring hook. Reports client errors to the console and,
 * when a reporter is registered (e.g. Sentry wired via env in production),
 * forwards them there. No-op by default — no third-party code in the bundle.
 */
type Reporter = (error: unknown, context?: Record<string, unknown>) => void;

let reporter: Reporter | null = null;

export function setErrorReporter(fn: Reporter | null) {
  reporter = fn;
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[evmtb]", error, context ?? "");
  }
  try {
    reporter?.(error, context);
  } catch {
    // a broken reporter must never mask the original error
  }
}
