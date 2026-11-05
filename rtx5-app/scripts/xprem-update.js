#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const envFilePath = path.join(projectRoot, '.env');

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const parsed = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
};

const dotenvValues = parseEnvFile(envFilePath);
const env = {
  ...dotenvValues,
  ...process.env,
};

env.EXPO_PUBLIC_APP_ENV = env.EXPO_PUBLIC_APP_ENV || 'production';
env.EOO_TOKEN = env.EOO_TOKEN || env.RX5_TOKEN || '';
env.RELEASE_CHANNEL = env.RELEASE_CHANNEL || env.XPREM_CHANNEL || 'yoforex-rtx5';
env.XPREM_APP_ID = env.XPREM_APP_ID || 'b83d7191-d5ac-4b58-b850-8979759fe290';
env.XPREM_MANIFEST_URL = env.XPREM_MANIFEST_URL || 'https://otadeploy.yopips.com/manifest';

if (!env.EOO_TOKEN) {
  console.error('[XPrem OTA] Missing EOO_TOKEN / RX5_TOKEN in .env or environment.');
  process.exit(1);
}

const args = process.argv.slice(2);
const getFlagValue = (flags) => {
  for (let i = 0; i < args.length; i += 1) {
    for (const flag of flags) {
      if (args[i] === flag && i + 1 < args.length) return args[i + 1];
      if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
    }
  }
  return null;
};
const hasFlag = (flag) => args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));

const branch = getFlagValue(['--branch']) || env.XPREM_BRANCH || 'rtx5-production';
const platformArg = (getFlagValue(['--platform']) || 'all').toLowerCase();
const outputDir = getFlagValue(['--outputDir', '--output-dir']) || 'dist';
const customRuntimeVersion = getFlagValue(['--runtime-version', '--runtimeVersion']);
const skipBundler = hasFlag('--skip-bundler');
const uploadConcurrency = Math.max(1, Number(getFlagValue(['--upload-rate']) || 6));

const manifestUrl = env.XPREM_MANIFEST_URL;
const serverUrl = manifestUrl.replace(/\/+$/, '').replace(/\/manifest$/, '');
const appId = env.XPREM_APP_ID;
const token = env.EOO_TOKEN;

const safeGit = (gitArgs) => {
  try {
    return execFileSync('git', gitArgs, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const commitHash = safeGit(['rev-parse', 'HEAD']) || 'unknown';
const message =
  getFlagValue(['-m', '--message']) ||
  safeGit(['log', '-1', '--pretty=%B']) ||
  'OTA update via XPrem';

const requestedPlatforms =
  platformArg === 'all' ? ['android', 'ios'] : [platformArg];

const KNOWN_ACTIVE_RUNTIME_VERSIONS = {
  android: [
    '797dea98b258410dcbd80a727586f6af607da932', // Build #37
    'cc903d8dc47e8df129812dd4608268e10335b862', // Build #36
    'a73d7c98409dfdde2b3c4a928e18104ff752c41b', // Build #35
    'dce371b08eed6964ed758cc37b7ec24c7b70dedb', // Build #33/#34
  ],
  ios: [
    '44d9c3b64f5b6fd221136b861e597bdbf62da208', // Build #36
    'aaa2ca37dba037ef63f009b328ab7ffc95c11534', // Build #35
    'e3b53daadb327e45d3b4aa2cfeffe86eefac0199', // Build #34
    'b5adacfda3f2f15f55a442781d49105b33727269', // Local iOS fingerprint
  ],
};

const resolveRuntimeVersion = (platform) => {
  if (customRuntimeVersion) return customRuntimeVersion;
  if (env.RTX5_FORCE_RUNTIME_VERSION) return env.RTX5_FORCE_RUNTIME_VERSION;
  const expoUpdatesCliPath = require.resolve('expo-updates/bin/cli.js', {
    paths: [projectRoot],
  });
  const output = execFileSync(
    process.execPath,
    [expoUpdatesCliPath, 'runtimeversion:resolve', '--platform', platform],
    {
      cwd: projectRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim();
  const parsed = JSON.parse(output);
  if (!parsed.runtimeVersion) {
    throw new Error(`Could not resolve runtimeVersion for ${platform}`);
  }
  return parsed.runtimeVersion;
};

const resolveTargetRuntimeVersions = (platform) => {
  const primary = resolveRuntimeVersion(platform);
  if (customRuntimeVersion || env.RTX5_FORCE_RUNTIME_VERSION) {
    return [primary];
  }
  const known = KNOWN_ACTIVE_RUNTIME_VERSIONS[platform] || [];
  return [...new Set([primary, ...known])];
};

const prewarmManifestAndBundle = async (platform, runtimeVersion) => {
  try {
    const t0 = Date.now();
    const res = await fetch(manifestUrl, {
      headers: {
        Accept: 'multipart/mixed,application/expo+json,application/json',
        'Expo-Platform': platform,
        'Expo-Runtime-Version': runtimeVersion,
        'Expo-Protocol-Version': '1',
        'Expo-API-Version': '1',
        'Expo-Updates-Environment': 'BARE',
        'expo-channel-name': env.RELEASE_CHANNEL,
        'expo-app-id': appId,
        'xprem-branch': '',
      },
    });
    const text = await res.text();
    const match = text.match(/\{"id":"[^"]+"[^\r\n]*/);
    if (!match) return;
    const manifest = JSON.parse(match[0]);
    const bundleUrl = manifest.launchAsset?.url;
    if (!bundleUrl) return;
    const assetRes = await fetch(bundleUrl, {
      headers: {
        'Accept-Encoding': 'zstd, br, gzip',
        'Expo-Platform': platform,
        'Expo-Runtime-Version': runtimeVersion,
        'Expo-Protocol-Version': '1',
        'expo-channel-name': env.RELEASE_CHANNEL,
        'expo-app-id': appId,
      },
    });
    const buf = await assetRes.arrayBuffer();
    console.log(
      `[XPrem OTA] 🔥 Pre-warmed ${platform} (${runtimeVersion.slice(0, 8)}…) launchAsset (${buf.byteLength} bytes, encoding=${assetRes.headers.get('content-encoding') || 'identity'}) in ${Date.now() - t0}ms`,
    );
  } catch (err) {
    console.warn(`[XPrem OTA] Pre-warm warning for ${platform} (${runtimeVersion}): ${err.message}`);
  }
};

const exportBundle = () => {
  const distAbs = path.join(projectRoot, outputDir);
  if (!skipBundler) {
    fs.rmSync(distAbs, { recursive: true, force: true });
    const expoCliPath = require.resolve('expo/bin/cli', { paths: [projectRoot] });
    const exportArgs = [
      expoCliPath,
      'export',
      '--output-dir',
      outputDir,
      ...requestedPlatforms.flatMap((p) => ['--platform', p]),
    ];
    console.log(`[XPrem OTA] Exporting bundles (${requestedPlatforms.join(', ')})...`);
    const expResult = spawnSync(process.execPath, exportArgs, {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
    });
    if ((expResult.status ?? 1) !== 0) {
      process.exit(expResult.status ?? 1);
    }
  }

  const expoCliPath = require.resolve('expo/bin/cli', { paths: [projectRoot] });
  const publicConfigJson = execFileSync(
    process.execPath,
    [expoCliPath, 'config', '--json', '--type', 'public'],
    {
      cwd: projectRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const publicConfig = JSON.parse(publicConfigJson);
  fs.writeFileSync(
    path.join(distAbs, 'expoConfig.json'),
    JSON.stringify(publicConfig, null, 2),
    'utf8',
  );

  // Normalize Windows backslashes in metadata.json so Linux XPrem server & manifest
  // routes resolve asset paths cleanly.
  const metadataPath = path.join(distAbs, 'metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  for (const plat of Object.keys(metadata.fileMetadata || {})) {
    const platMeta = metadata.fileMetadata[plat];
    if (!platMeta) continue;
    if (typeof platMeta.bundle === 'string') {
      platMeta.bundle = platMeta.bundle.replace(/\\/g, '/');
    }
    if (Array.isArray(platMeta.assets)) {
      platMeta.assets = platMeta.assets.map((asset) => ({
        ...asset,
        path: String(asset.path).replace(/\\/g, '/'),
      }));
    }
  }
  fs.writeFileSync(metadataPath, JSON.stringify(metadata), 'utf8');
  return metadata;
};

const collectPlatformFileNames = (metadata, platform) => {
  const seen = new Set(['metadata.json', 'expoConfig.json']);
  const platMeta = metadata.fileMetadata?.[platform];
  if (!platMeta) {
    throw new Error(`No fileMetadata found for platform "${platform}" in metadata.json`);
  }
  if (platMeta.bundle) {
    seen.add(platMeta.bundle.replace(/\\/g, '/'));
  }
  for (const asset of platMeta.assets || []) {
    seen.add(String(asset.path).replace(/\\/g, '/'));
  }
  return [...seen];
};

const uploadFileMultipart = async (uploadReq, distAbs) => {
  const localPath = path.join(distAbs, uploadReq.filePath);
  const fileBuffer = await fs.promises.readFile(localPath);
  const boundary = `----XPremFormBoundary${crypto.randomBytes(12).toString('hex')}`;
  const header = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${uploadReq.fileName}"; filename="${path.basename(localPath)}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
    'utf8',
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const bodyBuffer = Buffer.concat([header, fileBuffer, footer]);

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(uploadReq.requestUploadUrl, {
        method: 'PUT',
        headers: {
          ...(uploadReq.headers || {}),
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(bodyBuffer.length),
        },
        body: bodyBuffer,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Upload failed for ${uploadReq.filePath} (${fileBuffer.length} bytes, HTTP ${response.status}): ${errText}`,
        );
      }
      return;
    } catch (err) {
      const causeMsg = err?.cause ? ` (cause: ${err.cause.code || err.cause.message || err.cause})` : '';
      if (attempt === maxAttempts) {
        throw new Error(
          `Upload failed for ${uploadReq.filePath} (${fileBuffer.length} bytes) after ${maxAttempts} attempts: ${err.message}${causeMsg}`,
        );
      }
      console.warn(
        `[XPrem OTA] Retry ${attempt}/${maxAttempts} for ${uploadReq.filePath} (${fileBuffer.length} bytes): ${err.message}${causeMsg}`,
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
};

const runWithConcurrency = async (items, limit, worker) => {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  });
  await Promise.all(runners);
};

const main = async () => {
  console.log('[XPrem OTA] Starting publish:', {
    serverUrl,
    manifestUrl,
    appId,
    channel: env.RELEASE_CHANNEL,
    branch,
    platforms: requestedPlatforms,
  });

  const runtimeListByPlatform = {};
  for (const platform of requestedPlatforms) {
    console.log(`[XPrem OTA] Resolving runtime fingerprints for ${platform}...`);
    runtimeListByPlatform[platform] = resolveTargetRuntimeVersions(platform);
  }
  console.log('[XPrem OTA] Target runtime versions:', runtimeListByPlatform);

  const metadata = exportBundle();
  const distAbs = path.join(projectRoot, outputDir);
  const publishGroupId = crypto.randomUUID();
  const deployedSummary = [];

  for (const platform of requestedPlatforms) {
    const fileNames = collectPlatformFileNames(metadata, platform);
    for (const runtimeVersion of runtimeListByPlatform[platform]) {
      const reqUrl = new URL(`${serverUrl}/${appId}/requestUploadUrl/${branch}`);
      reqUrl.searchParams.set('runtimeVersion', runtimeVersion);
      reqUrl.searchParams.set('platform', platform);
      reqUrl.searchParams.set('commitHash', commitHash);
      reqUrl.searchParams.set('publishGroup', publishGroupId);

      console.log(
        `[XPrem OTA] Requesting upload URLs for ${platform} (runtime=${runtimeVersion}, files=${fileNames.length})...`,
      );

      const reqRes = await fetch(reqUrl.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileNames,
          message,
        }),
      });

      if (!reqRes.ok) {
        const errText = await reqRes.text();
        throw new Error(
          `requestUploadUrl failed for ${platform} (HTTP ${reqRes.status}): ${errText}`,
        );
      }

      const { updateId, uploadRequests } = await reqRes.json();
      console.log(
        `[XPrem OTA] Uploading ${uploadRequests.length} files for ${platform} (updateId=${updateId})...`,
      );

      await runWithConcurrency(uploadRequests, uploadConcurrency, async (item) => {
        await uploadFileMultipart(item, distAbs);
      });

      const markUrl = new URL(`${serverUrl}/${appId}/markUpdateAsUploaded/${branch}`);
      markUrl.searchParams.set('platform', platform);
      markUrl.searchParams.set('updateId', String(updateId));
      markUrl.searchParams.set('runtimeVersion', runtimeVersion);

      const markRes = await fetch(markUrl.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (markRes.status === 406) {
        console.log(`[XPrem OTA] ${platform} (${runtimeVersion}): identical to active update on branch ${branch} (HTTP 406).`);
        await prewarmManifestAndBundle(platform, runtimeVersion);
        deployedSummary.push({ platform, runtimeVersion, updateId: String(updateId), status: 'identical' });
        continue;
      }

      if (!markRes.ok) {
        const errText = await markRes.text();
        throw new Error(
          `markUpdateAsUploaded failed for ${platform} (HTTP ${markRes.status}): ${errText}`,
        );
      }

      console.log(`[XPrem OTA] ✅ ${platform} (${runtimeVersion}) update ${updateId} is LIVE on branch "${branch}"!`);
      await prewarmManifestAndBundle(platform, runtimeVersion);
      deployedSummary.push({
        platform,
        runtimeVersion,
        updateId: String(updateId),
        publishGroupId,
        status: 'deployed',
      });
    }
  }

  console.log('\n[XPrem OTA] Publish Summary:');
  console.log(JSON.stringify(deployedSummary, null, 2));
};

main().catch((err) => {
  console.error('[XPrem OTA] ❌ Error:', err.message || err);
  process.exit(1);
});
