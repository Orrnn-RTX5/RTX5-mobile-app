const fs = require('fs');
let nativeContent = fs.readFileSync('src/features/chart/ChartScreen.native.tsx', 'utf8');
nativeContent = nativeContent.replace(
  "        instantOpen: true,\r\n        actions: chartTypePickerActions,",
  "        instantOpen: true,\r\n        presentation: 'mt5Plain',\r\n        showActionIcons: true,\r\n        actions: chartTypePickerActions,"
);
nativeContent = nativeContent.replace(
  "        instantOpen: true,\n        actions: chartTypePickerActions,",
  "        instantOpen: true,\n        presentation: 'mt5Plain',\n        showActionIcons: true,\n        actions: chartTypePickerActions,"
);
fs.writeFileSync('src/features/chart/ChartScreen.native.tsx', nativeContent);
console.log('Done');
