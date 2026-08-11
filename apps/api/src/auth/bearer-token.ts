export function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  return match?.[1] ?? null;
}
