import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";

const DB = "https://efahamylmoueniflnvzl.supabase.co";

export async function POST(request: Request) {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  if (!session || session.role !== "admin") return NextResponse.json({error:"Apenas administradores podem atribuir este perfil."},{status:403});
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({error:"Origem inválida."},{status:403});
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({error:"Chave de serviço do Supabase não configurada na Vercel."},{status:503});
  let body: {username?:unknown};
  try { body = await request.json(); }
  catch { return NextResponse.json({error:"Solicitação inválida."},{status:400}); }
  if (typeof body.username !== "string" || !/^[a-z0-9._-]{3,80}$/i.test(body.username)) {
    return NextResponse.json({error:"Nome de usuário inválido."},{status:400});
  }
  const headers = {apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"};
  const users = async (username:string) => {
    const params = new URLSearchParams({
      select:"id,username,role,active,created_at",
      username:`eq.${username}`,
      active:"eq.true"
    });
    const response = await fetch(`${DB}/rest/v1/commercial_users?${params}`,{headers,cache:"no-store"});
    if (!response.ok) throw new Error("Não foi possível verificar as contas.");
    return await response.json() as {id:string;username:string;role:string;active:boolean;created_at:string}[];
  };
  try {
    const admins = await users(session.username);
    if (!admins.some(user=>user.id === session.userId && user.role === "admin")) {
      return NextResponse.json({error:"Seu perfil de administrador não está ativo no banco."},{status:403});
    }
    const candidate = (await users(body.username))[0];
    if (!candidate || candidate.role !== "commercial" ||
        candidate.username.toLowerCase() === session.username.toLowerCase() ||
        !Number.isFinite(Date.parse(candidate.created_at)) ||
        Date.now() - Date.parse(candidate.created_at) > 10 * 60 * 1000 ||
        Date.now() < Date.parse(candidate.created_at)) {
      return NextResponse.json({error:"A promoção só é permitida para uma conta comercial criada nos últimos 10 minutos."},{status:409});
    }
    const response = await fetch(
      `${DB}/rest/v1/commercial_users?id=eq.${encodeURIComponent(candidate.id)}&role=eq.commercial&select=id,role`,{
      method:"PATCH",headers:{...headers,Prefer:"return=representation"},
      body:JSON.stringify({role:"coordinator"}),cache:"no-store"
    });
    if (!response.ok) {
      return NextResponse.json({
        error:"Conta criada como Setor Comercial, mas o banco rejeitou o perfil Coordenadora. Execute supabase/coordinator-role.sql no SQL Editor do projeto Leads Comercial. A conta não recebeu permissão gerencial; não entregue a senha provisória."
      },{status:503});
    }
    const updated = await response.json() as {id:string;role:string}[];
    if (!updated.length || updated[0].role !== "coordinator") {
      return NextResponse.json({error:"O banco não confirmou o perfil Coordenadora Comercial."},{status:409});
    }
    return NextResponse.json({ok:true,role:"coordinator"});
  } catch {
    return NextResponse.json({error:"Não foi possível confirmar o perfil da coordenadora."},{status:503});
  }
}
