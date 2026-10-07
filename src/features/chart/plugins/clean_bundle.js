const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'drawingToolsBundleString.ts');
const rawContent = fs.readFileSync(srcFile, 'utf8');

// Match the string content inside the export const DRAWING_TOOLS_JS = ...
let startIdx = rawContent.indexOf('"use strict";');
if (startIdx === -1) startIdx = rawContent.indexOf('`"use strict";') + 1;
if (startIdx <= 0) {
  console.log("Could not find start");
  process.exit();
}
let endIdx = rawContent.lastIndexOf(';');
if (rawContent.substring(endIdx - 1, endIdx) === '\\') { // skip \; if it's there
  endIdx = rawContent.lastIndexOf(';', endIdx - 2);
}

// Extract only from "use strict" to the last correct semicolon of the bundle
let jsBundle = rawContent.substring(startIdx, endIdx + 1);
// remove any weird trailing characters
jsBundle = jsBundle.replace(/\\[^A-Za-z0-9_]*$/, '');
jsBundle = jsBundle.replace(/\\\\;/g, '');
jsBundle = jsBundle.replace(/\\;/g, '');
jsBundle = jsBundle.replace(/`\\n?$/, '');
jsBundle = jsBundle.replace(/"$/, '');

// Write it cleanly using stringify
fs.writeFileSync(srcFile, `export const DRAWING_TOOLS_JS = ${JSON.stringify(jsBundle)};\n`, 'utf8');
console.log("Fixed!");
