import assert from 'node:assert/strict';
import test from 'node:test';
import type { Deal, DealHistoryResult } from '../api/deals';
import { getChartDealsRefreshFrom, mergeChartDealHistory } from '../query/chartDealRefresh';
import { createCoalescedWriter } from '../utils/coalescedWriter';
import { createOtaReloadCoordinator } from '../utils/otaReload';
import { allowLocalChartNavigation, parseChartBridgeMessage } from './chart/chartWebViewBoundary';
import { otaSurface } from '../i18n/surfaces/otaSurface';
const row = (ticket: number,time: number,profit=0) => ({ticket,time,profit} as Deal);
const result = (deals: Deal[],complete=true): DealHistoryResult => ({deals,complete,reason:complete?null:'legacy-fallback',fullFetchedAt:1_000_000});

test('incremental chart refresh overlaps recent rows, normalizes ms, and periodically reconciles',()=>{
  assert.equal(getChartDealsRefreshFrom(result([row(1,1_790_000_000)]),1_010_000),1_789_999_940);
  assert.equal(getChartDealsRefreshFrom(result([row(1,1_790_000_000_000)]),1_010_000),1_789_999_940);
  assert.equal(getChartDealsRefreshFrom(result([row(1,100)]),1_300_000),undefined);
  assert.equal(getChartDealsRefreshFrom(result([row(1,100)],false),1_010_000),undefined);
  assert.equal(getChartDealsRefreshFrom(result([]),1_010_000),undefined);
});
test('chart merging preserves older deals, replaces corrected tickets, and retains completeness',()=>{
  const previous=result([row(1,10),row(2,20)]);
  const merged=mergeChartDealHistory(previous,result([row(2,20,7),row(3,30)]));
  assert.deepEqual(merged.deals.map(deal=>deal.ticket),[1,2,3]);
  assert.equal(merged.deals[1].profit,7); assert.equal(merged.fullFetchedAt,previous.fullFetchedAt);
  const partial=mergeChartDealHistory(previous,result([row(3,30)],false));
  assert.equal(partial.complete,false); assert.equal(partial.reason,'legacy-fallback');
});
test('chart incremental cache cannot grow without a bound',()=>{
  const previous=result(Array.from({length:50_000},(_,i)=>row(i+1,i+1)));
  const merged=mergeChartDealHistory(previous,result([row(50_001,50_001)]));
  assert.equal(merged.deals.length,50_000); assert.equal(merged.complete,false);
  assert.equal(merged.reason,'page-limit'); assert.equal(merged.deals[0].ticket,50_001);
});
test('chart navigation refuses remote, file and script URLs',()=>{
  for(const url of ['about:blank','about:blank#chart']) assert.equal(allowLocalChartNavigation({url}),true);
  for(const url of ['https://example.com','javascript:alert(1)','file:///etc/passwd','about:blank.evil','data:text/html,<script>alert(1)</script>']) assert.equal(allowLocalChartNavigation({url}),false);
});
test('chart bridge rejects malformed, unknown, oversized and wrongly typed messages',()=>{
  for(const message of ['null','[]','{}','{bad','{"type":"UNKNOWN"}','{"type":"CHART_TOUCH_STATE","active":"false"}','{"type":"DRAWINGS_CHANGED","drawings":{}}','{"type":"CHART_TAP","x":"123"}','{"type":"CHART_GEOMETRY","plotArea":{"width":"bad"}}','x'.repeat(2_000_001)]) assert.equal(parseChartBridgeMessage(message),null);
});
test('valid chart geometry keeps the current context identifier',()=>{
  const message={type:'CHART_GEOMETRY',dataContextSig:'broker:account:XAUUSD:M1',plotArea:{left:0,top:0,width:300,height:200},priceRange:{from:4180,to:4200}};
  assert.deepEqual(parseChartBridgeMessage(JSON.stringify(message)),message);
});
test('cache writes batch nearby values and keep the newest per key',async()=>{
  const batches: unknown[]=[];
  const writer=createCoalescedWriter<string,number>(async rows=>{batches.push(rows);},()=>assert.fail('unexpected error'),10_000);
  writer.enqueue('EURUSD.M1',1); writer.enqueue('BTCUSD.M1',2); writer.enqueue('EURUSD.M1',3);
  await writer.flush();
  assert.deepEqual(batches,[[['EURUSD.M1',3],['BTCUSD.M1',2]]]); writer.cancel();
});
test('failed cache writes do not block the next batch',async()=>{
  let calls=0,errors=0;
  const writer=createCoalescedWriter<string,number>(async()=>{if(++calls===1)throw new Error('disk full');},()=>{errors++;},10_000);
  writer.enqueue('a',1); await writer.flush(); writer.enqueue('a',2); await writer.flush();
  assert.equal(errors,1); assert.equal(calls,2); writer.cancel();
});
test('a session change cancels queued disk writes',async()=>{
  let calls=0; const writer=createCoalescedWriter<string,number>(async()=>{calls++;},()=>{},10_000);
  writer.enqueue('old-session',1); writer.cancel(); writer.enqueue('new-value',2);
  await writer.flush(); assert.equal(calls,0);
});
test('concurrent OTA reloads share one native call and can retry after rejection',async()=>{
  let reject!: (error: Error)=>void; let calls=0;
  const reload=createOtaReloadCoordinator(()=>{calls++;return calls===1?new Promise<void>((_,no)=>{reject=no;}):Promise.resolve();});
  const first=reload(),second=reload(); assert.equal(first,second);
  const rejected=assert.rejects(first,/native reload failed/);
  await Promise.resolve(); assert.equal(calls,1); reject(new Error('native reload failed')); await rejected;
  await reload(); assert.equal(calls,2);
});
test('OTA strings have complete translations for every supported app language',()=>{
  assert.equal(Object.keys(otaSurface).length,15);
  for(const [language,entries] of Object.entries(otaSurface)) {
    assert.deepEqual(Object.keys(entries),Object.keys(otaSurface.en),language);
    for(const [key,value] of Object.entries(entries)) { assert.ok(value.trim(),language+': '+key); if(language!=='en')assert.notEqual(value,key,language+': '+key); }
  }
});
