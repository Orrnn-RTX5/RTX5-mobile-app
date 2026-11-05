import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as controls from './chartPositionControls';
import { buildChartMarketOrderPayload } from './chartTradeActions';
import { formatLivePositionPnl } from '../trade/livePositionMetrics';
import { parseChartPositionStopDragKey } from './chartOverlays/positionStopDragKeys';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function harness() {
  const position = {id:'81',symbol:'EURUSD',side:'buy' as const,volume:0.003,openPrice:1.1,currentPrice:1.101,pnl:3,swap:0,sl:1.09,tp:1.12,openTime:'2026-10-14T00:00:00Z'};
  const scope = {sessionScope:'broker/server/account',symbol:'EURUSD',dataContextSig:'scoped:EURUSD:M1',chartGeneration:1};
  let positions = [position]; let activeSession = scope.sessionScope;
  let locked = false; let readonly = false; let oneClick = true;
  let closeWork: () => Promise<void> = async () => { positions=[]; };
  let orderWork: () => Promise<unknown> = async () => ({status:'filled'});
  const submissions:unknown[]=[]; const closed:string[]=[]; const sheets:any[]=[]; const alerts:any[]=[];
  const feedback:any[]=[]; const scripts:string[]=[]; const shared:unknown[]=[]; const modified:unknown[]=[];
  const state = {get positions(){return positions;}};
  const refs: any[]=[]; let refIndex=0;
  const imports: Record<string,unknown> = {
    react:{useCallback:(fn:unknown)=>fn,useEffect:()=>{},useRef:(value:unknown)=>refs[refIndex++] ?? (refs[refIndex-1]={current:value})},
    'react-native':{Alert:{alert:(title:string,message:string,buttons:unknown[],options:unknown)=>alerts.push({title,message,buttons,options})},Share:{share:async(value:unknown)=>{shared.push(value);}}},
    '../../api/orders':{ordersApi:{placeMarketOrder:async(payload:unknown)=>{submissions.push(payload); return orderWork();}}},
    '../../api/tradingErrors':{classifyTradingError:(e:any)=>({title:'Broker Error',message:e.message || e.response?.data?.message || 'Rejected'})},
    '../../state/activeBrokerSession':{captureActiveBrokerSession:()=>({session:{cacheNamespace:activeSession,accountLogin:'123'}})},
    '../../state/positionsState':{usePositionsState:{getState:()=>state}},
    '../../state/userPreferences':{useUserPreferences:{getState:()=>({oneClickAccepted:oneClick})}},
    '../../state/uiState':{useUIState:{getState:()=>({showChartActionSheet:(sheet:unknown)=>sheets.push(sheet),hideChartActionSheet:()=>{}})}},
    '../../state/investorReadOnlySession':{isActiveSessionInvestorReadOnly:()=>readonly,INVESTOR_READ_ONLY_MESSAGE:'Read only'},
    '../trade/closePositionFlow':{closePositionConfirmed:async(row:any)=>{closed.push(row.id); await closeWork();}},
    '../trade/tradePositionActionHostController':{showTradePositionAction:(...args:unknown[])=>{modified.push(args);return 1;},hideTradePositionActionHost:()=>{}},
    '../trade/tradeBackendCapabilities':{getActiveSltpUnavailableMessage:()=> 'This broker has not enabled position modifications.',isExistingPositionModifyBackendLocked:()=>locked},
    '../../market/quoteIntegrity':{resolveSessionQuoteActionAvailability:(quote:any)=>({allowed:!quote.stale,bid:quote.bid,ask:quote.ask}),quoteActionBlockMessage:()=> 'Fresh quotes required'},
    './chartTradeActions':{buildChartMarketOrderPayload}, './chartPositionControls':controls,
    '../trade/livePositionMetrics':{formatLivePositionPnl},
    '../trade/modifyPositionCoordinator':{getModifyPositionTicketState:()=>({mutationInFlight:false,phase:'idle'}),subscribeModifyPositionTicket:()=>()=>{}},
    './chartOverlays/symbolUtils':{normalizeChartOverlaySymbol:(symbol:string)=>symbol},
    './chartOverlays/positionStopDragKeys':{parseChartPositionStopDragKey},
  };
  const code = ts.transpileModule(readFileSync('src/features/chart/useChartPositionControls.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,any>={};
  runInNewContext(code,{exports,require:(path:string)=>{if(!imports[path])throw new Error('Unmocked import '+path);return imports[path];},console});
  const input:any={scope,active:true,quote:{bid:1.101,ask:1.102,lastReceivedAt:Date.now()},currency:'EUR',priceDigits:5,
    volumeBounds:{minVolume:0.001,maxVolume:100,stepVolume:0.001},inject:(script:string)=>scripts.push(script),feedback:(title:string,message:string)=>feedback.push({title,message})};
  let handle = exports.useChartPositionControls(input).handle;
  let request=0;
  const send=(action:string,patch:Record<string,unknown>={})=>handle({...scope,type:'CHART_POSITION_ACTION',positionId:position.id,
    positionKey:controls.positionControlKey(scope.sessionScope,position.id,position.symbol),requestId:++request,action,...patch});
  return {position,scope,input,submissions,closed,sheets,alerts,feedback,scripts,shared,modified,send,
    setClose:(fn:()=>Promise<void>)=>{closeWork=fn;},setOrder:(fn:()=>Promise<unknown>)=>{orderWork=fn;},
    setPositions:(rows:any[])=>{positions=rows;},setSession:(value:string)=>{activeSession=value;},setLocked:(value:boolean)=>{locked=value;},
    setReadonly:(value:boolean)=>{readonly=value;},setOneClick:(value:boolean)=>{oneClick=value;},
    render:()=>{refIndex=0;handle=exports.useChartPositionControls(input).handle;}};
}

test('native close is busy until confirmation; duplicate action is ignored, failure keeps controls and reports broker error', async()=>{
  const h=harness(); let reject!: (error:Error)=>void;
  h.setClose(()=>new Promise<void>((_,fail)=>{reject=fail;}));
  h.send('close'); h.send('close'); await tick(); assert.deepEqual(h.closed,['81']);
  assert.equal(h.scripts.some(script=>script.includes('"state":"pending"')),true);
  reject(new Error('Close rejected by broker')); await tick();
  assert.match(h.feedback[0].message,/Close rejected/);
  h.send('details'); assert.equal(h.sheets.length,1,'position stays actionable');
});

test('native add submits one new order with latest remaining lots and exact broker symbol, never edits local volume', async()=>{
  const h=harness(); h.setPositions([{...h.position,volume:0.007}]);
  h.send('add'); await tick(); assert.equal(h.submissions.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.submissions[0])),{account_login:'123',symbol:'EURUSD',side:'buy',volume:0.007});
});

test('native reversal waits for the confirmed close, then submits the opposite side; failure is separately reported', async()=>{
  const h=harness(); let finish!:()=>void; h.setClose(()=>new Promise<void>(resolve=>{finish=resolve;}));
  h.send('reverse'); assert.equal(h.alerts.length,1); h.alerts[0].buttons[1].onPress(); await tick();
  assert.equal(h.submissions.length,0); finish(); await tick();
  assert.equal((h.submissions[0] as any).side,'sell');
  const failure=harness(); failure.setClose(async()=>{}); failure.setOrder(async()=>{throw new Error('Margin rejected');});
  failure.send('reverse'); failure.alerts[0].buttons[1].onPress(); await tick();
  assert.match(failure.feedback[0].message,/Position closed.*replacement.*Margin rejected/);
});

test('native reversal does not submit the replacement after close rejection or scope change', async()=>{
  const h=harness(); h.setClose(async()=>{throw new Error('Close failed');}); h.send('reverse'); h.alerts[0].buttons[1].onPress(); await tick();
  assert.equal(h.submissions.length,0); assert.match(h.feedback[0].message,/Close failed/);
  const stale=harness(); stale.setClose(async()=>{stale.input.scope={...stale.scope,symbol:'BTCUSD'};stale.render();});
  stale.send('reverse'); stale.alerts[0].buttons[1].onPress(); await tick(); assert.equal(stale.submissions.length,0);
});

test('structured broker replacement errors preserve the actual cause after the confirmed close', async()=>{
  const h=harness();h.setClose(async()=>{});h.setOrder(async()=>{throw {response:{data:{message:'Insufficient margin'}}};});
  h.send('reverse');h.alerts[0].buttons[1].onPress();await tick();
  assert.match(h.feedback[0].message,/Position closed.*replacement.*Insufficient margin/);
});

test('native share uses an explicit preview containing approved display fields only, never submits a trade', async()=>{
  const h=harness(); h.send('share'); await tick();
  assert.equal(h.shared.length,0); assert.match(h.alerts[0].message,/EURUSD BUY 0.003 lots/);
  assert.doesNotMatch(h.alerts[0].message,/broker\/server|123|token|https:/);
  h.alerts[0].buttons[1].onPress(); await tick(); assert.equal(h.shared.length,1);
  assert.equal(h.closed.length+h.submissions.length,0);
});

test('native TP/SL opens the exact existing ticket host; capabilities and unsafe identifiers are explained and disabled', async()=>{
  const h=harness(); h.send('tp'); await tick(); h.send('sl'); await tick();
  assert.deepEqual(h.modified,[['modify','81','tp'],['modify','81','sl']]);
  h.setLocked(true); h.send('details');
  assert.equal(h.sheets[0].actions[0].disabled,true); assert.match(h.sheets[0].actions[0].subtitle,/broker.*not enabled/);
  h.send('sl'); await tick(); assert.equal(h.modified.length,2); assert.match(h.feedback[0].message,/not enabled/);
});

test('position details identify provisional P/L after the compact chart estimate symbol is removed',()=>{
  const h=harness();h.input.quote.bid=1.102;h.send('details');
  assert.match(h.sheets[0].title,/Estimated P\/L .* EUR/);
});

test('native ticket selector exposes each grouped position separately and resolves latest values before acting', async()=>{
  const h=harness();h.setPositions([h.position,{...h.position,id:'82',side:'sell',volume:0.005}]);
  h.send('details',{groupPositionIds:['81','82']}); assert.equal(h.sheets[0].actions.length,2);
  h.sheets[0].actions[1].onPress(); assert.match(h.sheets[1].title,/SELL 0.005.*82/);
  h.sheets[1].actions.find((row:any)=>row.label==='Close position').onPress(); await tick();
  assert.deepEqual(h.closed,['82']);
});

test('native rejects stale/malformed/wrong-account intents and honors confirmation and investor preferences',async()=>{
  const h=harness(); h.send('close',{chartGeneration:0}); h.send('close',{sessionScope:'other'}); h.send('close',{requestId:NaN});
  assert.equal(h.closed.length,0);
  h.setOneClick(false);h.send('close'); assert.equal(h.alerts.length,1);h.alerts[0].buttons[0].onPress();await tick();assert.equal(h.closed.length,0);
  h.setReadonly(true);h.send('close');await tick();assert.equal(h.closed.length,0);
  const stale=harness();stale.setSession('other');stale.send('add');await tick();assert.equal(stale.submissions.length,0);
});
