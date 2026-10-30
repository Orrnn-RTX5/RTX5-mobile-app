import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beginProtectedPositionsMutation, capturePositionsMutationBarrier, canCommitUncoordinatedPositionsRead,
  invalidatePendingPositionsReads } from '../../state/positionsMutationBarrier';

function harness() {
  let current=true;let fail=false;let finish!:()=>void;
  const removed:unknown[]=[];const imports:Record<string,unknown>={
    'react-native':{Alert:{alert:()=>{}}},'../../api/positions':{positionsApi:{closePosition:()=>new Promise<void>((resolve,reject)=>{finish=()=>fail?reject(new Error('Broker rejected')):resolve();})}},
    '../../api/tradingErrors':{},'../../state/providers/AppProviders':{appQueryClient:{}},
    '../../state/positionsState':{usePositionsState:{getState:()=>({recordClosedPosition:()=>{},finishOptimisticClose:(id:unknown)=>removed.push(id)})}},
    '../../market/quoteIntegrity':{resolveSessionQuoteActionAvailability:()=>({allowed:true}),quoteActionBlockMessage:()=>''},
    '../../state/activeBrokerSession':{captureActiveBrokerSession:()=>({credentials:{accessToken:'mock-native-token'},session:{accountLogin:'1'}}),
      getActiveBrokerSessionProvenance:()=>({cacheNamespace:'scope',identity:{accountLogin:'1'}}),isActiveBrokerSessionProvenanceCurrent:()=>current},
    '../../query/authenticatedQueryScope':{invalidateSessionQueryRoots:()=>Promise.resolve()},
    './tradeAuthPrompt':{},'../../state/positionsMutationBarrier':{beginProtectedPositionsMutation},
  };
  const code=ts.transpileModule(readFileSync('src/features/trade/closePositionFlow.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:any={};runInNewContext(code,{exports,require:(path:string)=>{if(!imports[path])throw new Error(path);return imports[path];}});
  return {removed,close:()=>exports.closePositionConfirmed({id:'90071992547409931234',symbol:'EURUSD'}, {quote:{bid:1.1,ask:1.2}}),finish:()=>finish(),reject:()=>{fail=true;},switchAccount:()=>{current=false;}};
}
test('confirmed close keeps the position through pending execution, then removes only the confirmed ticket and fences old REST reads',async()=>{
  const h=harness();const read=capturePositionsMutationBarrier();const pending=h.close();
  assert.equal(h.removed.length,0);assert.equal(canCommitUncoordinatedPositionsRead(read),false);
  h.finish();await pending;assert.deepEqual(h.removed,['90071992547409931234']);
  assert.equal(canCommitUncoordinatedPositionsRead(read),false);
});
test('failed close retains the position and a changed account cannot be modified by the old result',async()=>{
  const h=harness();h.reject();const pending=h.close();h.finish();await assert.rejects(pending,/Broker rejected/);assert.equal(h.removed.length,0);
  const changed=harness();const old=changed.close();changed.switchAccount();changed.finish();await old;assert.equal(changed.removed.length,0);
});
test('a confirmed structural socket update invalidates a positions read started before it',()=>{
  const snapshot=capturePositionsMutationBarrier();assert.equal(canCommitUncoordinatedPositionsRead(snapshot),true);
  invalidatePendingPositionsReads();assert.equal(canCommitUncoordinatedPositionsRead(snapshot),false);
  assert.equal(canCommitUncoordinatedPositionsRead(capturePositionsMutationBarrier()),true);
});
