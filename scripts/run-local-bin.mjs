#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [binName, ...args] = process.argv.slice(2);

if (!binName) {
  console.error("Usage: node scripts/run-local-bin.mjs <bin> [...args]");
  process.exit(1);
}

const binDir = path.join(rootDir, "node_modules", ".bin");
const binPath = path.join(binDir, process.platform === "win32" ? `${binName}.cmd` : binName);

if (!existsSync(binPath)) {
  const install = spawnSync("pnpm", ["install", "--frozen-lockfile"], {
    cwd: rootDir,
    env: { ...process.env, HUSKY: "0" },
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (install.error) {
    console.error(install.error.message);
    process.exit(1);
  }

  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }
}

const run = spawnSync(binPath, args, {
  cwd: rootDir,
  env: {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (run.error) {
  console.error(run.error.message);
  process.exit(1);
}

process.exit(run.status ?? 1);
