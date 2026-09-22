import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("lead_session")?.value;
  const session = await getSession(token);

  if (!session) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  return NextResponse.json({
    username: session.username,
    displayName: session.displayName,
    role: session.role,
    unitId: session.unitId,
    unitName: session.unitName
  });
}
