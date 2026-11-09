import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";

const DB = "https://efahamylmoueniflnvzl.supabase.co";
type LeadRow = { id: string; owner_user_id: string | null; unit_id: string | null; demand_type: string; status: string };
type EventRow = { lead_id: string | null; actor_user_id: string; unit_id: string | null; occurred_at: string; demand_type: string };
type UserRow = { id: string; display_name: string; username: string; role: string; active: boolean };
type UnitRow = { id: string; name: string };
const allowedRole = (v: string) => v === "admin" || v === "coordinator";

async function getAll<T>(path: string, headers: Record<string,string>): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const glue = path.includes("?") ? "&" : "?";
    const response = await fetch(`${DB}${path}${glue}limit=500&offset=${offset}`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível consultar o banco de dados.");
    const page = await response.json() as T[];
    result.push(...page);
    if (page.length < 500) return result;
  }
}

function localDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo"
  }).format(new Date(iso));
}

export async function GET(request: NextRequest) {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  if (!session || !allowedRole(session.role)) {
    return NextResponse.json({ error: "Acesso restrito à coordenação e à administração." }, { status: 403 });
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Chave de leitura gerencial não configurada." }, { status: 503 });
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const active = await getAll<UserRow>(
      "/rest/v1/commercial_users?select=id,display_name,username,role,active&active=eq.true",
      headers
    );
    const current = active.find(row => row.id === session.userId &&
      row.username.toLowerCase() === session.username.toLowerCase() &&
      row.role === session.role);
    if (!current) return NextResponse.json({ error: "Perfil de gestão não autorizado no banco." }, { status: 403 });

    const from = request.nextUrl.searchParams.get("from") || "";
    const to = request.nextUrl.searchParams.get("to") || "";
    const owner = request.nextUrl.searchParams.get("owner") || "";
    const unit = request.nextUrl.searchParams.get("unit") || "";
    if ([from,to].some(date => date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
      (from && to && from > to)) {
      return NextResponse.json({ error: "Período inválido." }, { status: 400 });
    }
    const [leads, events, units] = await Promise.all([
      getAll<LeadRow>("/rest/v1/commercial_leads?select=id,owner_user_id,unit_id,demand_type,status&order=id.asc",headers),
      getAll<EventRow>("/rest/v1/commercial_contact_events?select=lead_id,actor_user_id,unit_id,occurred_at,demand_type&order=occurred_at.desc",headers),
      getAll<UnitRow>("/rest/v1/commercial_units?select=id,name&active=eq.true",headers)
    ]);
    const team = active.filter(user => user.role === "commercial" || user.role === "user");
    const filteredLeads = leads.filter(lead => (!owner || lead.owner_user_id === owner) &&
      (!unit || lead.unit_id === unit));
    const filteredEvents = events.filter(event => (!owner || event.actor_user_id === owner) &&
      (!unit || event.unit_id === unit) &&
      (!from || localDate(event.occurred_at) >= from) &&
      (!to || localDate(event.occurred_at) <= to));
    const opportunities = filteredLeads.filter(row => row.demand_type === "opportunity");
    const count = (rows: LeadRow[], status: string) => rows.filter(row => row.status === status).length;
    const unique = (rows: EventRow[]) => new Set(rows.map(row => row.lead_id).filter(Boolean)).size;
    const mappedUsers = team.filter(user => !owner || user.id === owner).map(user => {
      const ownLeads = filteredLeads.filter(lead => lead.owner_user_id === user.id && lead.demand_type === "opportunity");
      const ownEvents = filteredEvents.filter(event => event.actor_user_id === user.id);
      const converted = count(ownLeads, "Convertido");
      return {
        id: user.id, name: user.display_name,
        attempts: ownEvents.length, unique: unique(ownEvents),
        opportunities: ownLeads.length, newCount: count(ownLeads,"Novo"),
        inContact: count(ownLeads,"Em contato"), interested: count(ownLeads,"Interessado"),
        noReturn: count(ownLeads,"Sem retorno"), converted,
        conversion: ownLeads.length ? converted / ownLeads.length * 100 : 0
      };
    }).sort((a,b) => b.attempts - a.attempts || b.converted - a.converted);
    return NextResponse.json({
      totals: {
        attempts: filteredEvents.length, unique: unique(filteredEvents),
        opportunities: opportunities.length, newCount: count(opportunities,"Novo"),
        inContact: count(opportunities,"Em contato"),
        interested: count(opportunities,"Interessado"),
        noReturn: count(opportunities,"Sem retorno"),
        converted: count(opportunities,"Convertido"),
        conversion: opportunities.length ? count(opportunities,"Convertido") / opportunities.length * 100 : 0,
        inactive: filteredLeads.filter(lead => lead.demand_type === "inactive").length,
        reactivated: filteredLeads.filter(lead => lead.demand_type === "inactive" && lead.status === "Convertido").length,
        delinquent: filteredLeads.filter(lead => lead.demand_type === "delinquent").length
      },
      users: mappedUsers,
      choices: {
        users: team.map(user => ({id:user.id,name:user.display_name})),
        units
      },
      explanation: "Datas filtram inícios no Scale. Conversões e demais status representam a situação atual da carteira."
    }, {headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"Não foi possível carregar os dados gerenciais."},{status:503});
  }
}
