import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

export function proxy(request: NextRequest) {
  // Narrow public website allowlist; CRM/API authentication stays unchanged.
  if (["/showroom", "/brand/mariposa-logo.png", "/brand/hero/approved-studio.png", "/api/showroom/catalog", "/api/showroom/selection", "/api/showroom/assistant", "/api/showroom/inquiries"].includes(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname === "/login" || request.nextUrl.pathname.startsWith("/invite/")) {
    return NextResponse.next();
  }

  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    if (request.nextUrl.pathname.startsWith("/api/v1/")) return NextResponse.json({error:{code:"UNAUTHORIZED"}},{status:401,headers:{"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff"}});
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
