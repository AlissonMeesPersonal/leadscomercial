import { NextResponse } from "next/server";
import { createSession, CommercialSession } from "../../../lib/auth";

const SUPABASE_URL = "https://efahamylmoueniflnvzl.supabase.co";
const SUPABASE_KEY = "sb_publishable_TD903F8atFHoM64JbiEEFA_qhnm_PhI";
type DbLoginRow = {
  user_id: string;
  username: string;
  display_name: string;
  role: "admin" | "user";
  unit_id: string | null;
  unit_name: string | null;
  access_token: string;
};

async function databaseLogin(username: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/commercial_user_login`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_username: username,
      p_password: password
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    console.error("[Leads Comercial] Falha no login Supabase:", response.status, await response.text());
    return null;
  }

  const rows = (await response.json()) as DbLoginRow[];
  return rows[0] || null;
}

export async function POST(request: Request) {
  const body = await request.json();
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "Informe usuário e senha." },
      { status: 400 }
    );
  }

  const dbUser = await databaseLogin(username, password);

  if (!dbUser?.access_token) {
    return NextResponse.json(
      { error: "Usuário ou senha inválidos." },
      { status: 401 }
    );
  }

  const session: CommercialSession = {
    username: dbUser.username,
    displayName: dbUser.display_name,
    role: dbUser.role,
    userId: dbUser.user_id,
    unitId: dbUser.unit_id,
    unitName: dbUser.unit_name
  };

  const token = await createSession(session);
  const response = NextResponse.json({
    ok: true,
    accessToken: dbUser.access_token,
    role: session.role,
    displayName: session.displayName,
    unitName: session.unitName
  });

  response.cookies.set("lead_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  return response;
}
