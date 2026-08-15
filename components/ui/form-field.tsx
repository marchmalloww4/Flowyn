import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FormField({ label, htmlFor, description, error, required, children, className }: { label: string; htmlFor: string; description?: string; error?: string; required?: boolean; children?: React.ReactNode; className?: string }) {
  const describedBy = [description ? `${htmlFor}-description` : null, error ? `${htmlFor}-error` : null].filter(Boolean).join(" ");
  const child = React.Children.only(children) as React.ReactElement<Record<string, unknown>>;
  const control = React.cloneElement(child, {
    "aria-describedby": [child.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
    "aria-invalid": error ? true : child.props["aria-invalid"],
  });
  return <div className={cn("space-y-2", className)}><Label htmlFor={htmlFor}>{label}{required && <span aria-hidden="true"> *</span>}</Label>{description && <p id={`${htmlFor}-description`} className="text-xs text-slate-500 dark:text-slate-400">{description}</p>}{control}{error && <p id={`${htmlFor}-error`} className="text-sm text-rose-700 dark:text-rose-200">{error}</p>}</div>;
}
