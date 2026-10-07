#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const CHANNELS = new Set(["preview", "staging", "production"]);
const channelArg = process.argv[2];
const channel = channelArg === "prod" ? "production" : channelArg;

if (!CHANNELS.has(channel)) {
  console.error("Usage: node ./scripts/eas-update.js <preview|staging|production> [eas update flags]");
  process.exit(1);
}

const updateArgs = ["update", "--channel", channel, "--environment", channel, "--platform", "all"];

const extraArgs = process.argv.slice(3);
const protectedFlags = [
  "--branch",
  "--channel",
  "--environment",
  "--platform",
  "--runtime-version",
];
const protectedOverride = extraArgs.find((arg) =>
  protectedFlags.some((flag) => arg === flag || arg.startsWith(`${flag}=`)),
);
if (protectedOverride) {
  console.error(
    `Refusing protected OTA override ${protectedOverride}. The selected script owns channel, environment, platform, and runtime policy.`,
  );
  process.exit(2);
}

updateArgs.push(...extraArgs);
const env = {
  ...process.env,
  CI: process.env.CI || "1",
};

const runNodeScript = (scriptPath, scriptArgs = []) => {
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
};

const otaScriptsDir = path.join(__dirname, "ota");
runNodeScript(path.join(otaScriptsDir, "check-eas-env.js"), [channel]);
runNodeScript(path.join(otaScriptsDir, "print-update-context.js"), ["--channel", channel]);

if (channel === "production" || process.env.RTX5_OTA_BASE_REF) {
  runNodeScript(path.join(otaScriptsDir, "check-ota-safety.js"));
} else {
  console.warn(
    "[OTA safety] Skipped native-change comparison for non-production update because RTX5_OTA_BASE_REF is not set.",
  );
}

const easWrapper = path.join(__dirname, "run-eas-cli.js");
const result = spawnSync(process.execPath, [easWrapper, ...updateArgs], {
  env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
