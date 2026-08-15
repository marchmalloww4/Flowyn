export function operationStatusSummary(statuses: Record<string, number>): string {
  const entries = Object.entries(statuses);
  return entries.length ? entries.map(([status, count]) => `${status}: ${count}`).join(" · ") : "None";
}
