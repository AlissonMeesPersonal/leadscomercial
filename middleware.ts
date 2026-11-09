import { NextRequest, NextResponse } from "next/server";
import { getSession } from "./lib/auth";

export async function middleware(request: NextRequest) {
  const session = await getSession(request.cookies.get("lead_session")?.value);
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  const path = request.nextUrl.pathname;
  if (session.role === "coordinator" &&
      path !== "/dashboard/coordenacao" &&
      !path.startsWith("/dashboard/coordenacao/")) {
    return NextResponse.redirect(new URL("/dashboard/coordenacao", request.url));
  }
  if (session.role !== "coordinator" && session.role !== "admin" &&
      path.startsWith("/dashboard/coordenacao")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"]
};
