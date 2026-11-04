import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { CH_HTML } from '../../rtx5-app/src/features/chart/rendering/ChartWebViewHtml';

// Offline visual fixture only: deterministic seeded candles, no broker services,
// credentials, order submission, or production application routes.
const directory = resolve(process.cwd(), '../.codex-artifacts/metatrader-pending-20261016');
const scope = 'visual-fixture:EURUSD:M1';
const closes = [1.12309,1.12315,1.12313,1.12308,1.12319,1.12324,1.12328,1.12336,1.12331,1.12324,1.12334,1.12348,1.12356,1.12354,1.12347,1.12351,1.12349,1.12345,1.12350,1.12353,1.12358,1.12368,1.12382,1.12391,1.12377,1.12379,1.12372,1.12361,1.12367,1.12371,1.12361,1.12354,1.12351,1.12339,1.12331,1.12328,1.12336,1.12342,1.12348,1.12369,1.12378];
const time = Date.parse('2026-10-16T09:23:00Z') / 1000;
const candles = closes.map((close, index) => {
  const open = index === 0 ? 1.12294 : closes[index - 1];
  return { time: time + index * 60, open, close,
    high: Math.max(open, close) + (index % 3 + 1) * 0.000025,
    low: Math.min(open, close) - (index % 4 + 1) * 0.00002, volume: 1 };
});
const colors = {
  background: '#FFFFFF', foreground: '#111111', grid: '#E5E5E5',
  candlesUptrend: '#20A69B', candlesDowntrend: '#F64D51', hollowBody: '#FFFFFF',
  barsUptrend: '#20A69B', barsDowntrend: '#F64D51', lineBody: '#20A69B',
  tradeOpen: '#2962FF', tradeTpSl: '#179C33', tradeStopOut: '#F23645',
};
const options = {
  layout: { background: { type: 'solid', color: colors.background }, textColor: colors.foreground, fontSize: 12 },
  grid: { vertLines: { visible: true, color: colors.grid, style: 2 }, horzLines: { visible: true, color: colors.grid, style: 2 } },
  rightPriceScale: { visible: true, borderVisible: true, borderColor: colors.grid, minimumWidth: 66, scaleMargins: { top: 0, bottom: 0 } },
  leftPriceScale: { visible: false },
  timeScale: { timeVisible: true, secondsVisible: false, borderVisible: true, borderColor: colors.grid, rightOffset: 4, barSpacing: 7.5 },
  customColors: colors,
};
const setup = `<script>
  window.fixtureMessages = [];
  window.fixtureReady = false;
  window.fixtureState = { type: 'Buy Limit', visible: true, entryPrice: 1.12289, stopLimitPrice: 1.12385 };
  var fixtureTypes = ['Buy Limit','Sell Limit','Buy Stop','Sell Stop','Buy Stop Limit','Sell Stop Limit'];
  function notifyFixture() {
    window.parent.postMessage({ source: 'rtx5-pending-visual-fixture', ready: fixtureReady, state: fixtureState }, '*');
  }
  function fixturePayload() {
    if (!fixtureState.visible) return { priceLines: [], markers: [], tradeHistorySegments: [] };
    var color = fixtureState.type.indexOf('Sell') === 0 ? '#F23645' : '#2962FF';
    var lines = [{ id: 'chart-trade-entry-preview', price: fixtureState.entryPrice, color: color,
      lineWidth: 1, lineStyle: 0, axisLabelVisible: false, title: fixtureState.type.toUpperCase() + ' 0.01',
      labelPlacement: 'line', dragKey: 'entry' }];
    if (fixtureState.type.indexOf('Stop Limit') >= 0) lines.push({ id: 'chart-trade-stop-limit-preview',
      price: fixtureState.stopLimitPrice, color: '#000000', lineWidth: 1, lineStyle: 0, axisLabelVisible: false,
      title: 'STOP LIMIT PRICE', labelPlacement: 'line', dragKey: 'stopLimit' });
    return { priceLines: lines, markers: [], tradeHistorySegments: [] };
  }
  function renderFixture() { if (fixtureReady) setChartOverlays(fixturePayload(), ${JSON.stringify(scope)}); notifyFixture(); }
  function lockFixtureRange() {
    rememberManualVerticalPanRange({ from: 1.12204, to: 1.12365 });
    applyManualVerticalPanLockedRange();
    if (chart && chart.timeScale) chart.timeScale().setVisibleLogicalRange({ from: -0.5, to: 44.5 });
    repositionTradeOverlayDomNodes();
  }
  window.fixture = {
    selectType: function(type) {
      if (fixtureTypes.indexOf(type) < 0) return;
      fixtureState.type = type; fixtureState.visible = true; fixtureState.entryPrice = 1.12289;
      renderFixture();
    },
    setVisible: function(visible) { fixtureState.visible = !!visible; renderFixture(); },
    setSecondaryVisible: function(visible) { fixtureState.stopLimitPrice = visible ? 1.12310 : 1.12385; renderFixture(); },
    resetRange: lockFixtureRange,
  };
  window.ReactNativeWebView = { postMessage: function(raw) {
    var message = JSON.parse(raw); fixtureMessages.push(message);
    if (message.type === 'CHART_READY' && !fixtureReady) {
      fixtureReady = true;
      lockFixtureRange(); renderFixture();
      requestAnimationFrame(function() { lockFixtureRange(); renderFixture(); });
      document.title = 'Seeded visual fixture — real RTX5 WebView renderer';
    }
    if (message.type === 'CHART_TRADE_LINE_DRAG' && typeof message.price === 'number') {
      if (message.dragKey === 'entry') fixtureState.entryPrice = message.price;
      if (message.dragKey === 'stopLimit') fixtureState.stopLimitPrice = message.price;
      notifyFixture();
    }
  }};
  window.addEventListener('error', function(event) { document.title = 'Fixture error: ' + event.message; });
  setDisplayDecimals(5); setBrokerPriceStep(0.00001);
  initChart(${JSON.stringify(options)}, 'candles', ${JSON.stringify(candles)}, 5, false, 'visual-fixture-init', 'visual-fixture-config', ${JSON.stringify(scope)});
</script>`;
const chartHtml = CH_HTML.replace('</head>', '<style>html,body,#chart{width:393px!important;height:600px!important;background:#fff!important}</style></head>')
  .replace('</body>', '<div style="position:absolute;top:9px;left:4px;z-index:30;pointer-events:none;font:12px Arial;color:#111"><b style="color:#0879ed">EURUSD⌄</b> M1<br><span style="line-height:18px">Euro vs US Dollar</span></div>' + setup + '</body>');
for (const [index, match] of [...chartHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].entries()) {
  new Script(match[1], { filename: `pending-fixture-script-${index}` });
}
writeFileSync(resolve(directory, 'renderer.html'), chartHtml);
writeFileSync(resolve(directory, 'index.html'), `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pending orders visual fixture</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#e9edf2;color:#182232;font:14px Arial,sans-serif}main{display:flex;align-items:flex-start;gap:28px;max-width:960px;margin:auto}.phone{width:393px;height:851px;flex-shrink:0;background:white;overflow:hidden;box-shadow:0 8px 28px #25324a30}.status{height:28px;padding:9px 22px 0;font-size:12px;color:#555}.toolbar{height:56px;display:flex;align-items:center;justify-content:space-around;color:#555;font-size:23px;border-bottom:1px solid #e4e4e4}.toolbar button{background:none;border:0;color:#267cf1;font-size:25px;cursor:pointer}.frame{display:block;width:393px;height:600px;border:0}.quote{height:36px;display:flex;background:#fafafa}.quote>div{width:112px;background:#347ff4;color:white;padding:4px;font-size:10px}.quote b{display:block;font-size:19px;text-align:right;font-weight:400}.quote .lot{flex:1;background:#fafafa;color:#111;display:flex;align-items:center;justify-content:space-around;font-size:15px}.panel{height:101px;background:#f8f8f8;border-radius:15px 15px 0 0;overflow:hidden}.handle{height:4px;width:40px;background:#ccc;border-radius:4px;margin:5px auto 8px}.panelrow{display:flex;align-items:center;gap:12px;padding:4px 13px 10px}.symbol{color:#0879ed;font-size:18px;font-weight:700;flex:1}.chip{border:1px solid;border-radius:50%;height:32px;width:32px;display:grid;place-items:center;font-size:14px}.sl{color:#e00000}.tp{color:#159630}.arrow{color:#307ff8;font-size:29px}.tabs{display:flex;gap:17px;overflow-x:auto;scrollbar-width:none;white-space:nowrap;padding:5px 10px 9px}.tabs button{border:0;background:none;padding:0;color:#888;font-size:14px;font-weight:700;cursor:pointer}.tabs button.active.buy{color:#0879ed}.tabs button.active.sell{color:#df0000}.nav{height:30px;display:flex;justify-content:space-evenly;align-items:center;color:#888;background:#fff}.controls{max-width:400px}.controls h1{font-size:22px;margin:0 0 12px}.controls p{line-height:1.5}.controls label{display:block;margin:14px 0}.controls button,.controls select{font:inherit;padding:9px;border:1px solid #b7c2d2;background:white;border-radius:6px}.typebuttons{display:grid;grid-template-columns:1fr 1fr;gap:8px}.typebuttons button.active{background:#e0ebff;border-color:#2962ff}.value{font:13px monospace;background:#fff;padding:12px;line-height:1.8;border-radius:8px}.note{font-size:12px;color:#526174}.bare{padding:0;background:#fff}.bare main{margin:0}.bare .controls{display:none}.bare .phone{box-shadow:none}@media(max-width:700px){body{padding:0}main{flex-direction:column;align-items:center}.controls{padding:20px}}
</style></head><body><main><div class="phone" id="phone"><div class="status">12:33 PM <span style="float:right">▮▮▮ 83% ▰</span></div><div class="toolbar"><span>☰</span><span>⌖</span><span>ƒ</span><span style="font-size:16px;font-weight:bold">M1</span><button id="clock" aria-label="Show or hide pending preview">◷</button><span style="color:#307ff8">▣</span></div><iframe class="frame" id="chart" title="Actual RTX5 chart renderer" src="renderer.html"></iframe><div class="quote"><div>SELL<b>1.12384</b></div><div class="lot">⌄ <span>0.01</span>⌃</div><div>BUY<b>1.12385</b></div></div><div class="panel" id="panel"><div class="handle"></div><div class="panelrow"><span class="symbol">EURUSD ⌃</span><span class="chip sl">SL</span><span class="chip tp">TP</span><span class="arrow">→</span></div><div class="tabs" id="tabs"></div></div><div class="nav"><span>■</span><span>◉</span><span>◀</span></div></div><aside class="controls"><h1>Pending order renderer</h1><p>Real RTX5 WebView chart at a 393 × 851 phone viewport. Compare lines, labels, handles, and price markers against the captured MetaTrader reference.</p><div class="typebuttons" id="types"></div><label><input type="checkbox" id="visible" checked> Show draft</label><label><input type="checkbox" id="secondary"> Bring stop-limit secondary into view</label><button id="reset">Restore reference chart range</button><p class="value" id="values">Loading renderer…</p><p class="note">VISUAL FIXTURE: candles and quote values are deterministic seeded data. This page has no broker connection, credentials, trade submissions, or application routes. The surrounding phone frame is a comparison scaffold; its chart, pending lines, rings, price boxes, and drag behavior use the actual CH_HTML code.</p><p class="note">Use <code>?type=Sell%20Stop%20Limit&amp;bare=1</code> for an uncluttered phone screenshot. Add <code>&amp;secondary=1</code> for both visible stop-limit levels.</p></aside></main>
<script>
const types=['Buy Limit','Sell Limit','Buy Stop','Sell Stop','Buy Stop Limit','Sell Stop Limit'];
const params=new URLSearchParams(location.search),selected=params.get('type')||types[0];
if(params.get('bare')==='1')document.body.classList.add('bare');
let initialized=false, state={type:selected,visible:true};
const frame=document.getElementById('chart');
function api(){return frame.contentWindow.fixture}
function choose(type){api()?.selectType(type)}
for(const holder of ['tabs','types'])for(const type of types){const button=document.createElement('button');button.textContent=type;button.dataset.type=type;button.onclick=()=>choose(type);document.getElementById(holder).appendChild(button)}
function paint(){for(const button of document.querySelectorAll('[data-type]'))button.className=(button.dataset.type===state.type?'active ':'')+(button.dataset.type.startsWith('Sell')?'sell':'buy');document.getElementById('visible').checked=state.visible;document.getElementById('panel').style.visibility=state.visible?'visible':'hidden';document.getElementById('values').textContent=[state.type+' · 0.01 lots','Entry: '+Number(state.entryPrice).toFixed(5),'Stop limit: '+Number(state.stopLimitPrice).toFixed(5)].join(String.fromCharCode(10));document.getElementById('values').style.whiteSpace='pre-line';document.title=state.type+' — seeded RTX5 visual fixture'}
window.addEventListener('message',function(event){if(event.data?.source!=='rtx5-pending-visual-fixture')return;state=event.data.state;if(event.data.ready&&!initialized){initialized=true;api().selectType(types.includes(selected)?selected:types[0]);if(params.get('secondary')==='1'){document.getElementById('secondary').checked=true;api().setSecondaryVisible(true)}}paint()});
document.getElementById('clock').onclick=()=>api()?.setVisible(!state.visible);
document.getElementById('visible').onchange=event=>api()?.setVisible(event.target.checked);
document.getElementById('secondary').onchange=event=>api()?.setSecondaryVisible(event.target.checked);
document.getElementById('reset').onclick=()=>api()?.resetRange();
</script></body></html>`);
for (const match of readFileSync(resolve(directory, 'index.html'), 'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
  new Script(match[1], { filename: 'pending-fixture-shell' });
}
console.log(`Real-renderer fixture written to ${directory}`);
