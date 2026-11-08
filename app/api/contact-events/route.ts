import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";

const DB = "https://efahamylmoueniflnvzl.supabase.co";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DbUser = { id: string; username: string; role: string; active: boolean };
type DbLead = { id: string; owner_user_id: string | null; unit_id: string | null; demand_type: string };
type Event = {
  id: string; lead_id: string | null; actor_user_id: string;
  lead_owner_user_id: string | null; unit_id: string | null;
  demand_type: string; event_type: "scale_started"; occurred_at: string;
};

async function context() {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!session || !key) return null;
  const headers = {
    apikey: key, Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };
  const params = new URLSearchParams({
    select: "id,username,role,active", username: `eq.${session.username}`,
    active: "eq.true"
  });
  const result = await fetch(`${DB}/rest/v1/commercial_users?${params}`, {
    headers, cache: "no-store"
  });
  if (!result.ok) return null;
  const users = await result.json() as DbUser[];
  const user = users.find(u => u.username.toLowerCase() === session.username.toLowerCase());
  if (!user) return null;
  const admin = user.role === "admin" && session.role === "admin";
  // 'setor-comercial' is the legacy env-login identity; verify the username
  // against the active database user before resolving its ownership.
  if (!admin && session.userId !== user.id &&
      !(session.userId === "setor-comercial" && session.username === "comercial" && user.role === "commercial")) return null;
  return { session, user, admin, headers };
}

export async function POST(request: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "Registro indisponível: sessão ou configuração inválida." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  let body: { leadId?: unknown; eventId?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 }); }
  if (typeof body.leadId !== "string" || !UUID.test(body.leadId) ||
      typeof body.eventId !== "string" || !UUID.test(body.eventId))
    return NextResponse.json({ error: "Identificação inválida." }, { status: 400 });
  const params = new URLSearchParams({ select: "id,owner_user_id,unit_id,demand_type", id: `eq.${body.leadId}` });
  const leadResponse = await fetch(`${DB}/rest/v1/commercial_leads?${params}`, {
    headers: ctx.headers, cache: "no-store"
  });
  if (!leadResponse.ok) return NextResponse.json({ error: "Não foi possível validar o contato." }, { status: 502 });
  const lead = ((await leadResponse.json()) as DbLead[])[0];
  if (!lead) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  if (!ctx.admin && (lead.owner_user_id !== ctx.user.id ||
      (ctx.session.unitId && lead.unit_id !== ctx.session.unitId)))
    return NextResponse.json({ error: "Contato fora da sua carteira." }, { status: 403 });
  if (!["opportunity", "inactive", "delinquent"].includes(lead.demand_type))
    return NextResponse.json({ error: "Carteira inválida." }, { status: 400 });

  const event = {
    id: body.eventId, lead_id: lead.id,
    actor_user_id: ctx.user.id, lead_owner_user_id: lead.owner_user_id,
    unit_id: lead.unit_id, demand_type: lead.demand_type, event_type: "scale_started"
  };
  const response = await fetch(`${DB}/rest/v1/commercial_contact_events?on_conflict=id&select=*`, {
    method: "POST",
    headers: { ...ctx.headers, Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(event), cache: "no-store"
  });
  if (!response.ok)
    return NextResponse.json({ error: "Registro de atendimento indisponível. Verifique a migração e a chave de serviço." }, { status: 503 });
  return NextResponse.json({ ok: true, type: "scale_started" }, { status: 201 });
}

export async function GET(request: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "Histórico indisponível ou acesso não autorizado." }, { status: 403 });
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return NextResponse.json({ error: "Data inicial inválida." }, { status: 400 });
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) return NextResponse.json({ error: "Data final inválida." }, { status: 400 });

  const limit = 500;
  const items: Event[] = [];
  for (let offset = 0; ; offset += limit) {
    const params = new URLSearchParams({
      select: "id,lead_id,actor_user_id,lead_owner_user_id,unit_id,demand_type,event_type,occurred_at",
      order: "occurred_at.desc,id.desc",
      limit: String(limit), offset: String(offset)
    });
    if (!ctx.admin) params.set("actor_user_id", `eq.${ctx.user.id}`);
    if (!ctx.admin && ctx.session.unitId) params.set("unit_id", `eq.${ctx.session.unitId}`);
    if (start) params.set("occurred_at", `gte.${start}T00:00:00-03:00`);
    // Use an exclusive next-day end boundary when a final date is supplied.
    if (end) {
      const next = new Date(`${end}T12:00:00Z`);
      if (Number.isNaN(next.getTime())) return NextResponse.json({ error: "Data final inválida." }, { status: 400 });
      next.setUTCDate(next.getUTCDate() + 1);
      const endIso = next.toISOString().slice(0, 10);
      // Multiple filters on the same column require an explicit and-expression.
      if (start) {
        params.delete("occurred_at");
        params.set("and", `(occurred_at.gte.${start}T00:00:00-03:00,occurred_at.lt.${endIso}T00:00:00-03:00)`);
      } else params.set("occurred_at", `lt.${endIso}T00:00:00-03:00`);
    }
    const response = await fetch(`${DB}/rest/v1/commercial_contact_events?${params}`, {
      headers: ctx.headers, cache: "no-store"
    });
    if (!response.ok)
      return NextResponse.json({ error: "Não foi possível consultar o histórico. Verifique o SQL de instalação." }, { status: 503 });
    const page = await response.json() as Event[];
    items.push(...page);
    if (page.length < limit) break;
  }
  return NextResponse.json(items, { headers: { "Cache-Control": "no-store" } });
}
