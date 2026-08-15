export function Skeleton({ label, className = "h-20" }: { label: string; className?: string }) {
  return <div role="status" aria-label={label} className={`animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900 ${className}`}><span className="sr-only">{label}</span></div>;
}
