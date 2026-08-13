import { auth } from "@/lib/auth/auth";
import { AppError } from "@/lib/security/errors";

export async function getSessionUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}

export async function requireUser(headers: Headers) {
  const user = await getSessionUser(headers);
  if (!user) throw new AppError("UNAUTHENTICATED", 401, "Sign in is required.");
  return user;
}

export const requireAuthenticatedUser = requireUser;
