import { normalizeApiOrigin } from "./api-origin";
import { normalizeGameServerEndpoint } from "./game-server-origin";

export function createWebSecurityHeaders(
  rawApiOrigin: string,
  rawGameServerEndpoint: string,
  development = false,
  nonce?: string
) {
  const apiOrigin = normalizeApiOrigin(rawApiOrigin);
  const gameServerEndpoint = normalizeGameServerEndpoint(rawGameServerEndpoint);
  const gameServerMatchmakingOrigin = gameServerEndpoint.replace(
    /^ws(s?):/,
    "http$1:"
  );
  const contentSecurityPolicy = [
    "default-src 'self'",
    development
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com"
      : `script-src 'self' 'nonce-${
          nonce ?? "missing"
        }' 'strict-dynamic' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "child-src 'none'",
    "frame-src https://challenges.cloudflare.com",
    `connect-src 'self' ${apiOrigin} ${gameServerMatchmakingOrigin} ${gameServerEndpoint}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];
}
