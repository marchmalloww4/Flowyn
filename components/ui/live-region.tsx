export function LiveRegion({ mode, children }: { mode: "polite" | "assertive"; children?: React.ReactNode }) {
  return <div role={mode === "assertive" ? "alert" : "status"} aria-live={mode} aria-atomic="true" className="sr-only">{children}</div>;
}
