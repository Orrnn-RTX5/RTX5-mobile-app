const fs = require('fs');
const file = 'c:\\\\Users\\\\ADMIN\\\\RTX-5Mobile-App\\\\rtx5-app\\\\src\\\\features\\\\chart\\\\plugins\\\\drawingToolsBundleString.ts';
let c = fs.readFileSync(file, 'utf-8');
c = c.replace(/^export const DRAWING_TOOLS_JS = \\?"use strict";/, 'export const DRAWING_TOOLS_JS = `\"use strict\";');
c = c.replace(/\\\\;\\s*$/, '`;\n');
fs.writeFileSync(file, c);
