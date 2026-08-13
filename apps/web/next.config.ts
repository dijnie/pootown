import type { NextConfig } from "next";

import { normalizeApiOrigin } from "./services/api-origin";

type SvgFileRule = {
  exclude?: RegExp;
  issuer?: unknown;
  resourceQuery: { not: unknown[] };
  test: RegExp;
};

function isSvgFileRule(rule: unknown): rule is SvgFileRule {
  if (typeof rule !== "object" || rule === null) return false;
  const candidate = rule as Partial<SvgFileRule>;
  return (
    candidate.test instanceof RegExp &&
    typeof candidate.resourceQuery === "object" &&
    candidate.resourceQuery !== null &&
    Array.isArray(candidate.resourceQuery.not)
  );
}

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  webpack(config) {
    // Pure adapters are also compiled as Node ESM tests, so their relative
    // imports use the emitted .js extension. Resolve those imports to TS source
    // when the same modules are bundled by Next.js.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };

    // Grab the existing rule that handles SVG imports
    const fileLoaderRule = config.module.rules.find(isSvgFileRule);
    if (fileLoaderRule === undefined)
      throw new Error("Next.js SVG file-loader rule was not found");

    config.module.rules.push(
      // Reapply the existing rule, but only for svg imports ending in ?url
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/, // *.svg?url
      },
      // Convert all other *.svg imports to React components
      {
        test: /\.svg$/i,
        issuer: fileLoaderRule.issuer,
        resourceQuery: { not: [...fileLoaderRule.resourceQuery.not, /url/] }, // exclude if *.svg?url
        use: ["@svgr/webpack"],
      }
    );

    // Modify the file loader rule to ignore *.svg, since we have it handled now.
    fileLoaderRule.exclude = /\.svg$/i;

    return config;
  },
  async rewrites() {
    const origin = normalizeApiOrigin(
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"
    );
    return [
      {
        source: "/api/v1/leaderboard/:path*",
        destination: `${origin}/v1/leaderboard/:path*`,
      },
    ];
  },
};

export default nextConfig;
