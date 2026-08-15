import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FlowynShell } from "@/components/flowyn-shell";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { getSessionUser } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const currentUser = await getSessionUser(await headers());
  if (!currentUser) redirect("/sign-in");

  return <WorkspaceProvider><FlowynShell userEmail={currentUser.email}>{children}</FlowynShell></WorkspaceProvider>;
}
