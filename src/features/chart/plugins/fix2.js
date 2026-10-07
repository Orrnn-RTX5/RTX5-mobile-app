const fs = require('fs');
const file = 'c:\\\\Users\\\\ADMIN\\\\RTX-5Mobile-App\\\\rtx5-app\\\\src\\\\features\\\\chart\\\\plugins\\\\drawingToolsBundleString.ts';
let content = fs.readFileSync(file, 'utf-8');
let code = content.replace(/^export const DRAWING_TOOLS_JS = `/, '');
code = code.replace(/`;\\n?$/, '');
code = code.replace(/\\\\;$/, '');
const safeString = JSON.stringify(code);
const newFile = `export const DRAWING_TOOLS_JS = ${safeString};\\n`;
fs.writeFileSync(file, newFile);
