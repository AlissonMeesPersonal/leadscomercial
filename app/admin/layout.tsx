import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "../../lib/auth";

export const runtime = "nodejs";

export default async function AdminLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const token = cookieStore.get("lead_session")?.value;
  const session = await getSession(token);

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  return children;
}
