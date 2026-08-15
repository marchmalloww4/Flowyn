import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getEnv } from "@/lib/env";
import { getDatabase } from "@/lib/database";
import { account, session, user, verification } from "@/lib/database/schema";

export const auth = betterAuth({
  database: drizzleAdapter(getDatabase(), {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  secret: getEnv().BETTER_AUTH_SECRET,
  baseURL: getEnv().NEXT_PUBLIC_APP_URL,
  trustedOrigins: getEnv().BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
});
