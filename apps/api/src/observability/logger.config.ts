import type { Params } from "nestjs-pino";
import type { LoggerOptions } from "pino";

const sensitiveFieldNames = ["token", "ticket", "ticketHash", "checkpointChecksum"] as const;
const nestedSensitivePaths = sensitiveFieldNames.flatMap((field) => [
  field,
  `*.${field}`,
  `*.*.${field}`,
  `*.*.*.${field}`,
  `*.*.*.*.${field}`,
]);

export const redactedLogPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
  "req.query.token",
  "req.query.ticket",
  ...nestedSensitivePaths,
];

export function redactRequestUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const url = new URL(value, "http://pootown.invalid");
  for (const key of [...url.searchParams.keys()]) {
    if (/(authorization|token|ticket|secret|private|checksum)/i.test(key)) {
      url.searchParams.set(key, "[REDACTED]");
    }
  }
  return `${url.pathname}${url.search}`;
}

export const pinoHttpOptions: LoggerOptions = {
    redact: {
      paths: [...redactedLogPaths],
      censor: "[REDACTED]",
    },
    serializers: {
      req: (request: { id?: string; method?: string; url?: string }) => ({
        id: request.id,
        method: request.method,
        url: redactRequestUrl(request.url),
      }),
    },
};

export const loggerConfig: Params = {
  pinoHttp: pinoHttpOptions,
};
