import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";

export const runtime = "nodejs";
const BASE = "https://efahamylmoueniflnvzl.supabase.co/rest/v1";
type Row = Record<string, unknown>;
type Actor = { id: string; username: string; role: string; active: boolean; deleted_at: string | null };
type Archive = {
  id: string; kind: "folder" | "user"; title: string; owner_user_id: string;
  owner_username: string; actor_user_id: string; actor_username: string;
  deleted_at: string; restored_at: string | null; status: string;
  payload: { rows?: Row[]; user?: Row }; record_count: number;
};

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
function headers() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Configure SUPABASE_SERVICE_ROLE_KEY no Vercel e execute supabase/recovery-archive.sql.");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}
async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE}/${path}`, {
    ...init, headers: { ...headers(), ...(init.headers || {}) }, cache: "no-store"
  });
  if (!response.ok) {
    console.error("[Recovery] Supabase request failed", response.status, path.split("?")[0]);
    throw new Error("O banco recusou a operação. Confira a tabela de recuperação e as permissões.");
  }
  if (response.status === 204) return [];
  return response.json() as Promise<Row[]>;
}
async function allRows(path: string) {
  const results: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const join = path.includes("?") ? "&" : "?";
    const rows = await db(`${path}${join}limit=500&offset=${offset}`);
    results.push(...rows);
    if (rows.length < 500) break;
  }
  return results;
}
async function actorContext() {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  if (!session) return null;
  const idFilter = session.userId === "setor-comercial"
    ? `username=eq.${encodeURIComponent(session.username)}`
    : `id=eq.${encodeURIComponent(session.userId)}`;
  const rows = await db(`commercial_users?select=id,username,role,active,deleted_at&${idFilter}&limit=1`);
  const actor = rows[0] as Actor | undefined;
  if (!actor?.active || actor.deleted_at || actor.username.toLowerCase() !== session.username.toLowerCase() ||
      actor.role !== session.role) return null;
  return { session, actor, isAlisson: actor.role === "admin" && actor.username.toLowerCase() === "alisson" };
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
async function archive(row: Omit<Archive, "id" | "deleted_at" | "restored_at">) {
  const saved = await db("commercial_recovery_archive?select=id", {
    method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row)
  });
  if (!isUuid(saved[0]?.id)) throw new Error("O banco não confirmou o backup. Exclusão cancelada.");
  return saved[0].id as string;
}
async function markArchive(id: string, status: Archive["status"], extra: Row = {}) {
  await db(`commercial_recovery_archive?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ status, ...extra })
  });
}
function originOK(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
export async function GET() {
  try {
    const ctx = await actorContext();
    if (!ctx?.isAlisson) return err("Histórico exclusivo do gestor Alisson.", 403);
    const rows = await allRows("commercial_recovery_archive?select=id,kind,title,owner_user_id,owner_username,actor_user_id,actor_username,deleted_at,restored_at,status,record_count&order=deleted_at.desc");
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return err(error instanceof Error ? error.message : "Histórico indisponível.", 503); }
}
export async function POST(request: Request) {
  if (!originOK(request)) return err("Origem inválida.", 403);
  let input: Record<string, unknown>;
  try { input = await request.json() as Row; } catch { return err("Dados inválidos."); }
  try {
    const ctx = await actorContext();
    if (!ctx) return err("Sessão inválida.", 401);

    if (input.action === "delete-folder") {
      if (!isUuid(input.ownerUserId) || !["opportunity", "inactive"].includes(String(input.demandType)) ||
        typeof input.filename !== "string" || input.filename.length > 255 ||
        !/\.(xlsx?|xlsm|xlsb|ods|csv|tsv|txt|pdf|docx?|json)$/i.test(input.filename)) {
        return err("Arquivo inválido.");
      }
      if (ctx.actor.role !== "admin" && ctx.actor.id !== input.ownerUserId) return err("Arquivo de outro usuário.", 403);
      const unitId = isUuid(input.unitId) ? input.unitId : null;
      if (ctx.actor.role !== "admin" && ctx.session.unitId && ctx.session.unitId !== unitId) return err("Outra unidade.", 403);
      const owner = await db(`commercial_users?select=id,username&id=eq.${encodeURIComponent(input.ownerUserId)}&limit=1`);
      if (!owner.length) return err("Responsável não encontrado.", 404);
      const rows = (await allRows(
        `commercial_leads?select=*&owner_user_id=eq.${encodeURIComponent(input.ownerUserId)}&demand_type=eq.${input.demandType}&unit_id=${unitId ? "eq." + encodeURIComponent(unitId) : "is.null"}&order=id.asc`
      )).filter(row => String(row.source || "").split(" • ")[0].trim() === input.filename);
      if (!rows.length) return err("A pasta não contém mais registros.", 409);
      if (!Number.isSafeInteger(input.expectedCount) || input.expectedCount !== rows.length) return err("A pasta mudou. Atualize e tente novamente.", 409);
      // Uma pasta de oportunidades/inativos não deve remover itens financeiros de outras carteiras.
      for (let offset = 0; offset < rows.length; offset += 100) {
        const ids = rows.slice(offset, offset + 100).map(r => r.id).filter(isUuid);
        const linked = await db(`commercial_delinquent_items?select=id&lead_id=in.(${ids.join(",")})&limit=1`);
        if (linked.length) return err("Existem vínculos financeiros; exclusão bloqueada para proteger o histórico.", 409);
      }
      const id = await archive({
        kind: "folder", title: input.filename, owner_user_id: input.ownerUserId,
        owner_username: String(owner[0].username), actor_user_id: ctx.actor.id,
        actor_username: ctx.actor.username, status: "prepared",
        payload: { rows }, record_count: rows.length
      });
      try {
        for (let offset = 0; offset < rows.length; offset += 75) {
          const ids = rows.slice(offset, offset + 75).map(r => r.id).filter(isUuid);
          const removed = await db(`commercial_leads?id=in.(${ids.join(",")})&owner_user_id=eq.${encodeURIComponent(input.ownerUserId)}&select=id`, {
            method: "DELETE", headers: { Prefer: "return=representation" }
          });
          if (removed.length !== ids.length) throw new Error("Exclusão parcial identificada. O snapshot está preservado.");
        }
        await markArchive(id, "deleted");
        return NextResponse.json({ ok: true, id, count: rows.length });
      } catch (error) {
        await markArchive(id, "failed").catch(() => {});
        throw error;
      }
    }

    if (input.action === "delete-user") {
      if (ctx.actor.role !== "admin" || !isUuid(input.userId)) return err("Ação exclusiva do administrador.", 403);
      const rows = await db(`commercial_users?select=id,username,display_name,role,unit_id,active,deleted_at&id=eq.${encodeURIComponent(input.userId)}&limit=1`);
      const user = rows[0];
      if (!user || user.deleted_at) return err("Usuário não encontrado ou já excluído.", 404);
      if (user.username === "alisson" || user.username === "comercial" || user.role === "admin") return err("Conta protegida.", 403);
      const id = await archive({
        kind: "user", title: String(user.display_name || user.username),
        owner_user_id: String(user.id), owner_username: String(user.username),
        actor_user_id: ctx.actor.id, actor_username: ctx.actor.username,
        status: "prepared", payload: { user }, record_count: 1
      });
      // Exclusão lógica preserva leads e histórico operacional.
      try {
        await db(`commercial_users?id=eq.${encodeURIComponent(input.userId)}`, {
          method: "PATCH", body: JSON.stringify({ active: false, deleted_at: new Date().toISOString() })
        });
        await markArchive(id, "deleted");
        return NextResponse.json({ ok: true, id });
      } catch (error) {
        await markArchive(id, "failed").catch(() => {});
        throw error;
      }
    }

    if (input.action === "restore") {
      if (!ctx.isAlisson || !isUuid(input.id)) return err("Restauração exclusiva do gestor Alisson.", 403);
      const archives = await db(`commercial_recovery_archive?select=*&id=eq.${encodeURIComponent(input.id)}&limit=1`);
      const record = archives[0] as Archive | undefined;
      if (!record || !["deleted", "failed"].includes(record.status)) return err("Exclusão indisponível para restauração.", 409);
      if (record.kind === "user") {
        const original = record.payload?.user;
        if (!original || !isUuid(original.id)) return err("Backup do usuário inválido.", 409);
        const found = await db(`commercial_users?select=id,deleted_at&id=eq.${original.id}&limit=1`);
        if (!found.length) return err("O cadastro foi removido fisicamente. Necessária recuperação pelo backup do banco.", 409);
        await db(`commercial_users?id=eq.${original.id}`, {
          method: "PATCH", body: JSON.stringify({
            active: original.active === true, deleted_at: original.deleted_at ?? null
          })
        });
      } else {
        const rows = record.payload?.rows;
        if (!Array.isArray(rows) || rows.length !== record.record_count) return err("Snapshot incompleto; restauração bloqueada.", 409);
        for (let offset = 0; offset < rows.length; offset += 75) {
          const chunk = rows.slice(offset, offset + 75);
          // Não sobrescreve registros que possam ter sido recriados depois.
          await db("commercial_leads?on_conflict=id", {
            method: "POST", headers: { Prefer: "resolution=ignore-duplicates" },
            body: JSON.stringify(chunk)
          });
        }
        const ids = rows.map(row => row.id).filter(isUuid);
        for (let offset = 0; offset < ids.length; offset += 75) {
          const chunk = ids.slice(offset, offset + 75);
          const check = await db(`commercial_leads?select=id&id=in.(${chunk.join(",")})`);
          if (check.length !== chunk.length) throw new Error("A restauração ficou incompleta; tente novamente.");
        }
      }
      await markArchive(record.id, "restored", { restored_at: new Date().toISOString(), restored_by: ctx.actor.username });
      return NextResponse.json({ ok: true });
    }
    return err("Operação desconhecida.");
  } catch (error) {
    return err(error instanceof Error ? error.message : "Não foi possível concluir.", 503);
  }
}
