#!/usr/bin/env node
// Sync the actual local application into a reviewed native-baseline worktree.
// Never publish a stale worktree after changing only its version label.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = path.resolve(__dirname, '../..');
const repository = path.dirname(source);
const args = process.argv.slice(2);
const arg = name => args[args.indexOf(name) + 1];
if (!args.includes('--destination') || !args.includes('--evidence')) throw new Error('Required: --destination <baseline app directory> --evidence <report path>');
const destination = fs.realpathSync(path.resolve(arg('--destination')));
const evidence = path.resolve(arg('--evidence'));
const taskRoot = path.join(repository, '.codex-tmp') + path.sep;
if (!destination.startsWith(taskRoot) || path.basename(destination) !== 'rtx5-app' || destination === source || !evidence.startsWith(taskRoot)) throw new Error('Destination and evidence must be within this repository .codex-tmp');
if (!fs.existsSync(path.join(destination, '.git')) && !fs.existsSync(path.join(path.dirname(destination), '.git'))) throw new Error('Destination must be an existing isolated worktree');
const nativeAssets = new Set(['adaptive-icon.png', 'android-icon.png', 'android-adaptive-foreground.png', 'icon.png', 'splash-icon.png']);
const optionalPackages = new Set(['expo-clipboard', 'expo-document-picker', 'expo-image-picker', 'expo-file-system', 'expo-image-manipulator', 'expo-sensors']);
const shim = path.join(destination, 'src/features/settings/nativeFeaturesUnavailable.ts');
const hash = contents => crypto.createHash('sha256').update(contents).digest('hex');
const inventory = [];
const adaptations = [];
function files(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? files(absolute) : entry.isFile() ? [absolute] : [];
  });
}
for (const folder of ['app', 'src', 'tests', 'scripts', 'assets']) {
  const origin = path.join(source, folder);
  const target = path.join(destination, folder);
  const included = new Set();
  for (const file of files(origin)) {
    const relative = path.relative(origin, file);
    included.add(relative);
    if (folder === 'assets' && nativeAssets.has(relative)) continue;
    const output = path.join(target, relative);
    const original = fs.readFileSync(file);
    let contents = original;
    const imports = [];
    if ((folder === 'src' || folder === 'app') && /\.tsx?$/.test(file)) {
      const code = original.toString('utf8');
      const transformed = code.replace(/(import|require)\('(expo-[a-z-]+)'\)/g, (match, loader, packageName) => {
        if (!optionalPackages.has(packageName)) return match;
        imports.push(packageName);
        let shimImport = path.relative(path.dirname(output), shim).replace(/\\/g, '/').replace(/\.ts$/, '');
        if (!shimImport.startsWith('.')) shimImport = './' + shimImport;
        return `${loader}('${shimImport}')`;
      });
      if (imports.length) {
        contents = Buffer.from(transformed);
        adaptations.push({ path: path.relative(destination, output).replace(/\\/g, '/'), packages: imports, reason: 'Optional native capabilities absent from legacy installed binaries; text-only reporting and other local application features remain active.' });
      }
      const runtimeImports = transformed.replace(/^import type [^\r\n]*$/gm, '');
      if (/from ['"]expo-(clipboard|document-picker|image-picker|file-system|image-manipulator|localization|sensors)['"]/.test(runtimeImports)) throw new Error(`Unguarded optional native import: ${file}`);
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, contents);
    inventory.push({ path: path.relative(destination, output).replace(/\\/g, '/'), localSHA256: hash(original), releaseSHA256: hash(contents) });
  }
  for (const file of files(target)) {
    const relative = path.relative(target, file);
    if (included.has(relative) || (folder === 'assets' && nativeAssets.has(relative))) continue;
    if (!file.startsWith(destination + path.sep)) throw new Error('Source deletion escaped the release app');
    fs.unlinkSync(file);
  }
}
for (const file of ['.env', '.env.example', 'tsconfig.json']) {
  if (fs.existsSync(path.join(source, file))) fs.copyFileSync(path.join(source, file), path.join(destination, file));
}
const report = { source, destination, generatedAt: new Date().toISOString(), nativeAssetsRetained: [...nativeAssets], adaptations, inventory };
fs.mkdirSync(path.dirname(evidence), { recursive: true });
fs.writeFileSync(evidence, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ copiedFiles: inventory.length, identicalFiles: inventory.filter(file => file.localSHA256 === file.releaseSHA256).length, adaptedFiles: adaptations.map(item => item.path), report: evidence }));
