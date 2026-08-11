export function normalizeGameServerEndpoint(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Game server endpoint must be a WebSocket URL");
  }
  if ((parsed.protocol !== "ws:" && parsed.protocol !== "wss:") ||
      parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") {
    throw new Error("Game server endpoint must not contain credentials, query, or fragment");
  }
  return parsed.toString().replace(/\/$/, "");
}
