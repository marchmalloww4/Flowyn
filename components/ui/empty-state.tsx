import { cn } from "@/lib/utils";

export function EmptyState({ title, description, action, className }: { title: string; description: string; action?: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700", className)}><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
