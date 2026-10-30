import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { parseChartPositionStopDragKey } from './chartOverlays/positionStopDragKeys';
import { normalizeChartOverlaySymbol } from './chartOverlays/symbolUtils';

test('settled/cancelled stop previews restore the selected native panel from broker levels and never overwrite a newer drag',()=>{
  const source=readFileSync('src/features/chart/ChartScreen.native.tsx','utf8');
  const tree=ts.createSourceFile('chart.tsx',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.TSX);
  let callback='';
  function visit(node:ts.Node){
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='clearChartPositionStopDragPreview'
      &&node.initializer&&ts.isCallExpression(node.initializer))callback=node.initializer.arguments[0].getText(tree);
    ts.forEachChild(node,visit);
  }
  visit(tree);assert.ok(callback);
  const preview:any={current:{'position-stop:sl:81':1.101}};const calls:any[]=[];let values:any={...preview.current};
  let position:any={id:'81',symbol:'EURUSD',sl:0,tp:1.12};const selection={current:{id:'81',symbol:'EURUSD'}};
  const exports:any={};runInNewContext(ts.transpileModule(`exports.clear=${callback};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{
    exports,chartPositionStopPreviewValuesRef:preview,chartPositionStopSelectionRef:selection,parseChartPositionStopDragKey,normalizeChartOverlaySymbol,
    usePositionsState:{getState:()=>({positions:[position]})},setChartPositionStopDragPreviews:(fn:Function)=>{values=fn(values);},
    setChartTradeSlPrice:(value:number)=>calls.push(['slPrice',value]),setChartTradeSlEnabled:(value:boolean)=>calls.push(['slEnabled',value]),
    setChartTradeTpPrice:(value:number)=>calls.push(['tpPrice',value]),setChartTradeTpEnabled:(value:boolean)=>calls.push(['tpEnabled',value]),
  });
  exports.clear('position-stop:sl:81',1.101);assert.deepEqual(calls,[['slPrice',0],['slEnabled',false]]);
  assert.equal(values['position-stop:sl:81'],undefined);assert.equal(position.tp,1.12);
  calls.length=0;values={'position-stop:sl:81':1.102};preview.current={...values};position.sl=1.101;
  exports.clear('position-stop:sl:81',1.101);assert.equal(calls.length,0);assert.equal(values['position-stop:sl:81'],1.102);
  exports.clear('position-stop:sl:81',1.102);assert.deepEqual(calls,[['slPrice',1.101],['slEnabled',true]]);
  calls.length=0;selection.current.id='82';exports.clear('position-stop:sl:81');assert.equal(calls.length,0);
});
