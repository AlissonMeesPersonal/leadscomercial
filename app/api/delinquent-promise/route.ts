import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";

const DB = "https://efahamylmoueniflnvzl.supabase.co";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export async function PATCH(request: Request) {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!key) return NextResponse.json({ error: "Servidor sem chave de banco configurada." }, { status: 503 });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  let input: { itemId?: unknown; date?: unknown };
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  if (typeof input.itemId !== "string" || !UUID.test(input.itemId)) {
    return NextResponse.json({ error: "Carteira inválida." }, { status: 400 });
  }
  const date = input.date;
  if (date !== null && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(new Date(date + "T12:00:00Z").getTime()) ||
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date)) {
    return NextResponse.json({ error: "Informe uma data válida." }, { status: 400 });
  }
  const headers = {
    apikey: key, Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };
  const userQuery = new URLSearchParams({
    select: "id,role,username",
    username: `eq.${session.username}`,
    active: "eq.true"
  });
  const userResponse = await fetch(`${DB}/rest/v1/commercial_users?${userQuery}`, { headers, cache: "no-store" });
  if (!userResponse.ok) return NextResponse.json({ error: "Falha ao validar usuário." }, { status: 502 });
  const users = await userResponse.json() as { id: string; role: string; username: string }[];
  const user = users.find(item => item.username.toLowerCase() === session.username.toLowerCase());
  if (!user || (!(
    session.role === "admin" && user.role === "admin"
  ) && !(
    session.userId === user.id ||
    (session.userId === "setor-comercial" && session.username === "comercial" && user.role === "commercial")
  ))) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

  const params = new URLSearchParams({
    select: "id,lead_id,payment_status,commercial_leads!inner(owner_user_id,unit_id,demand_type)",
    id: `eq.${input.itemId}`
  });
  const itemResponse = await fetch(`${DB}/rest/v1/commercial_delinquent_items?${params}`, { headers, cache: "no-store" });
  if (!itemResponse.ok) return NextResponse.json({ error: "Não foi possível localizar a cobrança." }, { status: 502 });
  type Item = { id: string; payment_status: string; commercial_leads: {owner_user_id:string|null;unit_id:string|null;demand_type:string} };
  const item = (await itemResponse.json() as Item[])[0];
  if (!item || item.commercial_leads.demand_type !== "delinquent")
    return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  const admin = session.role === "admin" && user.role === "admin";
  if (!admin && (item.commercial_leads.owner_user_id !== user.id ||
    (session.unitId && item.commercial_leads.unit_id !== session.unitId))) {
    return NextResponse.json({ error: "Cobrança fora da sua carteira." }, { status: 403 });
  }
  if (date && item.payment_status === "paid") {
    return NextResponse.json({ error: "Cobrança já quitada; não é possível prometer novo pagamento." }, { status: 409 });
  }

  const update = await fetch(
    `${DB}/rest/v1/commercial_delinquent_items?id=eq.${encodeURIComponent(item.id)}&select=id,promised_payment_date`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ promised_payment_date: date }),
      cache: "no-store"
    }
  );
  if (!update.ok) return NextResponse.json({ error: "Não foi possível salvar a promessa. Confira se o SQL foi executado." }, { status: 503 });
  const rows = await update.json() as {id:string;promised_payment_date:string|null}[];
  if (!rows.length) return NextResponse.json({ error: "Nenhuma cobrança atualizada." }, { status: 409 });
  return NextResponse.json(rows[0], { headers: { "Cache-Control": "no-store" } });
}


export async function GET() {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!session || !key) return NextResponse.json({ error: "Indisponível." }, { status: 403 });
  const headers = {
    apikey: key, Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };
  const userQuery = new URLSearchParams({
    select: "id,username,role",
    username: `eq.${session.username}`, active: "eq.true"
  });
  const response = await fetch(`${DB}/rest/v1/commercial_users?${userQuery}`, { headers, cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: "Falha de autenticação." }, { status: 502 });
  const users = await response.json() as { id: string; username: string; role: string }[];
  const user = users.find(u => u.username.toLowerCase() === session.username.toLowerCase());
  if (!user || (session.userId !== user.id &&
    !(session.userId === "setor-comercial" && session.username === "comercial" && user.role === "commercial"))) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }
  const admin = session.role === "admin" && user.role === "admin";
  const rows: {id:string;promised_payment_date:string|null}[] = [];
  for (let offset = 0; ; offset += 500) {
    const params = new URLSearchParams({
      select: "id,promised_payment_date,commercial_leads!inner(owner_user_id,unit_id,demand_type)",
      limit: "500", offset: String(offset), order: "id.asc",
      "commercial_leads.demand_type": "eq.delinquent"
    });
    if (!admin) params.set("commercial_leads.owner_user_id", `eq.${user.id}`);
    if (!admin && session.unitId) params.set("commercial_leads.unit_id", `eq.${session.unitId}`);
    const res = await fetch(`${DB}/rest/v1/commercial_delinquent_items?${params}`, {
      headers, cache: "no-store"
    });
    if (!res.ok) return NextResponse.json({ error: "Configure a coluna de promessas no Supabase." }, { status: 503 });
    const page = await res.json() as { id: string; promised_payment_date: string | null }[];
    rows.push(...page.map(row => ({id:row.id,promised_payment_date:row.promised_payment_date})));
    if (page.length < 500) break;
  }
  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}
