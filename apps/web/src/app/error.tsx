"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/monitoring";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-4 px-4 py-16">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        The app hit an unexpected error. Your inputs are safe — nothing was
        broadcast.
      </p>
      <Button onClick={() => unstable_retry()}>Try again</Button>
    </div>
  );
}
