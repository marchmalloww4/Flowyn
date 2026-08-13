import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/database/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://flowyn:flowyn@localhost:5432/flowyn",
  },
  strict: true,
  verbose: true,
});