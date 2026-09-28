import { pbkdf2Sync } from "node:crypto";
import { NextResponse } from "next/server";
import { CommercialSession, createSession } from "../../../lib/auth";

const SUPABASE_URL = "https://efahamylmoueniflnvzl.supabase.co";
const SUPABASE_KEY = "sb_publishable_TD903F8atFHoM64JbiEEFA_qhnm_PhI";

const ACCESS_SALT = "lc-supa-2026-7f4d2a9bc18e6d53";
const ACCESS_ITERATIONS = 310000;
const SESSION_COOKIE = "lead_session";
const SESSION_MAX_AGE = 60 * 60 * 12;

type DbLoginRow = {
  user_id: string;
  username: string;
  display_name: string;
  role: "admin" | "commercial" | "user";
  unit_id: string | null;
  unit_name: string | null;
  access_token: string;
};

function buildCommercialAccessToken(username: string, password: string) {
  return pbkdf2Sync(
    `${username}:${password}`,
    ACCESS_SALT,
    ACCESS_ITERATIONS,
    32,
    "sha256"
  ).toString("hex");
}

async function loginWithDatabase(username: string, password: string) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/commercial_user_login`,
    {
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
    }
  );

  if (!response.ok) {
    const details = await response.text();

    console.error(
      "[Leads Comercial] Login no Supabase falhou:",
      response.status,
      details
    );

    return null;
  }

  const rows = (await response.json()) as DbLoginRow[];
  return rows[0] ?? null;
}

async function registerCommercialLogin(accessToken: string) {
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/commercial_touch_last_login`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          "x-client-info": accessToken,
          "Content-Type": "application/json"
        },
        body: "{}",
        cache: "no-store"
      }
    );
  } catch (error) {
    console.error(
      "[Leads Comercial] Não foi possível registrar o último acesso do Setor Comercial:",
      error
    );
  }
}

async function loginCommercialUser(username: string, password: string) {
  const configuredUsername = process.env.COMERCIAL_USER;
  const configuredPassword = process.env.COMERCIAL_PASSWORD;

  const credentialsMatch =
    Boolean(configuredUsername) &&
    Boolean(configuredPassword) &&
    username === configuredUsername &&
    password === configuredPassword;

  if (!credentialsMatch) {
    return null;
  }

  const session: CommercialSession = {
    username: "comercial",
    displayName: "Setor Comercial",
    role: "commercial",
    userId: "setor-comercial",
    unitId: null,
    unitName: null
  };

  const accessToken = buildCommercialAccessToken(username, password);
  await registerCommercialLogin(accessToken);

  return { session, accessToken };
}

function sessionFromDbUser(user: DbLoginRow): CommercialSession {
  return {
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    userId: user.user_id,
    unitId: user.unit_id,
    unitName: user.unit_name
  };
}

async function createLoginResponse(
  session: CommercialSession,
  accessToken: string
) {
  const token = await createSession(session);

  const response = NextResponse.json({
    ok: true,
    accessToken,
    role: session.role,
    displayName: session.displayName,
    unitName: session.unitName
  });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });

  return response;
}

function invalidCredentialsResponse() {
  return NextResponse.json(
    { error: "Usuário ou senha inválidos." },
    { status: 401 }
  );
}

export async function POST(request: Request) {
  const body = await request.json();

  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "Informe usuário e senha." },
      { status: 400 }
    );
  }

  if (username.toLowerCase() === "comercial") {
    const commercialLogin = await loginCommercialUser(username, password);

    if (!commercialLogin) {
      return invalidCredentialsResponse();
    }

    return createLoginResponse(
      commercialLogin.session,
      commercialLogin.accessToken
    );
  }

  const dbUser = await loginWithDatabase(username, password);

  if (!dbUser?.access_token) {
    return invalidCredentialsResponse();
  }

  return createLoginResponse(
    sessionFromDbUser(dbUser),
    dbUser.access_token
  );
}
