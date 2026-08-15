"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard route error", error);
  }, [error]);

  return (
    <div aria-live="assertive" className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100" role="alert">
      <h1 className="text-lg font-semibold">This workspace view could not load</h1>
      <p className="mt-2 text-sm">Try again. If the problem continues, check the operations page for a safe diagnostic summary.</p>
      <Button className="mt-5" onClick={() => reset()} variant="outline">Try again</Button>
    </div>
  );
}
