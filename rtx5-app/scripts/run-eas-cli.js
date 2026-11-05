#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const toolchainPath = path.resolve(__dirname, "..", "..", "WORKSPACE_TOOLCHAIN.json");
const toolchain = JSON.parse(fs.readFileSync(toolchainPath, "utf8"));
const repositoryRoot = path.dirname(toolchainPath);
const toolRoot = path.join(repositoryRoot, toolchain.jsToolchainDirectory);
const easPackagePath = path.join(toolRoot, "node_modules", "eas-cli", "package.json");
const easArgs = process.argv.slice(2);

if (easArgs.length === 0) {
  console.error("Usage: node ./scripts/run-eas-cli.js <eas command and arguments>");
  process.exit(1);
}

if (!fs.existsSync(easPackagePath)) {
  console.error("The locked RTX5 JavaScript tools are missing. Run SETUP_NEW_WINDOWS_MACHINE.ps1.");
  process.exit(1);
}

const installedVersion = JSON.parse(fs.readFileSync(easPackagePath, "utf8")).version;
if (installedVersion !== toolchain.easCli) {
  console.error("The installed EAS CLI differs from WORKSPACE_TOOLCHAIN.json. Run the setup script.");
  process.exit(1);
}

const easCliPath = require.resolve("eas-cli/bin/run", { paths: [toolRoot] });
const result = spawnSync(process.execPath, [easCliPath, ...easArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
