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

describe("game-core dependency boundary", () => {
  it("contains no framework, persistence, network, wallet, or chain imports", () => {
    const sourceDirectory = join(process.cwd(), "src");
    const forbidden = /(?:@nestjs|colyseus|typeorm|prisma|postgres|\bpg\b|solana|anchor|wallet|node:|https?:|websocket)/i;

    for (const file of sourceFiles(sourceDirectory)) {
      const source = readFileSync(file, "utf8");
      const imports = [...source.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g)].map(
        (match) => match[2] ?? "",
      );
      assert.deepEqual(
        imports.filter((specifier) => forbidden.test(specifier)),
        [],
        `${file} crosses the pure-core dependency boundary`,
      );
    }
  });

  it("declares no runtime dependencies", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    assert.deepEqual(manifest.dependencies ?? {}, {});
  });
});
