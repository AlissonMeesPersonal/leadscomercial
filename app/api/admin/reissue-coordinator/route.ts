import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";

const DB = "https://efahamylmoueniflnvzl.supabase.co";

export async function POST(request: Request) {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  if (!session || session.role !== "admin")
    return NextResponse.json({error:"Acesso exclusivo do administrador."},{status:403});
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({error:"Origem inválida."},{status:403});
  let body: {userId?:unknown};
  try { body=await request.json(); } catch {
    return NextResponse.json({error:"Dados inválidos."},{status:400});
  }
  if(typeof body.userId!=="string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(body.userId))
    return NextResponse.json({error:"Usuário inválido."},{status:400});
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({error:"Chave de serviço indisponível."},{status:503});
  const headers={apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"};
  try {
    const admins=await fetch(`${DB}/rest/v1/commercial_users?select=id,role,active&id=eq.${encodeURIComponent(session.userId)}`,{headers,cache:"no-store"});
    if(!admins.ok) throw new Error("Falha ao verificar o administrador.");
    const actor=await admins.json() as {id:string;role:string;active:boolean}[];
    if(actor[0]?.role!=="admin" || !actor[0]?.active)
      return NextResponse.json({error:"Administrador não autorizado."},{status:403});

    const check=await fetch(`${DB}/rest/v1/commercial_users?select=id,role,active&id=eq.${encodeURIComponent(body.userId)}`,{headers,cache:"no-store"});
    if(!check.ok) throw new Error("Falha ao verificar a coordenadora.");
    const target=await check.json() as {id:string;role:string;active:boolean}[];
    if(target[0]?.role!=="coordinator" || !target[0]?.active)
      return NextResponse.json({error:"Esta ação está disponível apenas para coordenadoras ativas."},{status:403});

    // Marca troca obrigatória para a coordenadora selecionada. Nenhuma conta
    // não selecionada é modificada. A senha será rotacionada pelo RPC admin.
    const result=await fetch(`${DB}/rest/v1/commercial_password_activation?on_conflict=user_id&select=user_id,must_change_password`,{
      method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=representation"},
      body:JSON.stringify({user_id:body.userId,must_change_password:true,completed_at:null}),
      cache:"no-store"
    });
    if(!result.ok) return NextResponse.json({error:"Não foi possível ativar a troca obrigatória. Confira o SQL de ativação."},{status:503});
    const rows=await result.json() as {user_id:string;must_change_password:boolean}[];
    if(rows[0]?.user_id!==body.userId || rows[0]?.must_change_password!==true)
      return NextResponse.json({error:"O banco não confirmou a ativação."},{status:503});
    return NextResponse.json({ok:true});
  } catch {
    return NextResponse.json({error:"Falha ao preparar a ativação da coordenadora."},{status:503});
  }
}
