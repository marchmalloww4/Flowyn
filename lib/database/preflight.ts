import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export { migrationTryLockSql, migrationUnlockSql } from "@/lib/database/migration-constants";

export interface MigrationJournalEntry {
  idx: number;
  tag: string;
}

interface MigrationJournal {
  entries: MigrationJournalEntry[];
}

function defaultJournalPath(): string {
  return resolve(process.cwd(), "db", "migrations", "meta", "_journal.json");
}

function defaultMigrationsFolder(): string {
  return resolve(process.cwd(), "db", "migrations");
}

export function getMigrationTarget(journalPath = defaultJournalPath()): string[] {
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as MigrationJournal;
  const entries = [...journal.entries].sort((left, right) => left.idx - right.idx);
  if (entries.some((entry, index) => entry.idx !== index || !/^\d{4}_[a-z0-9_]+$/u.test(entry.tag))) {
    throw new Error("Migration journal entries are not sequential or valid.");
  }
  return entries.map((entry) => entry.tag);
}

export function getMigrationFileTarget(migrationsFolder = defaultMigrationsFolder()): string[] {
  return readdirSync(migrationsFolder)
    .filter((fileName) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(fileName))
    .map((fileName) => fileName.slice(0, -4))
    .sort();
}

export function migrationTargetMatches(candidate: readonly string[], journalPath = defaultJournalPath(), migrationsFolder = defaultMigrationsFolder()): boolean {
  const journalTarget = getMigrationTarget(journalPath);
  const fileTarget = getMigrationFileTarget(migrationsFolder);
  return candidate.length === journalTarget.length
    && candidate.every((tag, index) => tag === journalTarget[index])
    && fileTarget.length === journalTarget.length
    && fileTarget.every((tag, index) => tag === journalTarget[index]);
}
