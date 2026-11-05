import assert from 'node:assert/strict';
import test from 'node:test';
import { PendingOrderPayloadError, buildPendingOrderRequestBody, normalizePendingOrderType } from './pendingOrderPayload';
import type { PendingOrderType } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base = { account_login: 200019, symbol: 'BTCUSD', side: 'buy' as const, type: 'buy_limit', volume: 0.01, price: 100 };
const types: PendingOrderType[] = ['buy_limit','sell_limit','buy_stop','sell_stop','buy_stop_limit','sell_stop_limit'];

for (const type of types) test(type + ' sends a strict numeric payload and a new UUID for each submission', () => {
  const side: 'sell' | 'buy' = type.startsWith('sell') ? 'sell' : 'buy';
  const input = { ...base, type, side, price_limit: 99, broker_id: 'local-only', trailing_stop: 3, trailing_step: 1, magic: 42 };
  const body = buildPendingOrderRequestBody(input);
  assert.match(String(body.client_order_id), UUID);
  assert.notEqual(buildPendingOrderRequestBody(input).client_order_id, body.client_order_id);
  assert.equal(body.account_login, 200019);
  assert.equal(body.side, side.toUpperCase());
  assert.equal(body.type, type);
  assert.equal(body.volume, 0.01);
  assert.equal(body.price, 100);
  assert.equal(body.time_in_force, 'GTC');
  assert.equal(Object.hasOwn(body, 'price_limit'), type.endsWith('_stop_limit'));
  for(const field of ['broker_id','trailing_stop','trailing_step','magic','price_sl','price_tp','stopLimitPrice','expiration','expiry']) {
    assert.equal(Object.hasOwn(body,field), false, field);
  }
});

test('all six labels normalize and unsupported types fail closed', () => {
  assert.equal(normalizePendingOrderType('Buy Stop Limit'),'buy_stop_limit');
  assert.equal(normalizePendingOrderType('SELL-STOP-LIMIT'),'sell_stop_limit');
  assert.equal(normalizePendingOrderType('market'),null);
  assert.throws(()=>buildPendingOrderRequestBody({...base,type:'market'}),PendingOrderPayloadError);
  assert.throws(()=>buildPendingOrderRequestBody({...base,type:'buy_stop_limit'}),PendingOrderPayloadError);
  assert.throws(()=>buildPendingOrderRequestBody({...base,type:'sell_limit'}), /side/);
});

test('blank, null and zero protection are omitted; positive values are tick-rounded numbers', () => {
  for(const input of [{sl:null,tp:null},{sl:0,tp:0},{sl:'',tp:'0'}]) {
    const body=buildPendingOrderRequestBody({...base,...input});
    assert.equal(Object.hasOwn(body,'sl'),false);
    assert.equal(Object.hasOwn(body,'tp'),false);
  }
  const body=buildPendingOrderRequestBody({...base,price:100.12,sl:98.87,tp:101.13,digits:2,tickSize:0.25});
  assert.equal(body.price,100);
  assert.equal(body.sl,98.75);
  assert.equal(body.tp,101.25);
  assert.throws(()=>buildPendingOrderRequestBody({...base,sl:101}), /entry price/);
  assert.throws(()=>buildPendingOrderRequestBody({...base,sl:-1}), PendingOrderPayloadError);
});

test('stop-limit protection is validated against price_limit', () => {
  const body=buildPendingOrderRequestBody({...base,type:'buy_stop_limit',price:110,price_limit:100,sl:99,tp:101});
  assert.equal(body.price_limit,100);
  assert.throws(()=>buildPendingOrderRequestBody({...base,type:'buy_stop_limit',price:110,price_limit:100,sl:105}), /entry price/);
});

test('GTC omits expiry, GTD uses whole seconds and DAY chooses local end-of-day', () => {
  const future=Math.floor(Date.now()/1000)+3600;
  assert.equal(buildPendingOrderRequestBody({...base,time_in_force:'GTD',expiry:future}).expiry,future);
  assert.equal(Object.hasOwn(buildPendingOrderRequestBody({...base,time_in_force:'GTC',expiry:future}),'expiry'),false);
  const day=buildPendingOrderRequestBody({...base,time_in_force:'DAY'});
  const end=new Date(Number(day.expiry)*1000);
  assert.equal(end.getHours(),23); assert.equal(end.getMinutes(),59); assert.equal(end.getSeconds(),59);
  for(const expiry of [Date.now(),future+0.5,0]) assert.throws(()=>buildPendingOrderRequestBody({...base,time_in_force:'GTD',expiry}),PendingOrderPayloadError);
});

test('invalid account, volume, precision and ambiguous protection aliases cannot reach the wire', () => {
  for(const input of [{account_login:'200019x'},{account_login:1.5},{volume:0},{volume:NaN},{volume:0.123456789},{price:Infinity}]) {
    assert.throws(()=>buildPendingOrderRequestBody({...base,...input}), PendingOrderPayloadError);
  }
  assert.throws(()=>buildPendingOrderRequestBody({...base,sl:99,price_sl:99}),PendingOrderPayloadError);
  const future=Math.floor(Date.now()/1000)+3600;
  assert.throws(()=>buildPendingOrderRequestBody({...base,expiry:future,expiration:future}),PendingOrderPayloadError);
});
