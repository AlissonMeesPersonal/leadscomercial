import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "../../lib/auth";

export const runtime = "nodejs";

export default async function DashboardLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const token = cookieStore.get("lead_session")?.value;
  const valid = await verifySession(token);

  if (!valid) {
    redirect("/login");
  }

  return children;
}
