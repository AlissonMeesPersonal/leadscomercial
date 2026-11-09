import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";

export default async function CoordinatorLayout({ children }: Readonly<{children:React.ReactNode}>) {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  if (!session) redirect("/login");
  if (session.role !== "coordinator" && session.role !== "admin") redirect("/dashboard");
  return children;
}
