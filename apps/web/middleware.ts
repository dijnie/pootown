import { NextResponse, type NextRequest } from "next/server";

import { createWebSecurityHeaders } from "./services/security-headers";

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const securityHeaders = createWebSecurityHeaders(
    process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:8080",
    process.env["NEXT_PUBLIC_GAME_SERVER_URL"] ?? "ws://localhost:2567",
    process.env["NODE_ENV"] === "development",
    nonce
  );
  const requestHeaders = new Headers(request.headers);
  const contentSecurityPolicy = securityHeaders.find(
    (header) => header.key === "Content-Security-Policy"
  )?.value;
  if (contentSecurityPolicy === undefined) {
    throw new Error("Content security policy is unavailable");
  }
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const header of securityHeaders) {
    response.headers.set(header.key, header.value);
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
