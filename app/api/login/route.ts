import { NextResponse } from "next/server";
import { createSession } from "../../../lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const expectedUser = process.env.COMERCIAL_USER;
  const expectedPassword = process.env.COMERCIAL_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return NextResponse.json(
      { error: "Login ainda não configurado no servidor." },
      { status: 503 }
    );
  }

  if (body.username !== expectedUser || body.password !== expectedPassword) {
    return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const token = await createSession(body.username);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("lead_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return response;
}
