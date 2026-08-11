export function normalizeGameServerEndpoint(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Game server endpoint must be a WebSocket URL");
  }
  if ((parsed.protocol !== "ws:" && parsed.protocol !== "wss:") ||
      parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" ||
      parsed.search !== "" || parsed.hash !== "") {
    throw new Error("Game server endpoint must be a WebSocket origin without credentials, path, query, or fragment");
  }
  return parsed.origin;
}
