interface RateLimitRequest {
  readonly ip?: unknown;
  readonly principal?: { readonly userId?: unknown };
  readonly internalPrincipal?: { readonly serviceId?: unknown };
}

function boundedIdentity(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 128 ? value : null;
}

export function rateLimitTracker(request: RateLimitRequest): string {
  const userId = boundedIdentity(request.principal?.userId);
  if (userId !== null) return `user:${userId}`;
  const serviceId = boundedIdentity(request.internalPrincipal?.serviceId);
  if (serviceId !== null) return `service:${serviceId}`;
  const ip = boundedIdentity(request.ip);
  return `ip:${ip ?? "unknown"}`;
}
