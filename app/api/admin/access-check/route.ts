import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";

const DB = "https://efahamylmoueniflnvzl.supabase.co";

// Only reports role and session consistency, never elevates a user or exposes tokens.
export async function GET() {
  const session = await getSession((await cookies()).get("lead_session")?.value);
  if (!session) return NextResponse.json({authorized:false,reason:"login_required"},{status:401});
  if (session.role !== "admin")
    return NextResponse.json({authorized:false,reason:"session_not_admin"},{status:403});
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({authorized:false,reason:"service_not_configured"},{status:503});
  const params=new URLSearchParams({
    select:"id,username,role,active,deleted_at",
    id:`eq.${session.userId}`
  });
  const response=await fetch(`${DB}/rest/v1/commercial_users?${params}`,{
    headers:{apikey:key,Authorization:`Bearer ${key}`},cache:"no-store"
  });
  if (!response.ok) return NextResponse.json({authorized:false,reason:"database_unavailable"},{status:503});
  const accounts=await response.json() as {id:string;username:string;role:string;active:boolean;deleted_at:string|null}[];
  const account=accounts[0];
  const valid=account?.id===session.userId && account?.role==="admin" &&
    account?.active===true && !account.deleted_at &&
    account?.username.toLowerCase()===session.username.toLowerCase();
  if (!valid) return NextResponse.json({authorized:false,reason:"database_role_mismatch"},{status:403});
  return NextResponse.json({authorized:true,username:account.username},{headers:{"Cache-Control":"no-store"}});
}
