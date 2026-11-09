import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";

const DB = "https://efahamylmoueniflnvzl.supabase.co";
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;


export async function GET() {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  if (!session || session.role !== "admin") return NextResponse.json({error:"Acesso negado."},{status:403});
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({error:"Chave de serviço do Supabase indisponível."},{status:503});
  const check=await fetch(`${DB}/rest/v1/commercial_password_activation?select=user_id&limit=0`,{
    headers:{apikey:key,Authorization:`Bearer ${key}`},cache:"no-store"
  });
  if (!check.ok) return NextResponse.json({error:"Execute primeiro o SQL password-activation.sql no Supabase."},{status:503});
  return NextResponse.json({ready:true},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request: Request) {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  if (!session || session.role !== "admin") return NextResponse.json({error:"Somente o administrador pode cadastrar ativações."},{status:403});
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({error:"Origem inválida."},{status:403});
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({error:"Chave de serviço indisponível na Vercel."},{status:503});
  let data:{username?:unknown};
  try { data = await request.json(); } catch { return NextResponse.json({error:"Dados inválidos."},{status:400}); }
  if (typeof data.username !== "string" || !/^[a-z0-9._-]{3,80}$/i.test(data.username)) return NextResponse.json({error:"Usuário inválido."},{status:400});
  const headers = { apikey:key, Authorization:`Bearer ${key}`, "Content-Type":"application/json" };
  async function lookup(username:string) {
    const params = new URLSearchParams({select:"id,role,username,created_at,active",username:`eq.${username}`,active:"eq.true"});
    const response = await fetch(`${DB}/rest/v1/commercial_users?${params}`,{headers,cache:"no-store"});
    if (!response.ok) throw new Error("Não foi possível validar o cadastro.");
    return await response.json() as {id:string;role:string;username:string;created_at:string;active:boolean}[];
  }
  try {
    const actor = (await lookup(session.username)).find(u=>u.id===session.userId && u.role==="admin");
    if (!actor) return NextResponse.json({error:"Sessão administrativa inválida."},{status:403});
    const target = (await lookup(data.username))[0];
    if (!target || !uuid.test(target.id) || target.id===session.userId) return NextResponse.json({error:"Conta nova não encontrada."},{status:404});
    // Só permitir ativação de contas recém-criadas; nunca alterar usuários antigos.
    if (Date.now()-new Date(target.created_at).getTime()>10*60*1000) {
      return NextResponse.json({error:"A ativação inicial só é permitida para contas criadas nos últimos 10 minutos."},{status:409});
    }
    const params = new URLSearchParams({on_conflict:"user_id",select:"user_id,must_change_password"});
    const response = await fetch(`${DB}/rest/v1/commercial_password_activation?${params}`,{
      method:"POST",headers:{...headers,Prefer:"resolution=ignore-duplicates,return=representation"},
      body:JSON.stringify({user_id:target.id,must_change_password:true}),cache:"no-store"
    });
    if (!response.ok) return NextResponse.json({error:"Ativação não configurada no Supabase; execute password-activation.sql antes de criar mais usuários."},{status:503});
    const found = await fetch(`${DB}/rest/v1/commercial_password_activation?user_id=eq.${target.id}&select=must_change_password`,{headers,cache:"no-store"});
    if (!found.ok) return NextResponse.json({error:"Não foi possível confirmar a ativação."},{status:503});
    const rows=await found.json() as {must_change_password:boolean}[];
    if (rows[0]?.must_change_password!==true) return NextResponse.json({error:"A ativação não foi confirmada."},{status:409});
    return NextResponse.json({ok:true});
  } catch {
    return NextResponse.json({error:"Não foi possível ativar a senha provisória."},{status:503});
  }
}
