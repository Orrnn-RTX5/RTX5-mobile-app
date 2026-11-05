const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { dirname, join, relative } = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = process.cwd();
const TEST_ROOTS = ['src', 'tests'];
const BATCH_SIZE = 24;

const collectTests = (directory, output) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTests(absolutePath, output);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      output.push(relative(PROJECT_ROOT, absolutePath));
    }
  }
};

const testFiles = [];
for (const root of TEST_ROOTS) {
  collectTests(join(PROJECT_ROOT, root), testFiles);
}
testFiles.sort();

if (testFiles.length === 0) {
  console.error('No TypeScript tests were found.');
  process.exit(1);
}

const repositoryRoot = dirname(PROJECT_ROOT);
const toolchain = JSON.parse(
  readFileSync(join(repositoryRoot, 'WORKSPACE_TOOLCHAIN.json'), 'utf8'),
);
const toolRoot = join(repositoryRoot, toolchain.jsToolchainDirectory);
const toolPackagePath = join(toolRoot, 'node_modules', 'tsx', 'package.json');
if (!existsSync(toolPackagePath)) {
  console.error('The locked RTX5 JavaScript tools are missing. Run SETUP_NEW_WINDOWS_MACHINE.ps1.');
  process.exit(1);
}
const installedTsxVersion = JSON.parse(readFileSync(toolPackagePath, 'utf8')).version;
if (installedTsxVersion !== toolchain.tsx) {
  console.error('The installed tsx version differs from WORKSPACE_TOOLCHAIN.json.');
  process.exit(1);
}

let tsxCliPath = '';
try {
  tsxCliPath = require.resolve('tsx/cli', { paths: [toolRoot] });
} catch {
  console.error('The pinned tsx test runner is missing. Run npm ci.');
  process.exit(1);
}
let failed = false;

for (let start = 0; start < testFiles.length; start += BATCH_SIZE) {
  const batch = testFiles.slice(start, start + BATCH_SIZE);
  const batchNumber = Math.floor(start / BATCH_SIZE) + 1;
  const batchCount = Math.ceil(testFiles.length / BATCH_SIZE);
  console.log(`Running test batch ${batchNumber}/${batchCount} (${batch.length} files)`);

  const result = spawnSync(
    process.execPath,
    [tsxCliPath, '--test', ...batch],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    },
  );

  if (result.error) {
    console.error(`Test batch ${batchNumber} could not start:`, result.error.message);
    failed = true;
    continue;
  }
  if (result.status !== 0) {
    if (result.stdout) {
      const failureSummary = result.stdout
        .split(/\r?\n/)
        .filter((line) => line.startsWith('✖ ') || line.startsWith('test at '));
      console.error(`Test batch ${batchNumber}/${batchCount} failed:`);
      console.error(failureSummary.length > 0 ? failureSummary.join('\n') : result.stdout);
    }
    if (result.stderr) process.stderr.write(result.stderr);
    failed = true;
  } else {
    console.log(`Test batch ${batchNumber}/${batchCount} passed.`);
  }
}

if (failed) {
  console.error('One or more test batches failed.');
  process.exit(1);
}

console.log(`All ${testFiles.length} test files passed.`);
