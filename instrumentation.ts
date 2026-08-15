import { validateRuntime } from "@/lib/runtime/startup";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") validateRuntime("app");
}
