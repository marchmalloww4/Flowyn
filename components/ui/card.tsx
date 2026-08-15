import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.ComponentProps<"section">>(
  ({ className, ...props }, ref) => (
    <section ref={ref} className={cn("rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950", className)} {...props} />
  ),
);
Card.displayName = "Card";
