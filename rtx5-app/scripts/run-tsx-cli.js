#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const toolchain = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "WORKSPACE_TOOLCHAIN.json"), "utf8"),
);
const toolRoot = path.join(repositoryRoot, toolchain.jsToolchainDirectory);
const toolPackagePath = path.join(toolRoot, "node_modules", "tsx", "package.json");

if (!fs.existsSync(toolPackagePath)) {
  console.error("The locked RTX5 JavaScript tools are missing. Run SETUP_NEW_WINDOWS_MACHINE.ps1.");
  process.exit(1);
}

const installedVersion = JSON.parse(fs.readFileSync(toolPackagePath, "utf8")).version;
if (installedVersion !== toolchain.tsx) {
  console.error("The installed tsx version differs from WORKSPACE_TOOLCHAIN.json. Run the setup script.");
  process.exit(1);
}

const tsxCliPath = require.resolve("tsx/cli", { paths: [toolRoot] });
const result = spawnSync(process.execPath, [tsxCliPath, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
