import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';
import { POSITION_CONTROLS_WEBVIEW_JS } from '../../src/features/chart/rendering/positionControlsScript';
import { CH_HTML } from '../../src/features/chart/rendering/ChartWebViewHtml';
import { extractFunctionBody } from '../support/chartSourceTestUtils';

const source=readFileSync('src/features/chart/rendering/ChartWebViewHtml.ts','utf8');
test('the complete generated WebView document compiles, including all embedded bridge and gesture code',()=>{
  const scripts=[...CH_HTML.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length>=5);
  scripts.forEach((script,index)=>assert.doesNotThrow(()=>new Script(script[1],{filename:`chart-script-${index}`})));
});
class Node {
  style:Record<string,string>={}; attributes:Record<string,string>={}; children:Node[]=[]; parentNode:Node|null=null;
  listeners:Record<string,Function>={}; _text=''; _positionControl:any; _rtx5SideSpan:any; _rtx5ValueSpan:any;
  constructor(public nodeName='DIV'){}
  set textContent(text:string){this._text=text;this.children=[];}
  get textContent():string{return this._text+this.children.map(child=>child.textContent).join('');}
  setAttribute(key:string,value:string){this.attributes[key]=value;}
  removeAttribute(key:string){delete this.attributes[key];}
  appendChild(child:Node){this.children.push(child);child.parentNode=this;return child;}
  querySelectorAll(tag:string):Node[]{return this.children.flatMap(child=>[...(child.nodeName===tag.toUpperCase()?[child]:[]),...child.querySelectorAll(tag)]);}
  addEventListener(type:string,callback:Function){this.listeners[type]=callback;}
  setPointerCapture(_id:number){}
  releasePointerCapture(_id:number){}
  getBoundingClientRect(){return{left:parseFloat(this.style.left)||0,top:parseFloat(this.style.top)||0,width:150,height:parseFloat(this.style.height)||48};}
}
function harness(width=330,height=300){
  const nodes:Record<string,Node>={}; const messages:any[]=[]; const layer=new Node(); const windowListeners:Record<string,Function>={};
  const context:any={document:{createElement:(tag:string)=>new Node(tag.toUpperCase())},_overlayDomNodesByKey:nodes,
    lastInitDataContextSig:'scope:EURUSD:M1',lastChartBackgroundColor:'#111827',
    resolvePrimaryPaneMetrics:()=>({leftAxisWidth:0,paneWidth:width,paneHeight:height}),
    resolveMarketPriceScaleAxisMetrics:()=>({axisLeft:width,axisWidth:60}),
    resolveTradeOverlayPaneBounds:()=>({top:0,bottom:height}),
    series:{priceToCoordinate:(price:number)=>price},_appliedOverlayPayload:null,_overlayPayload:null,_overlayLabelLayer:layer,
    ensureOverlayLabelLayer:()=>layer,renderTradeHistorySegmentDom(){},renderPendingOrderDraftAdornment(){},
    resolveAnchoredOverlayLabelLane:()=>({}),applyAnchoredOverlayLabelLane(){},applyPendingOrderDraftLabelLayout(){},
    isTradeOverlayYInsidePane:(y:number,bounds:any)=>y>=bounds.top&&y<=bounds.bottom,
    upsertOverlayDomNode:(_:Node,key:string)=>nodes[key]??(nodes[key]=layer.appendChild(new Node())),
    window:{addEventListener:(type:string,fn:Function)=>{windowListeners[type]=fn;},ReactNativeWebView:{postMessage:(raw:string)=>messages.push(JSON.parse(raw))}},
    isOpenPositionOverlayLine:(item:any)=>item.id.startsWith('open-'),
    OVERLAY_LABEL_LINE_HEIGHT:14,OVERLAY_LABEL_LINE_GAP:2,OVERLAY_POSITION_BOX_HEIGHT:18,resolvePositionBoxGap:()=>4};
  const runtime=runInNewContext(`${POSITION_CONTROLS_WEBVIEW_JS}
    function isPendingOrderDraftLine(line){${extractFunctionBody(source,'isPendingOrderDraftLine')}}
    function resolveAnchoredOverlayLabelTops(labels){${extractFunctionBody(source,'resolveAnchoredOverlayLabelTops')}}
    function repositionTradeOverlayDomNodes(){${extractFunctionBody(source,'repositionTradeOverlayDomNodes')}}
    ({renderPositionControl,updatePositionControlState,resolveAnchoredOverlayLabelTops,repositionTradeOverlayDomNodes});`,context);
  const item=(id='81',y=100):any=>({id:'open-'+id,y,paneVisible:true,labelSideText:'BUY 0.003',labelValueText:'-0.09000 EUR',
    color:'#2962FF',labelSideColor:'#2962FF',labelValueColor:'#ff4d4f',
    positionControl:{positionId:id,positionKey:'scoped-'+id,symbol:'EURUSD',sessionScope:'scope',dataContextSig:context.lastInitDataContextSig,chartGeneration:2,fontScale:1}});
  const render=(record=item(),top=76)=>{const label=nodes['label:anchored:'+record.id]??(nodes['label:anchored:'+record.id]=layer.appendChild(new Node()));
    runtime.renderPositionControl(label,record,top,layer,[],'label:anchored:'+record.id);return label;};
  return{runtime,nodes,messages,item,render,context,windowListeners};
}
const event=(x=0,y=0)=>({clientX:x,clientY:y,preventDefault(){},stopPropagation(){}});
const control=(node:Node,action:string)=>node.querySelectorAll('button').find(button=>(button as any)._positionAction===action)!;

test('position bars keep their real price coordinate and hide rather than shift over the symbol/OHLC header',()=>{
  const h=harness(500,500);const item=h.item('81',30);item.labelMinTop=90;
  let top=h.runtime.resolveAnchoredOverlayLabelTops([item])[0];
  const label=h.render(item,top);
  assert.equal(label.style.top,'6px');assert.equal(label.style.visibility,'hidden');
  item.y=200;top=h.runtime.resolveAnchoredOverlayLabelTops([item])[0];h.render(item,top);
  assert.equal(label.style.top,'176px');assert.equal(label.style.visibility,'visible');
  item.y=100;top=h.runtime.resolveAnchoredOverlayLabelTops([item])[0];h.render(item,top);
  assert.equal(label.style.top,'76px');assert.equal(label.style.visibility,'hidden');
});

test('multiple position bars remain centered on their own entry prices without stacking them at different price levels',()=>{
  const h=harness(330,500);
  const records=[h.item('81',150),h.item('82',160),h.item('83',300)];
  const tops=h.runtime.resolveAnchoredOverlayLabelTops(records);
  records.forEach((record,index)=>assert.equal(tops[index]+24,record.y));
  records.forEach(record=>{record.y+=50;});
  const next=h.runtime.resolveAnchoredOverlayLabelTops(records);
  records.forEach((record,index)=>assert.equal(next[index]+24,record.y));
});

test('swiping the position buttons never detaches a bar from its entry level or submits a trade action',()=>{
  for(const action of ['tp','sl','details','close']){
    const h=harness(500,500),item=h.item('81',200);
    const label=h.render(item,h.runtime.resolveAnchoredOverlayLabelTops([item])[0]),button=control(label,action);
    button.listeners.pointerdown({...event(30,200),pointerId:1});
    button.listeners.pointermove({...event(90,260),pointerId:1});
    button.listeners.pointerup({...event(90,260),pointerId:1});button.listeners.click(event());
    assert.equal(label.style.top,'176px');assert.equal(label.style.left,'8px');assert.equal(h.messages.length,0);
  }
});

test('touch swipes also keep the position bar on its actual entry and suppress accidental modification',()=>{
  const h=harness(500,500),item=h.item('81',200),label=h.render(item,176),button=control(label,'sl');
  button.listeners.touchstart({...event(),touches:[event(20,200)]});
  button.listeners.touchmove({...event(),touches:[event(120,300)]});
  button.listeners.touchend(event());button.listeners.click(event());
  assert.equal(label.style.top,'176px');assert.equal(label.style.left,'8px');assert.equal(h.messages.length,0);
});

test('a tap still opens TP/SL; multitouch, cancellation and close-button swipes cannot relocate the bar',()=>{
  for(const action of ['tp','sl']){
    const h=harness(500,500),label=h.render(),button=control(label,action);
    button.listeners.pointerdown({...event(20,100),pointerId:1});
    button.listeners.pointerup({...event(21,102),pointerId:1});
    button.listeners.lostpointercapture(event());
    button.listeners.click(event(21,102));assert.equal(h.messages[0].action,action);
  }
  for(const action of ['tp','close']){
    const h=harness(500,500),label=h.render(),button=control(label,action);
    button.listeners.pointerdown({...event(20,100),pointerId:1});
    h.windowListeners.pointerdown({pointerType:'touch',pointerId:1});
    h.windowListeners.pointerdown({pointerType:'touch',pointerId:2});
    button.listeners.pointermove({...event(100,200),pointerId:1});
    button.listeners.pointercancel(event());button.listeners.click(event());
    assert.equal(label.style.top,'76px');assert.equal(label.style.left,'8px');assert.equal(h.messages.length,0);
  }
});

test('disabled TP/SL actions remain inert after pointer movement',()=>{
  const h=harness(500,500),item=h.item('81',200);item.positionControl.modifyDisabledReason='Unavailable';
  const label=h.render(item,176),button=control(label,'tp');
  button.listeners.pointerdown(event(20,200));button.listeners.pointermove(event(20,300));
  button.listeners.pointerup(event(20,300));button.listeners.click(event());
  assert.equal(label.style.top,'176px');assert.equal(h.messages.length,0);
});

test('compact controls preserve side/profit colors, actual lots/currency, 48px targets, native details and close access',()=>{
  const h=harness();const node=h.render(); const buttons=node.querySelectorAll('button');
  assert.equal(buttons.length,4);assert.equal(node._rtx5SideSpan.textContent,'BUY 0.003');assert.equal(node._rtx5SideSpan.style.color,'#2962FF');
  assert.equal(node._rtx5ValueSpan.style.color,'#ff4d4f');assert.match(node._rtx5ValueSpan.textContent,/EUR/);
  for(const button of buttons)assert.equal(button.style.minHeight,'48px');
  assert.equal(node.style.pointerEvents,'none');assert.equal(buttons[0].style.pointerEvents,'auto');
  control(node,'details').listeners.click(event());assert.equal(h.messages[0].action,'details');assert.equal(h.messages[0].chartGeneration,2);
  assert.equal(h.messages[0].positionId,'81');assert.equal(buttons[1].attributes['aria-busy'],'true');
});

test('panning over a control and cancelled touch cannot execute a position action; keyboard activation works',()=>{
  const h=harness();const button=control(h.render(),'close');
  button.listeners.pointerdown(event(10,10));button.listeners.pointermove(event(10,50));button.listeners.click(event());
  assert.equal(h.messages.length,0);
  button.listeners.touchstart({...event(),touches:[event(1,1)]});button.listeners.touchmove({...event(),touches:[event(1,25)]});button.listeners.click(event());
  assert.equal(h.messages.length,0);
  button.listeners.pointerdown(event());button.listeners.pointercancel(event());button.listeners.click(event());assert.equal(h.messages.length,0);
  button.listeners.pointerdown(event());button.listeners.click(event());assert.equal(h.messages[0].action,'close');
});

test('pending controls prevent double taps, exact request errors restore controls; stale scoped results do nothing',()=>{
  const h=harness();const node=h.render();const button=control(node,'close');button.listeners.click(event());button.listeners.click(event());
  assert.equal(h.messages.length,1);
  const request=h.messages[0];h.runtime.updatePositionControlState({...request,chartGeneration:1,state:'error'});assert.equal((button as any).disabled,true);
  h.runtime.updatePositionControlState({...request,state:'error',message:'Broker rejected close'});assert.equal((button as any).disabled,false);
  assert.equal(node.attributes.title,'Broker rejected close');button.listeners.pointerdown(event());button.listeners.click(event());assert.equal(h.messages.length,2);
});

test('pinching across a close control cannot execute a trade, while deliberate accessible keyboard clicks remain usable',()=>{
  const h=harness();const button=control(h.render(),'close');
  h.windowListeners.pointerdown({pointerType:'touch',pointerId:1});h.windowListeners.pointerdown({pointerType:'touch',pointerId:2});
  button.listeners.pointerdown(event());button.listeners.click(event());assert.equal(h.messages.length,0);
  h.windowListeners.pointerup({pointerId:2});h.windowListeners.pointerup({pointerId:1});button.listeners.click(event());assert.equal(h.messages.length,0);
  button.listeners.click({...event(),detail:0});assert.equal(h.messages[0].action,'close');
});

test('landscape exposes chips and secondary actions; disabled capabilities remain explained and inert',()=>{
  const h=harness(780);const item=h.item();item.positionControl.modifyDisabledReason='Broker modifications unavailable';
  const buttons=h.render(item).querySelectorAll('button');assert.equal(buttons.length,7);
  const tp=buttons.find(button=>(button as any)._positionAction==='tp')!;assert.equal((tp as any).disabled,true);
  assert.equal((tp as any)._disabledReason,'Broker modifications unavailable');tp.listeners.click(event());assert.equal(h.messages.length,0);
});

test('coincident entries stay at their exact level and preserve each ticket identity',()=>{
  const h=harness(330,300);const records=Array.from({length:10},(_,index)=>h.item(String(81+index),180));
  const tops=h.runtime.resolveAnchoredOverlayLabelTops(records);
  records.forEach((record,index)=>{
    assert.equal(tops[index],156);
    const label=h.render(record,tops[index]);
    assert.equal(label._positionControl.positionId,String(81+index));
  });
});

test('context changes clear presentation pending state and reject old chart actions',()=>{
  const h=harness();const old=h.item();control(h.render(old),'close').listeners.click(event());
  h.context.lastInitDataContextSig='scope:EURUSD:M5';const next=h.item();const label=h.render(next);
  assert.equal((control(label,'close') as any).disabled,false);
  h.runtime.updatePositionControlState({...h.messages[0],state:'pending'});assert.equal((control(label,'close') as any).disabled,false);
});

test('scoped modification and trade state queues before overlay readiness, disables the exact ticket and recovers from failure',()=>{
  const h=harness();const item=h.item();
  h.runtime.updatePositionControlState({...item.positionControl,source:'modification',state:'pending'});
  const node=h.render(item);assert.equal((control(node,'close') as any).disabled,true);
  const other=h.render(h.item('82'));assert.equal((control(other,'close') as any).disabled,false);
  h.runtime.updatePositionControlState({...item.positionControl,source:'modification',state:'error',message:'Invalid stops'});
  assert.equal((control(node,'close') as any).disabled,false);assert.equal(node.attributes.title,'Invalid stops');
  h.runtime.updatePositionControlState({...item.positionControl,source:'position-mutation',state:'pending'});
  assert.equal((control(node,'close') as any).disabled,true);
  h.runtime.updatePositionControlState({...item.positionControl,source:'position-mutation',state:'success'});
  assert.equal((control(node,'close') as any).disabled,false);
});

test('portrait TP and SL stay visible, have distinct chip colors, and send exact scoped ticket actions',()=>{
  for(const action of ['tp','sl']){
    const h=harness();const node=h.render();const button=control(node,action);
    const tp=(control(node,'tp') as any)._positionChip,sl=(control(node,'sl') as any)._positionChip;
    assert.notEqual(tp.style.color,sl.style.color);
    assert.equal(button.attributes['aria-label'],`Modify ${action==='tp'?'take profit':'stop loss'} for position 81`);
    button.listeners.click(event());assert.equal(h.messages[0].action,action);assert.equal(h.messages[0].positionId,'81');
    assert.equal(h.messages[0].sessionScope,'scope');assert.equal(h.messages[0].chartGeneration,2);
  }
  const h=harness();const item=h.item();item.positionControl.modifyDisabledReason='Broker does not support modification';
  const node=h.render(item);for(const action of ['tp','sl']){
    const button=control(node,action);assert.equal((button as any).disabled,true);button.listeners.click(event());
  }
  assert.equal(h.messages.length,0);
});

test('narrow phone plots and large text keep a single compact TP/SL strip centered on the entry price',()=>{
  for(const [width,scale] of [[180,1],[280,1],[300,1],[315,1],[330,1.6],[280,2]]){
    const h=harness(width,500);const records=[h.item('81',260),h.item('82',260)];
    records.forEach(item=>{item.positionControl.fontScale=scale;});
    const tops=h.runtime.resolveAnchoredOverlayLabelTops(records);const height=48*scale;
    assert.equal(tops[0]+height/2,260);assert.equal(tops[1]+height/2,260);
    const node=h.render(records[0],tops[0]);assert.equal(node.style.display,'flex');assert.equal(node.style.height,height+'px');
    assert.equal(node.querySelectorAll('button').length,4);
    assert.deepEqual(node.querySelectorAll('button').map(button=>(button as any)._positionAction),['tp','sl','details','close']);
    assert.equal(node.style.background,'transparent');
    assert.equal((node as any)._positionSurface.style.height,20*scale+'px');
    assert.ok(Math.abs(parseFloat((node as any)._positionSurface.style.top)-14*scale)<0.001);
    assert.equal(control(node,'details').style.flex,'1 1 auto');
    assert.equal(node._rtx5ValueSpan.style.textOverflow,'ellipsis');
    for(const button of node.querySelectorAll('button'))assert.equal(button.style.minHeight,48*scale+'px');
  }
});

test('position TP/SL controls follow the price projection during pan, zoom and quote refreshes',()=>{
  const h=harness(330,500);const first=h.item('81',260);
  const node=h.render(first,h.runtime.resolveAnchoredOverlayLabelTops([first])[0]);
  for(const y of [100,420,-800,1200,260]){
    const next=h.item('81',y);next.paneVisible=y>=0&&y<=500;next.labelValueText='+1.23000 EUR';
    const top=h.runtime.resolveAnchoredOverlayLabelTops([next])[0];h.render(next,top);
    assert.equal(top+24,y);assert.equal(node.style.top,(y-24)+'px');
    assert.equal(node.style.visibility,y>=24&&y<=476?'visible':'hidden');
    assert.equal(node._rtx5ValueSpan.textContent,'+1.23000 EUR');
  }
  control(node,'sl').listeners.click(event());assert.equal(h.messages[0].positionId,'81');
});

test('reordered position payloads keep every ticket on its current projected price',()=>{
  const h=harness(330,500),records=[h.item('81',100),h.item('82',200)];
  h.runtime.resolveAnchoredOverlayLabelTops(records);
  const next=[h.item('82',330),h.item('81',170)];
  const tops=h.runtime.resolveAnchoredOverlayLabelTops(next);
  assert.equal(tops[0],306);assert.equal(tops[1],146);
});

test('pane resizing never clamps a bar away from its actual entry coordinate',()=>{
  const h=harness(330,500),item=h.item('81',400);
  h.render(item,h.runtime.resolveAnchoredOverlayLabelTops([item])[0]);
  h.context.resolveTradeOverlayPaneBounds=()=>({top:0,bottom:200});item.paneVisible=false;
  const top=h.runtime.resolveAnchoredOverlayLabelTops([item])[0];
  assert.equal(top,376);assert.equal(h.render(item,top).style.visibility,'hidden');
});

test('position controls hide offscreen and reappear at the correct price when scrolled back',()=>{
  const h=harness(330,500),item=h.item('81',-100);item.paneVisible=false;
  let top=h.runtime.resolveAnchoredOverlayLabelTops([item])[0];assert.equal(h.render(item,top).style.visibility,'hidden');
  item.y=200;item.paneVisible=true;top=h.runtime.resolveAnchoredOverlayLabelTops([item])[0];
  assert.equal(h.render(item,top).style.visibility,'visible');assert.equal(top,176);
  item.y=700;item.paneVisible=false;top=h.runtime.resolveAnchoredOverlayLabelTops([item])[0];
  assert.equal(top,676);assert.equal(h.render(item,top).style.visibility,'hidden');
});

test('the gesture reposition pass keeps controls, entry lines and axis boxes aligned to the same price',()=>{
  const h=harness(330,500);const item=h.item('81',260);const label=h.render(item);
  const line=h.nodes['line:'+item.id]=new Node();const box=h.nodes['box:'+item.id]=new Node();
  h.context._overlayPayload={priceLines:[{...item,price:260}]};
  h.runtime.repositionTradeOverlayDomNodes();
  assert.equal(label.style.top,'236px');assert.equal(line.style.top,'260px');assert.equal(box.style.top,'251px');
  h.context.series.priceToCoordinate=(price:number)=>price-400;
  h.runtime.repositionTradeOverlayDomNodes();
  assert.equal(label.style.top,'-164px');assert.equal(label.style.visibility,'hidden');
  assert.equal(line.style.top,'-140px');assert.equal(box.style.top,'-149px');
  assert.equal(line.style.visibility,'hidden');assert.equal(box.style.visibility,'hidden');
  h.context.series.priceToCoordinate=(price:number)=>price*1.5;
  h.runtime.repositionTradeOverlayDomNodes();
  assert.equal(label.style.top,'366px');assert.equal(line.style.top,'390px');assert.equal(box.style.top,'381px');
  assert.equal(line.style.visibility,'visible');assert.equal(box.style.visibility,'visible');
  assert.equal(h.messages.length,0,'chart gestures cannot submit a position action');
});

test('broker formatter and every main-scale series use instrument precision and tick increment',()=>{
  const body=extractFunctionBody(source,'formatChartBrokerPrice');const make=extractFunctionBody(source,'makePriceFormat');
  const context:any={lastDisplayDecimals:5,lastBrokerPriceStep:0.00001};
  const runtime=runInNewContext(`function formatChartBrokerPrice(value){${body}}function makePriceFormat(displayDecimals){${make}}({formatChartBrokerPrice,makePriceFormat})`,context);
  for(const [price,digits,step]of [[1.10017,5,0.00001],[149.123,3,0.001],[2711.123,3,0.001],[31.1234,4,0.0001],[61000.12,2,0.01],[42001.5,1,0.5],[0.0000011234,10,1e-10]]){
    context.lastDisplayDecimals=digits;context.lastBrokerPriceStep=step;
    assert.equal(runtime.formatChartBrokerPrice(price),price.toFixed(digits));assert.equal(runtime.makePriceFormat(digits).minMove,step);
  }
  assert.doesNotMatch(source,/formatter: formatValueBasedPrice/);
  assert.match(source,/makePriceFormat\(displayDecimals\)[\s\S]*series = chart\.addSeries/);
});

test('entry lines and price boxes remain at actual coordinates; price pan uses RAF reposition and deliberate stop hold',()=>{
  const reposition=extractFunctionBody(source,'repositionTradeOverlayDomNodes');
  assert.match(reposition,/var rowY = record\.y/);
  assert.match(source,/Math\.hypot\(holdPoint\.x[\s\S]*> 8\) cancelPositionStopHold/);
  assert.match(source,/}, 320\);/);
  assert.match(source,/postChartTradeLineDrag\(cancelled \? 'cancel' : 'end'/);
});
