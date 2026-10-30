import test from 'node:test';
import assert from 'node:assert/strict';
import { positionControlKey, validatePositionIntent, createPositionActionGate, positionProfitDisplay,
  formatPositionLots, reverseConfirmedPosition, validatePositionLevelIntent, type ChartPositionIntent } from './chartPositionControls';
import { confirmedPositionFill } from '../../api/orders/confirmedPositionFill';
import { resolveBrokerExecutionEvidence } from '../../api/orders/executionEvidence';
import { buildMergedPositions } from '../../state/positionsState.helpers';
import { buildChartOverlayPayload } from './chartOverlays/buildPayload';
import { validatePositionLevelChange } from '../trade/positionLevelValidation';
import { parseChartBridgeMessage } from './chartWebViewBoundary';
import type { PositionItem } from '../../domain/tradingModels';
import type { ChartColorsConfig } from '../../state/userPreferences';

const scope = { sessionScope: 'broker/server/account/epoch', dataContextSig: 'broker/server/account/epoch:EURUSD:M1', chartGeneration: 3, symbol: 'EURUSD' };
const position: PositionItem = { id:'90071992547409931234', symbol:'EURUSD', side:'buy', volume:0.003,
  openPrice:1.1, currentPrice:1.101, pnl:12.5, swap:-0.25, commission:-0.1, openTime:'2026-10-14T05:00:00Z', sl:1.09, tp:1.12 };
const intent: ChartPositionIntent = { ...scope, type:'CHART_POSITION_ACTION', positionId:position.id,
  positionKey:positionControlKey(scope.sessionScope, position.id, position.symbol), requestId:1, action:'close' };
const colors = { background:'#111827', tradeOpen:'#2962FF', tradeStopOut:'#ef4444', tradeTpSl:'#22c55e' } as ChartColorsConfig;
const overlay = (positions: PositionItem[], extras: Record<string, unknown> = {}) => buildChartOverlayPayload({
  chartSymbol:'EURUSD', candles:[], positions, colors, sellColor:'#ef4444', accountCurrency:'EUR', priceDigits:5,
  volumeStep:0.001, positionControlScope:scope, showOnChart:{buyTrade:true, sellTrade:true,slTpLevels:true}, ...extras,
});

test('confirmed fill merges immediately, keeps the exact broker ticket and entry, survives old empty snapshots', () => {
  const fill = confirmedPositionFill({position_ticket:position.id,status:'filled',action:'opened',price:1.10017,
    volume:0.003,symbol:'EURUSD',side:'buy',profit:-0.09}, Date.now());
  assert.ok(fill); assert.equal(fill.ticket,position.id);
  const merged = buildMergedPositions([], [fill], {preserveMissingExisting:true});
  // Match the store's causal retention marker set by upsertPosition.
  merged[0].clientCreatedAt = Date.now();
  const retained = buildMergedPositions(merged, [], {preserveOptimisticMs:30_000});
  assert.equal(retained.length,1);
  const lines = overlay(retained).priceLines;
  assert.equal(lines.filter(line=>line.id.startsWith('open-')).length,1);
  assert.equal(lines[0].price,1.10017);
  assert.equal(lines[0].positionControl?.positionId,position.id);
  assert.equal(lines[0].labelSideText,'BUY 0.003');
  assert.equal(lines[0].labelValueText,'-0.09000 EUR');
  assert.equal(lines[0].dragKey,undefined);
});

test('accepted/pending/unfilled requests and incomplete or netted receipts never invent an open position', () => {
  const fill = {position_ticket:position.id,status:'filled',action:'opened',price:1.1,volume:0.003,symbol:'EURUSD',side:'buy'};
  for (const change of [{status:'accepted'}, {status:'rejected'}, {action:'increased'}, {volume:undefined}, {position_ticket:undefined}, {price:undefined}]) {
    assert.equal(confirmedPositionFill({...fill,...change}),null);
  }
  assert.equal(resolveBrokerExecutionEvidence({position_ticket:position.id,price:1.1}).ticket,position.id);
  assert.equal(resolveBrokerExecutionEvidence({position_ticket:9007199254740994,price:1.1}).confirmed,false);
});

test('snapshots deduplicate, partial closes update remaining lots, terminal closes remove active levels only', () => {
  const dto = {ticket:position.id,symbol:'EURUSD',side:'buy',volume:0.002,price_open:1.1,profit:4,price_sl:1.09,price_tp:1.12};
  const partial = buildMergedPositions([position], [dto,dto]);
  assert.equal(partial.length,1); assert.equal(partial[0].volume,0.002);
  assert.equal(overlay(partial).priceLines.find(line=>line.id.startsWith('open-'))?.labelSideText,'BUY 0.002');
  const closed = buildMergedPositions(partial,[{ticket:position.id,status:'closed'}], {preserveMissingExisting:true});
  assert.equal(overlay(closed).priceLines.length,0);
});

test('typed intents reject missing/wrong session, chart generation, context, symbol, key, ticket and malformed fields', () => {
  assert.ok(validatePositionIntent(intent,scope,[position]));
  for (const patch of [{sessionScope:'other-account'}, {chartGeneration:2}, {dataContextSig:'old-chart'}, {symbol:'GBPUSD'},
    {positionId:'some-other-ticket'}, {positionKey:'wrong'}, {requestId:NaN}, {requestId:0}, {action:'executeJS'},
    {groupPositionIds:[123]}, {positionId:123}]) assert.equal(validatePositionIntent({...intent,...patch},scope,[position]),null);
  assert.equal(validatePositionIntent(intent,scope,[]),null);
  assert.ok(parseChartBridgeMessage(JSON.stringify(intent)));
  assert.equal(parseChartBridgeMessage(JSON.stringify({...intent,chartGeneration:'3'})),null);
});

test('existing symbol resolver scopes aliases while other symbols remain stored and excluded', () => {
  const alias = {...position,symbol:'EURUSDm'};
  const aliasIntent = {...intent,symbol:alias.symbol,positionKey:positionControlKey(scope.sessionScope,alias.id,alias.symbol)};
  assert.ok(validatePositionIntent(aliasIntent,scope,[alias]));
  const rows = [position,{...position,id:'2',symbol:'GBPUSD'}];
  assert.equal(overlay(rows).priceLines.filter(line=>line.id.startsWith('open-')).length,1);
  assert.equal(rows.length,2);
  assert.notEqual(positionControlKey('serverA',position.id,position.symbol),positionControlKey('serverB',position.id,position.symbol));
});

test('drag bridge binds proposed price and level role to the same exact ticket as its drag key',()=>{
  const drag = { ...intent,type:'CHART_TRADE_LINE_DRAG',levelRole:'sl',phase:'end',dragKey:`position-stop:sl:${position.id}`,price:1.101 };
  assert.ok(validatePositionLevelIntent(drag,scope,[position]));
  for (const patch of [{dragKey:'position-stop:sl:other'}, {levelRole:'tp'}, {phase:'tap'}, {price:NaN}, {price:0}, {dataContextSig:'old'}]) {
    assert.equal(validatePositionLevelIntent({...drag,...patch},scope,[position]),null);
  }
});

test('duplicate intents and concurrent requests for one ticket cannot submit twice; failure releases the lock', async () => {
  const gate = createPositionActionGate(); assert.equal(gate.claim(intent),true); assert.equal(gate.claim(intent),false);
  let finish!:()=>void; const pending = gate.run(intent.positionKey,()=>new Promise<void>(resolve=>{finish=resolve;}));
  assert.equal(gate.claim({...intent,requestId:2}),false);
  await assert.rejects(gate.run(intent.positionKey,async()=>{}),/already pending/);
  finish(); await pending;
  await assert.rejects(gate.run(intent.positionKey,async()=>{throw new Error('broker rejected');}),/broker rejected/);
  assert.equal(gate.claim({...intent,requestId:3}),true);
});

test('P/L uses fresh BUY Bid and SELL Ask calibrated to broker account profit, marks estimates and preserves charges', () => {
  const quote = {bid:1.102,ask:1.103,lastReceivedAt:10_000};
  const buy = positionProfitDisplay(position,quote,10_100);
  assert.equal(buy.estimated,true); assert.ok(Math.abs(buy.value! - 25.35)<1e-8);
  const sell = {...position,side:'sell' as const,openPrice:1.104,currentPrice:1.103};
  const result = positionProfitDisplay(sell,{...quote,ask:1.102},10_100);
  assert.ok(Math.abs(result.value! - 25.35)<1e-8);
  assert.deepEqual(positionProfitDisplay(position,{...quote,stale:true},10_100),{value:12.5,estimated:false});
  assert.deepEqual(positionProfitDisplay(position,quote,100_000),{value:12.5,estimated:false});
  assert.deepEqual(positionProfitDisplay({...position,currentPrice:position.openPrice},quote,10_100),{value:12.5,estimated:false});
  assert.deepEqual(positionProfitDisplay({...position,pnl:NaN},quote,10_100),{value:null,estimated:false});
  assert.equal(positionProfitDisplay(position,{ask:1.102,lastReceivedAt:10_000},10_100).estimated,false);
});

test('entry and protection prices use broker precision across asset classes; lot steps preserve actual remaining volume', () => {
  for (const [symbol,price,digits] of [['EURUSD',1.10017,5],['GBPUSD',1.24567,5],['USDJPY',149.123,3],
    ['XAUUSD',2711.123,3],['XAGUSD',31.1234,4],['BTCUSD',61000.12,2],['US30',42001.5,1]] as const) {
    const p = {...position,symbol,openPrice:price,tp:price+1,sl:price-1};
    const payload = overlay([p],{chartSymbol:symbol,priceDigits:digits,positionControlScope:{...scope,symbol}});
    assert.equal(payload.priceLines.find(line=>line.id.startsWith('tp-'))?.labelValueText,(price+1).toFixed(digits));
    assert.equal(payload.priceLines.find(line=>line.id.startsWith('open-'))?.price,price);
  }
  assert.equal(formatPositionLots(0.003,0.001),'0.003'); assert.equal(formatPositionLots(1.25,0.25),'1.25');
  assert.equal(formatPositionLots(0.003,0.01),'0.003'); assert.equal(formatPositionLots(2,1),'2');
  assert.equal(overlay([position],{accountCurrency:undefined}).priceLines.find(line=>line.id.startsWith('open-'))?.labelValueText,'+12.500 currency unavailable');
});

test('reverse waits for confirmed close, never opens after failed close or account change; replacement failure is distinct', async () => {
  const events:string[]=[]; let finish!:()=>void;
  const pending = reverseConfirmedPosition({close:()=>new Promise<void>(resolve=>{finish=resolve;events.push('close');}),isCurrent:()=>true,openOpposite:async()=>{events.push('open');}});
  assert.deepEqual(events,['close']); finish(); await pending; assert.deepEqual(events,['close','open']);
  let opened=0;
  await assert.rejects(reverseConfirmedPosition({close:async()=>{throw new Error('close rejected');},isCurrent:()=>true,openOpposite:async()=>{opened++;}}),/close rejected/);
  await reverseConfirmedPosition({close:async()=>{},isCurrent:()=>false,openOpposite:async()=>{opened++;}});
  assert.equal(opened,0);
  await assert.rejects(reverseConfirmedPosition({close:async()=>{},isCurrent:()=>true,openOpposite:async()=>{throw new Error('insufficient margin');}}),/Position closed.*replacement.*insufficient margin/);
});

test('broker stop/freeze rules use liquidation price, accept profitable SL, tick snapping, preserve unchanged other level', () => {
  const base = {side:'buy' as const,role:'sl' as const,previous:1.09,proposed:1.101,marketPrice:1.102,tickSize:0.00001,point:0.00001,stopsLevel:50,freezeLevel:20};
  assert.equal(validatePositionLevelChange(base),null);
  assert.match(validatePositionLevelChange({...base,proposed:1.1019})!,/distance/);
  assert.match(validatePositionLevelChange({...base,proposed:1.103})!,/wrong side/);
  assert.match(validatePositionLevelChange({...base,proposed:1.101001})!,/tick size/);
  assert.match(validatePositionLevelChange({...base,previous:1.1019,proposed:0})!,/freeze/);
  assert.equal(validatePositionLevelChange({...base,proposed:base.previous}),null);
  assert.equal(validatePositionLevelChange({...base,proposed:0}),null);
  assert.equal(validatePositionLevelChange({...base,side:'sell',previous:1.11,proposed:1.103}),null);
});
