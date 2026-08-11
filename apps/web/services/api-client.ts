import { z } from "zod";

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export type ApiClientOptions = {
  baseUrl: string; 
  defaultHeaders?: Record<string, string>;
  defaultInit?: RequestInit;
};

export function buildQuery(params: Record<string, unknown> = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    qs.set(key, String(value));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function createApiClient(options: ApiClientOptions) {
  const { baseUrl, defaultHeaders = { "Content-Type": "application/json" }, defaultInit = {} } = options;

  async function request<TSchema extends z.ZodTypeAny>(
    path: string,
    params: Record<string, unknown> | undefined,
    schema?: TSchema,
    init?: RequestInit
  ): Promise<z.infer<TSchema>> {
    const qs = params ? buildQuery(params) : "";
    const url = `${baseUrl}${path}${qs}`;

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: defaultHeaders,
      ...defaultInit,
      ...init,
    });

    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      throw new ApiError(`Request failed: ${res.status}`, res.status, body);
    }

    const json = await res.json();

    if (!schema) {
      return json as z.infer<TSchema>;
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      console.error(parsed.error.issues);
      throw new Error("Invalid response shape");
    }

    return parsed.data;
  }

  return {
    get: request,
  };
}