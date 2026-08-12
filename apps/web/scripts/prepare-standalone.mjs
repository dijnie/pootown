import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const applicationRoot = process.cwd();
const standaloneApplication = resolve(applicationRoot, ".next/standalone/apps/web");
const standaloneStatic = resolve(standaloneApplication, ".next/static");
const standalonePublic = resolve(standaloneApplication, "public");

rmSync(standaloneStatic, { force: true, recursive: true });
rmSync(standalonePublic, { force: true, recursive: true });
mkdirSync(resolve(standaloneApplication, ".next"), { recursive: true });
cpSync(resolve(applicationRoot, ".next/static"), standaloneStatic, { recursive: true });
cpSync(resolve(applicationRoot, "public"), standalonePublic, { recursive: true });
