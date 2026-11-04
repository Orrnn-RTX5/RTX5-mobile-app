const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../../rtx5-app');
const resolve = name => require.resolve(name, { paths: [root, path.resolve(root, '../tools/js-toolchain')] });
const esbuild = require(resolve('esbuild'));
const stubs = {
  'react-native': `export * from 'react-native-web'; export function useWindowDimensions() { return window.previewSize; } export function Modal({children,visible}) { return visible ? children : null; }`,
  'react-native-safe-area-context': `export function useSafeAreaInsets() { return window.previewInsets; }`,
  'FastPressable': `import React from 'react'; import {Pressable} from 'react-native-web'; export function FastPressable({latencyLabel,activateOnPressIn,...props}) { return <Pressable {...props}/>; }`,
  'useTranslation': `import {translate} from '${path.join(root, 'src/i18n/translations.ts').replaceAll('\\','/')}'; export function useTranslation() { return {t: key => translate(key, window.previewLanguage)}; }`,
  '@expo/vector-icons': `import React from 'react'; export function Ionicons({size,color}) { return <span aria-hidden="true" style={{fontFamily:'Ionicons',fontSize:size,color,lineHeight:1}}>{String.fromCodePoint(0xece0)}</span>; }`,
};
const glyphs = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'), 'utf8'));
stubs['@expo/vector-icons'] = stubs['@expo/vector-icons'].replace('0xece0', String(glyphs['log-out-outline']));
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {LogoutConfirmation} from './src/features/settings/SettingsScreen/LogoutConfirmation';
import {GLight,GDark} from './src/ui/theme/glass';
const presets={ios:{width:393,height:852,fontScale:1},android:{width:360,height:800,fontScale:1},narrow:{width:320,height:740,fontScale:1},large:{width:393,height:852,fontScale:1.6},landscape:{width:800,height:360,fontScale:1}};
function App(){
  const [preset,setPreset]=React.useState('ios');const [theme,setTheme]=React.useState('dark');const [language,setLanguage]=React.useState('en');const [visible,setVisible]=React.useState(true);const [status,setStatus]=React.useState('');
  window.previewSize=presets[preset];window.previewInsets=preset==='ios'||preset==='large'?{top:47,bottom:34,left:0,right:0}:preset==='landscape'?{top:0,bottom:24,left:48,right:48}:{top:24,bottom:24,left:0,right:0};window.previewLanguage=language;
  const palette=theme==='dark'?GDark:GLight;
  return <><aside><h1>Logout popup</h1><p>Component preview · React Native Web</p><label>Viewport <select value={preset} onChange={e=>{setPreset(e.target.value);setVisible(true)}}>{Object.keys(presets).map(key=><option key={key}>{key}</option>)}</select></label><label>Theme <select value={theme} onChange={e=>setTheme(e.target.value)}><option>dark</option><option>light</option></select></label><label>Language <select value={language} onChange={e=>setLanguage(e.target.value)}><option value="en">English</option><option value="de">German</option><option value="hi">Hindi</option><option value="ar">Arabic</option></select></label><button onClick={()=>{setVisible(true);setStatus('')}}>Open popup</button><p id="status">{status}</p></aside><div className="device" style={{width:window.previewSize.width,height:window.previewSize.height,background:palette.bg}}><div style={{position:'absolute',top:72,left:24,color:palette.text,fontSize:24,fontWeight:600}}>Settings</div><LogoutConfirmation key={preset+theme+language} visible={visible} T={palette} onCancel={()=>{setVisible(false);setStatus('Cancelled')}} onConfirm={()=>{setVisible(false);setStatus('Confirmed (preview only)')}}/></div></>;
}createRoot(document.getElementById('root')).render(<App/>);`;
async function start() {
  await esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},outfile:path.join(__dirname,'preview.js'),bundle:true,jsx:'automatic',platform:'browser',define:{'process.env.NODE_ENV':'"development"'},nodePaths:[path.join(root,'node_modules')],plugins:[{name:'preview-only-stubs',setup(build){
    build.onResolve({filter:/^(react-native|react-native-safe-area-context|@expo\/vector-icons)$|\/(FastPressable|useTranslation)$/}, args=>{const key=args.path.split('/').pop();return {path:stubs[args.path]?args.path:key,namespace:'preview-stub'};});
    build.onLoad({filter:/.*/,namespace:'preview-stub'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:root}));
  }}]});
  fs.copyFileSync(path.join(root,'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'),path.join(__dirname,'Ionicons.ttf'));
  fs.writeFileSync(path.join(__dirname,'index.html'),`<!doctype html><html><meta charset="utf-8"><style>@font-face{font-family:Ionicons;src:url('/Ionicons.ttf')}*{box-sizing:border-box}body{margin:0;background:#dce3ed;font-family:system-ui}.device{position:absolute;left:380px;top:18px;transform:scale(.76);transform-origin:top left;border-radius:32px;overflow:hidden;box-shadow:0 20px 50px #0003}aside{position:absolute;left:32px;top:24px;width:300px}h1{font-size:26px}p{color:#475569}label{display:block;margin:18px 0}select{display:block;width:220px;padding:8px;margin-top:8px}button{padding:12px 20px;background:#1e293b;color:white;border:0;border-radius:8px}</style><div id="root"></div><script src="/preview.js"></script></html>`);
  http.createServer((req,res)=>{const requested=req.url.split('?')[0];const file=requested==='/'?'index.html':path.basename(requested);const allowed=['index.html','preview.js','Ionicons.ttf'];if(!allowed.includes(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'font/ttf');res.end(fs.readFileSync(path.join(__dirname,file)));}).listen(4173,'127.0.0.1',()=>console.log('Logout component preview: http://127.0.0.1:4173'));
}start().catch(error=>{console.error(error);process.exit(1)});
