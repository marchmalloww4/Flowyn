export const MIGRATION_ADVISORY_LOCK_KEY = 7130413;

export function migrationLockSql(action: "lock" | "unlock"): string {
  return action === "lock" ? "select pg_advisory_lock($1)" : "select pg_advisory_unlock($1)";
}

export function migrationTryLockSql(): string {
  return "select pg_try_advisory_lock($1) as acquired";
}

export function migrationUnlockSql(): string {
  return "select pg_advisory_unlock($1) as released";
}
