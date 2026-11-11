import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import RecoveryHistory from "./RecoveryHistory";

export const runtime = "nodejs";

export default async function HistoryPage() {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  if (!session) redirect("/login");
  if (session.role !== "admin" || session.username.toLowerCase() !== "alisson") {
    redirect("/dashboard");
  }
  return <RecoveryHistory />;
}
