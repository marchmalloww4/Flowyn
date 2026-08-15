import { assertRuntimeConfiguration, type AppEnv, type RuntimeRole } from "@/lib/env";

export function validateRuntime(role: RuntimeRole, env?: AppEnv): void {
  assertRuntimeConfiguration({ role, env });
}

export async function startRuntime<T>(input: {
  role: RuntimeRole;
  env?: AppEnv;
  initializer: () => T | Promise<T>;
}): Promise<T> {
  validateRuntime(input.role, input.env);
  return input.initializer();
}
