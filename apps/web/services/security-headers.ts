import { normalizeApiOrigin } from "./api-origin";
import { normalizeGameServerEndpoint } from "./game-server-origin";

export function createWebSecurityHeaders(rawApiOrigin: string, rawGameServerEndpoint: string) {
  const apiOrigin = normalizeApiOrigin(rawApiOrigin);
  const gameServerEndpoint = normalizeGameServerEndpoint(rawGameServerEndpoint);
  const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "child-src https://auth.privy.io",
    "frame-src https://auth.privy.io https://challenges.cloudflare.com",
    `connect-src 'self' https://auth.privy.io ${apiOrigin} ${gameServerEndpoint}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}
