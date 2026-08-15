import { cn } from "@/lib/utils";

export function InlineAlert({ tone, title, children, className }: { tone: "error" | "warning" | "info" | "success"; title?: string; children?: React.ReactNode; className?: string }) {
  const isError = tone === "error";
  return <div role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"} className={cn("rounded-2xl border px-4 py-3 text-sm", { "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200": tone === "error", "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200": tone === "warning", "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200": tone === "info", "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200": tone === "success" }, className)}>{title && <p className="font-semibold">{title}</p>}<div className={title ? "mt-1" : undefined}>{children}</div></div>;
}
