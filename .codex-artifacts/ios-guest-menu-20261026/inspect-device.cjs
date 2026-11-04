const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require(path.resolve(__dirname, '../../rtx5-app/node_modules/ws'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch('http://127.0.0.1:8081/json/list', { signal: AbortSignal.timeout(6000) })).json();
  const target = targets.filter(item => item.appId === 'com.yoforex.expogo').at(-1);
  if (!target) throw new Error('RTX5 iPhone JavaScript target is unavailable');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let sequence = 0;
  const pending = new Map();
  socket.on('message', raw => {
    const message = JSON.parse(String(raw));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  socket.on('close', (code, reason) => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(`Debugger disconnected: ${code} ${reason}`)); }
    pending.clear();
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 8000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  try {
    await call('Runtime.enable');
    await evaluate(`globalThis.__rtxInspectModule = fragment => { const entry = [...__r.getModules()].find(([id, module]) => module.verboseName === fragment); if (!entry) throw new Error('Module unavailable: ' + fragment); return __r(entry[0]); }; 'ready'`);
    const snapshot = () => evaluate(`JSON.stringify({
      time: Date.now(),
      appState: __rtxInspectModule('node_modules/react-native/index.js').AppState.currentState,
      sidebarOpen: __rtxInspectModule('src/state/uiState.ts').useUIState.getState().sidebarOpen,
      authScreen: __rtxInspectModule('src/features/trade/authFlowState.ts').getAuthFlowState().screen,
      authForm: __rtxInspectModule('src/features/trade/authFlowState.ts').getAuthFlowState().form,
      hasBroker: !!__rtxInspectModule('src/state/publicBrokerContext.ts').getPublicBrokerContext(),
      route: __rtxInspectModule('node_modules/expo-router/build/global-state/router-store.js').store.getRouteInfo().pathname
    })`);
    console.log(await snapshot());
    const mode = process.argv[2] || 'snapshot';
    if (mode === 'reload') {
      console.log(await evaluate(`setTimeout(()=>__rtxInspectModule('node_modules/react-native/index.js').DevSettings.reload(),100); 'Project reload scheduled'`));
      return;
    }
    if (mode === 'back') {
      console.log(await evaluate(`(()=>{for(const [id]of __REACT_DEVTOOLS_GLOBAL_HOOK__.renderers){for(const root of __REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots(id)){const stack=[root.current];while(stack.length){const f=stack.pop();if(!f)continue;const name=f.type?.displayName||f.type?.name||f.type?.type?.name||'';if(['LoginAccountScreen','DemoAccountScreen'].includes(name)&&f.memoizedProps?.onBack){f.memoizedProps.onBack();return 'Invoked '+name+' Back action';}if(f.sibling)stack.push(f.sibling);if(f.child)stack.push(f.child);}}}throw Error('Active authentication Back action unavailable');})()`));
      await wait(900);
      console.log(await snapshot());
    }
    if (mode === 'return-quotes') {
      await evaluate(`__rtxInspectModule('src/features/trade/authFlowState.ts').dismissAuthFlow(); __rtxInspectModule('src/state/uiState.ts').useUIState.getState().setSidebarOpen(false); 'returned from account flow'`);
      await wait(900);
      console.log(await snapshot());
    }
    if (mode === 'register-entry') {
      await evaluate(`__rtxInspectModule('src/features/trade/authFlowState.ts').dismissAuthFlow(); 'closed'`);
      await wait(900);
      await evaluate(`__rtxInspectModule('node_modules/expo-router/build/imperative-api.js').router.push('/register-entry'); 'registration entry opened'`);
      await wait(1400);
      console.log(await snapshot());
    }
    if (mode === 'drawer') {
      await evaluate(`__rtxInspectModule('src/features/trade/authFlowState.ts').dismissAuthFlow(); 'closed'`);
      await wait(900);
      await evaluate(`__rtxInspectModule('src/ui/components/sidebarDrawerController.ts').openSidebarDrawerImmediately(); 'drawer opened'`);
      await wait(250);
      console.log(await snapshot());
    }
    if (mode === 'sidebar-login') {
      await evaluate(`__rtxInspectModule('src/features/trade/authFlowState.ts').dismissAuthFlow(); 'closed'`);
      await wait(900);
      await evaluate(`__rtxInspectModule('src/ui/components/sidebarDrawerController.ts').openSidebarDrawerImmediately(); 'drawer opened'`);
      await wait(250);
      console.log(await snapshot());
      await evaluate(`(()=>{for(const [id]of __REACT_DEVTOOLS_GLOBAL_HOOK__.renderers){for(const root of __REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots(id)){const stack=[root.current];while(stack.length){const f=stack.pop();if(!f)continue;const p=f.memoizedProps||{};if(p.latencyLabel==='sidebar.getStarted'&&p.onPress){p.onPress({nativeEvent:{}});return 'pressed existing sidebar account action';}if(f.sibling)stack.push(f.sibling);if(f.child)stack.push(f.child);}}}throw Error('Sidebar account action not found');})()`);
      await wait(1400);
      console.log(await snapshot());
    }
    if (mode === 'reset-login') {
      await evaluate(`__rtxInspectModule('src/features/trade/authFlowState.ts').dismissAuthFlow(); 'closed'`);
      await wait(900);
      await evaluate(`__rtxInspectModule('src/features/trade/authFlowState.ts').openAuthFlow(undefined,'login'); 'opened directly from Quotes'`);
      await wait(900);
      console.log(await snapshot());
    }
    if (['capture', 'reset-login', 'sidebar-login', 'register-entry', 'drawer'].includes(mode)) {
      await evaluate(`globalThis.__rtxDeviceCaptureState = 'pending'; __rtxInspectModule('node_modules/react-native/index.js').NativeModules.RNViewShot.captureScreen({format:'jpg',quality:0.7,result:'base64',snapshotContentContainer:false,useRenderInContext:false}).then(data=>{globalThis.__rtxDeviceCaptureData=data;globalThis.__rtxDeviceCaptureState='ready';}, error=>{globalThis.__rtxDeviceCaptureState=String(error);}); 'requested'`);
      for (let attempt = 0; attempt < 35; attempt++) {
        await wait(200);
        const state = await evaluate('globalThis.__rtxDeviceCaptureState');
        if (state === 'ready') {
          const data = await evaluate('globalThis.__rtxDeviceCaptureData');
          const directory = path.join(__dirname, 'live-device'); fs.mkdirSync(directory, { recursive: true });
          const file = path.join(directory, (process.argv[3] || 'screen') + '.jpg');
          fs.writeFileSync(file, Buffer.from(data, 'base64'));
          await evaluate('delete globalThis.__rtxDeviceCaptureData; delete globalThis.__rtxDeviceCaptureState; true');
          console.log(JSON.stringify({ screenshot: file }));
          console.log(await snapshot());
          return;
        }
        if (state !== 'pending') throw new Error(`Capture failed: ${state}`);
      }
      throw new Error('Native screenshot did not complete');
    }
    if (mode === 'watch') {
      await evaluate(`globalThis.__rtxDeviceTraceCleanup?.(); globalThis.__rtxDeviceTrace=[];
        const emit=(kind, data)=>{__rtxDeviceTrace.push({time:Date.now(),kind,...data}); if(__rtxDeviceTrace.length>100)__rtxDeviceTrace.shift();};
        const ui=__rtxInspectModule('src/state/uiState.ts').useUIState;
        const auth=__rtxInspectModule('src/features/trade/authFlowState.ts');
        const a=ui.subscribe((s,p)=>{if(s.sidebarOpen!==p.sidebarOpen)emit('sidebar',{open:s.sidebarOpen});});
        const b=auth.subscribeAuthFlow(()=>{const s=auth.getAuthFlowState();emit('auth',{screen:s.screen,form:s.form,hasContext:!!s.context});});
        globalThis.__rtxDeviceTraceCleanup=()=>{a();b();}; 'watching'`);
      let last = '';
      for (let sample = 0; sample < 120; sample++) {
        await wait(1000);
        const trace = await evaluate('JSON.stringify(globalThis.__rtxDeviceTrace)');
        if (trace !== last) { console.log(trace); last = trace; }
      }
      await evaluate('globalThis.__rtxDeviceTraceCleanup?.(); true');
    }
  } finally { socket.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
