export function Progress({ label, value, max }: { label: string; value: number; max: number }) {
  const safeMax = max > 0 ? max : 1;
  const safeValue = Math.min(safeMax, Math.max(0, value));
  return <div><div className="flex items-center justify-between gap-3 text-xs"><span>{label}</span><span>{safeValue}/{safeMax}</span></div><div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={safeValue} className="h-2 rounded-full bg-violet-500" style={{ width: `${Math.round((safeValue / safeMax) * 100)}%` }} /></div></div>;
}
