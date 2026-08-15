"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({ open, title, description, confirmLabel, destructive = false, pending = false, onCancel, onConfirm }: { open: boolean; title: string; description: string; confirmLabel: string; destructive?: boolean; pending?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onCancel, open]);

  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation"><dialog ref={dialogRef} open role="alertdialog" aria-modal="true" aria-labelledby="flowyn-confirm-title" aria-describedby="flowyn-confirm-description" className="m-0 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-white"><div className="p-6"><h2 id="flowyn-confirm-title" className="text-lg font-semibold">{title}</h2><p id="flowyn-confirm-description" className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button ref={cancelRef} variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button><Button onClick={onConfirm} disabled={pending} aria-busy={pending} className={destructive ? "bg-rose-700 text-white hover:bg-rose-800" : undefined}>{pending ? "Working…" : confirmLabel}</Button></div></div></dialog></div>;
}
