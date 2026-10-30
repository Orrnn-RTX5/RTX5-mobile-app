import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CH_HTML } from '../src/features/chart/rendering/ChartWebViewHtml';
import { buildChartOverlayPayload } from '../src/features/chart/chartOverlays/buildPayload';
import { resolveChartColorsForTheme } from '../src/state/userPreferences/chartColors';

// Standalone actual WebView renderer with mock market/position data. No trading services or credentials.
const directory=resolve('artifacts/chart-position-controls');mkdirSync(directory,{recursive:true});
const context='mock-broker:mock-account:EURUSD:M1';
const now=Math.floor(Date.now()/60000)*60;
const candles=Array.from({length:120},(_,index)=>{
  const open=1.0842+Math.sin(index*0.27)*0.0004+index*0.000003;
  const close=open+Math.cos(index*0.67)*0.00012;
  return{time:now-(119-index)*60,open,close,high:Math.max(open,close)+0.00008,low:Math.min(open,close)-0.00007,volume:1};
});
for(const theme of ['dark','light'] as const){
  const colors=resolveChartColorsForTheme(undefined,'custom',theme==='dark');
  const positions=[{id:'81001',symbol:'EURUSD',side:'buy' as const,volume:0.003,openPrice:1.08447,currentPrice:1.0845,pnl:-0.09,swap:0,openTime:new Date().toISOString(),tp:1.0849,sl:1.08405},
    {id:'81002',symbol:'EURUSD',side:'sell' as const,volume:0.02,openPrice:1.08448,currentPrice:1.0845,pnl:1.24,swap:0,openTime:new Date().toISOString()}];
  const payload=buildChartOverlayPayload({chartSymbol:'EURUSD',candles:[],positions,colors,sellColor:'#ef5350',accountCurrency:'USD',priceDigits:5,volumeStep:0.001,
    positionControlScope:{sessionScope:'mock-broker:mock-account',symbol:'EURUSD',dataContextSig:context,chartGeneration:1},
    showOnChart:{buyTrade:true,sellTrade:true,slTpLevels:true},allowPositionStopDragging:true});
  const data=candles.map(candle=>({...candle,color:candle.close>=candle.open?colors.candlesUptrend:colors.candlesDowntrend}));
  const options={layout:{background:{type:'solid',color:colors.background},textColor:colors.foreground,fontSize:11},
    grid:{vertLines:{visible:false},horzLines:{visible:false}},rightPriceScale:{visible:true,borderVisible:false,minimumWidth:70},
    leftPriceScale:{visible:false},timeScale:{timeVisible:true,secondsVisible:false,borderVisible:false},customColors:colors};
  const setup=`<script>
    window.mockMessages=[];
    window.ReactNativeWebView={postMessage:function(raw){var message=JSON.parse(raw);window.mockMessages.push(message);
      if(message.type==='CHART_READY'){
        setChartOverlays(${JSON.stringify(payload)},${JSON.stringify(context)});
        setLivePriceLine(1.08455);setCandleCountdownTimeframe('M1',${JSON.stringify(context)});setCandleCountdownActive(true);
        document.title='Mocked ${theme} mobile chart — ready';
        setTimeout(function(){
          var labels=Array.from(document.querySelectorAll('[data-rtx5-position-control]'));
          var checks=labels.map(function(label){
            var buttons=Array.from(label.querySelectorAll('button'));
            var tp=buttons.find(function(button){return button._positionAction==='tp';});
            var sl=buttons.find(function(button){return button._positionAction==='sl';});
            var close=buttons.find(function(button){return button._positionAction==='close';});
            var value=label._rtx5ValueSpan;
            if(!tp||!sl||!close||!value)return null;
            var before=label._positionSurface.getBoundingClientRect().width;
            var saved=value.textContent;value.textContent=saved+'00';
            var after=label._positionSurface.getBoundingClientRect().width;
            value.textContent=saved;
            return {ticket:label._positionControl.positionId,
              chipGap:sl._positionChip.getBoundingClientRect().left-tp._positionChip.getBoundingClientRect().right,
              valueFont:getComputedStyle(value).fontSize,chipFont:getComputedStyle(tp._positionChip).fontSize,
              sideFont:getComputedStyle(label._rtx5SideSpan).fontSize,
              valueToClose:close.getBoundingClientRect().left-value.getBoundingClientRect().right,
              labelWidth:label.getBoundingClientRect().width,
              withinPlot:label.getBoundingClientRect().right<=resolveMarketPriceScaleAxisMetrics(document.getElementById('chart')).axisLeft,
              surfaceFollowsText:after>before};
          }).filter(Boolean);
          document.body.setAttribute('data-position-layout-checks',JSON.stringify(checks));
        },1000);
      }
      if(message.type==='CHART_POSITION_ACTION')updatePositionControlState(Object.assign({},message,{state:'success'}));
    }};
    setDisplayDecimals(5);setBrokerPriceStep(0.00001);
    initChart(${JSON.stringify(options)},'candles',${JSON.stringify(data)},5,false,'mock-init','mock-config',${JSON.stringify(context)});
    window.addEventListener('error',function(event){document.title='Preview error: '+event.message;});
  </script>`;
  const mobileStyle='<style>html,body,#chart{width:390px!important;height:740px!important}</style>';
  writeFileSync(resolve(directory,`chart-${theme}.html`),CH_HTML.replace('</head>',mobileStyle+'</head>').replace('</body>',setup+'</body>'));
  if(theme==='dark')writeFileSync(resolve(directory,'chart-landscape.html'),CH_HTML
    .replace('</head>','<style>html,body,#chart{width:844px!important;height:390px!important}</style></head>')
    .replace('</body>',setup+'</body>'));
}
console.log(directory);
