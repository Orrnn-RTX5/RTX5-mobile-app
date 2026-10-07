import fs from 'fs/promises';
import path from 'path';

const srcDir = path.join(process.cwd(), 'src');

// Recursive function to get all ts/tsx files
async function getAllFiles(dir, fileList = []) {
  const files = await fs.readdir(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      await getAllFiles(filePath, fileList);
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

// Generates contextual documentation based on the specific path structure
function generateDoc(relativePath) {
  const parts = relativePath.split(path.sep);
  const filename = parts[parts.length - 1];
  
  let description = `Core module: ${filename}`;
  
  if (parts.includes('api') && !parts.includes('ws')) {
    description = `REST HTTP API wrapper and DTO definitions for the ${filename.replace('.ts', '')} service.`;
  } else if (parts.includes('features') && parts.includes('chart') && parts.includes('plugins')) {
    description = `TradingView lightweight-charts plugin implementation: ${filename.replace('.ts', '')}.`;
  } else if (parts.includes('features')) {
    const index = parts.indexOf('features');
    const featureName = parts[index + 1] || 'UI';
    description = `UI routing screen and layout components for the ${featureName} feature: ${filename.replace('.tsx', '')}.`;
  } else if (parts.includes('components')) {
    description = `Reusable React Native UI component: ${filename.replace('.tsx', '')}.`;
  } else if (parts.includes('theme')) {
    description = `Global theming utility and design-system configuration: ${filename.replace('.ts', '')}.`;
  } else if (parts.includes('hooks')) {
    description = `Custom React hook for shared application logic: ${filename.replace('.ts', '')}.`;
  }

  return `/**\n * ${description}\n */\n`;
}

async function run() {
  const files = await getAllFiles(srcDir);
  let processed = 0;
  
  for (const file of files) {
    let content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');
    
    // Scan for the first meaningful line
    let firstLineIndex = 0;
    while (firstLineIndex < lines.length && (lines[firstLineIndex].trim() === '' || lines[firstLineIndex].trim() === '"use strict";')) {
      firstLineIndex++;
    }
    
    if (firstLineIndex >= lines.length) continue; // Skip entirely empty files
    
    const firstLine = lines[firstLineIndex].trim();
    
    // If it starts with /* or // we assume it's already documented
    if (firstLine.startsWith('/*') || firstLine.startsWith('//')) {
      continue;
    }
    
    const relativePath = path.relative(srcDir, file);
    const docBlock = generateDoc(relativePath);
    
    // Inject the generated doc block safely above the imports
    lines.splice(firstLineIndex, 0, docBlock.trimEnd(), '');
    await fs.writeFile(file, lines.join('\n'), 'utf8');
    console.log(`Documented: ${relativePath}`);
    processed++;
  }
  
  console.log(`\nSuccessfully injected perfect module comments into ${processed} files.`);
}

run().catch(console.error);
