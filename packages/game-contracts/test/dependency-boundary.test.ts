import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("game-contracts dependency boundary", () => {
  it("contains no application framework, persistence, wallet, or chain imports", () => {
    const forbidden = /(?:@nestjs|colyseus|typeorm|prisma|postgres|\bpg\b|solana|anchor|wallet|node:|https?:|websocket)/i;
    for (const file of sourceFiles(join(process.cwd(), "src"))) {
      const source = readFileSync(file, "utf8");
      const imports = [...source.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g)].map(
        (match) => match[2] ?? "",
      );
      assert.deepEqual(
        imports.filter((specifier) => forbidden.test(specifier)),
        [],
        `${file} crosses the transport-contract dependency boundary`,
      );
    }
  });

  it("declares Zod as its only runtime dependency", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ["zod"]);
  });
});
