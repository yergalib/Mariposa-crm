import {telegramIngressDecision} from '@/lib/assistant/telegram/ingress';
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

import marketingPhotos from "@/lib/showroom/marketing-photos.json";
const marketingPhotoPaths = new Set(marketingPhotos.photos.flatMap(photo => photo.assets.map(asset => asset.src)));

export function proxy(request: NextRequest) {
  const ingress=telegramIngressDecision(request);
  if(ingress==='deny')return new NextResponse(null,{status:404,headers:{'Cache-Control':'private, no-store'}});
  if(ingress==='webhook')return NextResponse.next();
  // Preserve previous matcher exclusions on ordinary hosts only.
  if(/^\/(?:_next\/(?:static|image)|favicon\.ico)/.test(request.nextUrl.pathname))return NextResponse.next();
  // Narrow public website allowlist; CRM/API authentication stays unchanged.
  if (marketingPhotoPaths.has(request.nextUrl.pathname) || ["/showroom", "/brand/mariposa-logo.png", "/brand/hero/approved-studio.png", "/brand/hero/pastel-pair-desktop.webp", "/brand/hero/pastel-pair-mobile.webp", "/brand/hero/white-dress-desktop.webp", "/brand/hero/white-dress-mobile.webp", "/brand/hero/black-dress-desktop.webp", "/brand/hero/black-dress-mobile.webp", "/api/showroom/photo", "/api/showroom/catalog", "/api/showroom/selection", "/api/showroom/assistant", "/api/showroom/inquiries", "/api/showroom/history"].includes(request.nextUrl.pathname)) {
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
  matcher: ["/:path*"]
};
