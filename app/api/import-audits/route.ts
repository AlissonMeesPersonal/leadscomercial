import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";

const API = "https://efahamylmoueniflnvzl.supabase.co";
type Audit = {
  id: string; owner_user_id: string; unit_id: string | null;
  demand_type: "opportunity" | "inactive"; filename: string; imported_at: string;
  source_rows: number; valid_rows: number; inserted_rows: number;
  updated_rows: number; not_inserted_rows: number;
};

async function context() {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!session || !key) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const params = new URLSearchParams({
    select: "id,username,role",
    username: `eq.${session.username}`, active: "eq.true"
  });
  const response = await fetch(`${API}/rest/v1/commercial_users?${params}`, {
    headers, cache: "no-store"
  });
  if (!response.ok) return null;
  const users = await response.json() as { id: string; username: string; role: string }[];
  const owner = users.find(user =>
    user.username.toLowerCase() === session.username.toLowerCase()
  );
  if (!owner) return null;
  // Admin também precisa ser autenticado como administrador no cadastro atual.
  const admin = session.role === "admin" && owner.role === "admin";
  if (!admin && owner.id !== session.userId && session.userId !== "setor-comercial") return null;
  return { session, ownerId: owner.id, admin, headers };
}

export async function GET() {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "Histórico indisponível ou acesso não autorizado." }, { status: 403 });
  const params = new URLSearchParams({
    select: "id,owner_user_id,unit_id,demand_type,filename,imported_at,source_rows,valid_rows,inserted_rows,updated_rows,not_inserted_rows",
    order: "imported_at.desc",
    limit: "1000"
  });
  if (!ctx.admin) params.set("owner_user_id", `eq.${ctx.ownerId}`);
  if (!ctx.admin && ctx.session.unitId) params.set("unit_id", `eq.${ctx.session.unitId}`);
  const response = await fetch(`${API}/rest/v1/commercial_import_audits?${params}`, {
    headers: ctx.headers, cache: "no-store"
  });
  if (!response.ok) return NextResponse.json({ error: "Histórico ainda não configurado no banco." }, { status: 503 });
  const audits = await response.json() as Audit[];
  return NextResponse.json(audits, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const filename = typeof input.filename === "string" ? input.filename.trim() : "";
  const demand = input.demandType;
  const unitId = typeof input.unitId === "string" ? input.unitId : null;
  if (!filename || filename.length > 255 || !/\\.(xlsx?|xlsm|xlsb|ods|csv|tsv|txt|pdf|docx?|json)$/i.test(filename)
    || (demand !== "opportunity" && demand !== "inactive")
    || (unitId && !/^[0-9a-f-]{36}$/i.test(unitId))
    || (!ctx.admin && ctx.session.unitId && unitId !== ctx.session.unitId)) {
    return NextResponse.json({ error: "Importação inválida." }, { status: 400 });
  }
  const fields = ["sourceRows", "validRows", "saved", "updated", "notInserted"] as const;
  if (fields.some(field => typeof input[field] !== "number" || !Number.isSafeInteger(input[field]) || Number(input[field]) < 0 || Number(input[field]) > 1000000)) {
    return NextResponse.json({ error: "Contagem inválida." }, { status: 400 });
  }
  const record = {
    owner_user_id: ctx.ownerId, unit_id: unitId,
    demand_type: demand, filename,
    source_rows: input.sourceRows, valid_rows: input.validRows,
    inserted_rows: input.saved, updated_rows: input.updated,
    not_inserted_rows: input.notInserted
  };
  const response = await fetch(`${API}/rest/v1/commercial_import_audits?select=*`, {
    method: "POST", headers: { ...ctx.headers, Prefer: "return=representation" },
    body: JSON.stringify(record), cache: "no-store"
  });
  if (!response.ok) return NextResponse.json({ error: "Falha ao registrar histórico de importação." }, { status: 503 });
  const rows = await response.json() as Audit[];
  return NextResponse.json(rows[0], { status: 201 });
}
