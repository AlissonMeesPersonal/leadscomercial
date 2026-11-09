import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession, getSession } from "../../../lib/auth";

const DB = "https://efahamylmoueniflnvzl.supabase.co";
const PUBLISHABLE = "sb_publishable_TD903F8atFHoM64JbiEEFA_qhnm_PhI";

type Login = { user_id:string; access_token:string };

export async function POST(request:Request) {
  const current = await getSession((await cookies()).get("lead_session")?.value);
  if (!current || !current.needsPasswordChange || current.userId === "setor-comercial")
    return NextResponse.json({error:"Esta conta não possui ativação pendente."},{status:403});
  const origin=request.headers.get("origin");
  if (origin && origin!==new URL(request.url).origin)
    return NextResponse.json({error:"Origem não permitida."},{status:403});
  let body:{password?:unknown;confirmation?:unknown;temporaryPassword?:unknown};
  try {body=await request.json();}catch {return NextResponse.json({error:"Dados inválidos."},{status:400});}
  const password=body.password;
  if (typeof password!=="string" || password.length!==8 ||
    !/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password) ||
    password!==body.confirmation || password===body.temporaryPassword)
    return NextResponse.json({error:"Use uma senha diferente da provisória, com exatamente 8 caracteres, letras maiúsculas, minúsculas e números; confirme-a corretamente."},{status:400});
  if (typeof body.temporaryPassword!=="string" || body.temporaryPassword.length<8)
    return NextResponse.json({error:"Informe sua senha provisória para confirmar a troca."},{status:400});
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({error:"Troca de senha indisponível no servidor."},{status:503});
  const privileged={apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"};
  // Confirma novamente o segredo provisório; sessão sozinha não basta.
  const initial=await fetch(`${DB}/rest/v1/rpc/commercial_user_login`,{
    method:"POST",headers:{apikey:PUBLISHABLE,"Content-Type":"application/json"},
    body:JSON.stringify({p_username:current.username,p_password:body.temporaryPassword}),cache:"no-store"
  });
  if (!initial.ok) return NextResponse.json({error:"Não foi possível confirmar a senha provisória."},{status:401});
  const initialRows=await initial.json() as Login[];
  if (!initialRows.length || initialRows[0].user_id!==current.userId)
    return NextResponse.json({error:"Senha provisória inválida."},{status:401});
  const check=await fetch(`${DB}/rest/v1/commercial_password_activation?user_id=eq.${encodeURIComponent(current.userId)}&must_change_password=eq.true&select=user_id`,{headers:privileged,cache:"no-store"});
  if (!check.ok || !(await check.json() as {user_id:string}[]).length)
    return NextResponse.json({error:"Ativação inexistente ou já concluída."},{status:409});
  // Usa a rotina de senha já presente no banco, preservando seu formato de hash.
  // Se a rotina exigir administrador, falha sem liberar o acesso; uma função
  // self-service deverá ser implementada no banco após revisão de seu código.
  const changed=await fetch(`${DB}/rest/v1/rpc/commercial_admin_reset_password`,{
    method:"POST",
    headers:{apikey:key,Authorization:`Bearer ${key}`,"x-client-info":initialRows[0].access_token,"Content-Type":"application/json"},
    body:JSON.stringify({p_user_id:current.userId,p_password:password}),cache:"no-store"
  });
  if (!changed.ok) return NextResponse.json({error:"O banco não permitiu a troca automática. A rotina de senha precisa ser habilitada para a própria conta, sem conceder permissões administrativas."},{status:503});
  // Confirma que o login normal agora reconhece a senha nova.
  const login=await fetch(`${DB}/rest/v1/rpc/commercial_user_login`,{
    method:"POST",headers:{apikey:PUBLISHABLE,"Content-Type":"application/json"},
    body:JSON.stringify({p_username:current.username,p_password:password}),cache:"no-store"
  });
  if (!login.ok) return NextResponse.json({error:"A senha ainda não foi reconhecida pelo banco. A ativação não foi liberada."},{status:503});
  const rows=await login.json() as Login[];
  if (!rows.length || rows[0].user_id!==current.userId || !rows[0].access_token)
    return NextResponse.json({error:"A nova senha não foi validada; a ativação permanece pendente."},{status:503});
  const updated=await fetch(`${DB}/rest/v1/commercial_password_activation?user_id=eq.${encodeURIComponent(current.userId)}&must_change_password=eq.true&select=user_id`,{
    method:"PATCH",headers:{...privileged,Prefer:"return=representation"},
    body:JSON.stringify({must_change_password:false,completed_at:new Date().toISOString()}),cache:"no-store"
  });
  if (!updated.ok || !(await updated.json() as {user_id:string}[]).length)
    return NextResponse.json({error:"Senha alterada, mas a ativação não foi finalizada. Contate o administrador."},{status:503});
  const refreshed=await createSession({...current,needsPasswordChange:false});
  const response=NextResponse.json({ok:true,accessToken:rows[0].access_token,role:current.role});
  response.cookies.set("lead_session",refreshed,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*12});
  return response;
}
