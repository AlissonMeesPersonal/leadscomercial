import { NextRequest, NextResponse } from "next/server";
import { getSession } from "./lib/auth";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Login and logout must continue working without an active session.
  if (path === "/api/login" || path === "/api/logout" ||
      path === "/api/activate-password") return NextResponse.next();
  const session = await getSession(request.cookies.get("lead_session")?.value);
  const isApi = path.startsWith("/api/");
  if (!session) {
    if (isApi) return NextResponse.next();
  if (path.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL(
      session.role === "coordinator" ? "/dashboard/coordenacao" : "/dashboard", request.url
    ));
  }
    return NextResponse.redirect(new URL("/login",request.url));
  }
  if (session.needsPasswordChange) {
    if (path === "/ativar-senha") return NextResponse.next();
    if (isApi) return NextResponse.json({error:"Defina sua senha antes de acessar o sistema."},{status:403});
    return NextResponse.redirect(new URL("/ativar-senha",request.url));
  }
  if (path === "/ativar-senha") {
    return NextResponse.redirect(new URL(
      session.role === "coordinator" ? "/dashboard/coordenacao" : "/dashboard",request.url
    ));
  }
  if (isApi) return NextResponse.next();
  if (session.role !== "coordinator" && session.role !== "admin" &&
      path.startsWith("/dashboard/coordenacao")) {
    return NextResponse.redirect(new URL("/dashboard",request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*","/admin/:path*","/ativar-senha","/api/:path*"]
};
