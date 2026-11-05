import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCandleChannel,
  extractCandlePayloadContext,
  getCandlePayloadItems,
  resolveCandlesWsUrl,
  resolveCandleWsTimeframe,
} from './candlesSocketProtocol';
import { normalizeLiveCandle } from '../normalization/candleNormalizer';

test('resolveCandlesWsUrl accepts only an exact validated trading websocket', () => {
  assert.equal(resolveCandlesWsUrl(undefined), '');
  assert.equal(
    resolveCandlesWsUrl('wss://services.alpha-broker.com/ws/v2'),
    'wss://services.alpha-broker.com/ws/v2',
  );
  assert.equal(resolveCandlesWsUrl('wss://services.alpha-broker.com/ws/v2?token=redacted'), '');
});

test('resolveCandlesWsUrl rejects cleartext, raw-IP, and REST origins without synthesis', () => {
  assert.equal(resolveCandlesWsUrl('ws://services.alpha-broker.com/ws/v2'), '');
  assert.equal(resolveCandlesWsUrl('wss://69.197.178.27/ws/v2'), '');
  assert.equal(resolveCandlesWsUrl('https://services.alpha-broker.com/api/v2'), '');
});

test('resolveCandleWsTimeframe maps app timeframes to backend live-channel tokens', () => {
  assert.equal(resolveCandleWsTimeframe('M1'), '1m');
  assert.equal(resolveCandleWsTimeframe('M5'), '5m');
  assert.equal(resolveCandleWsTimeframe('H1'), '1h');
  assert.equal(resolveCandleWsTimeframe('MN'), '1M');
  assert.equal(resolveCandleWsTimeframe('M3'), null);
  assert.equal(resolveCandleWsTimeframe('H2'), null);
  assert.equal(resolveCandleWsTimeframe('bad'), null);
});

test('createCandleChannel preserves exact broker symbols and uses backend websocket timeframe tokens', () => {
  assert.equal(createCandleChannel('EURUSD.c', 'M1'), 'candles.EURUSD.C.1m');
  assert.equal(createCandleChannel('XAUUSDm', 'H1'), 'candles.XAUUSDM.1h');
});

test('extractCandlePayloadContext parses v2 candle channels', () => {
  assert.deepEqual(
    extractCandlePayloadContext({ channel: 'candles.EURUSD.1m' }),
    { symbol: 'EURUSD', tf: 'M1' },
  );
});

test('getCandlePayloadItems unwraps v2 snapshot and update payloads', () => {
  const snapshot = {
    channel: 'candles.EURUSD.1m',
    data: {
      candles: [
        { time: 1777431540, open: 1.17076, high: 1.17076, low: 1.17073, close: 1.17074, volume: 7 },
        { time: 1777431480, open: 1.17083, high: 1.17083, low: 1.17073, close: 1.17074, volume: 13 },
      ],
    },
  };
  const update = {
    channel: 'candles.EURUSD.1m',
    data: {
      candle: { time: 1777431600, open: 1.17074, high: 1.1708, low: 1.1707, close: 1.17078, volume: 5 },
    },
  };
  const directUpdate = {
    channel: 'candles.EURUSD.1m',
    data: {
      type: 'candle',
      symbol: 'EURUSD',
      tf: '1m',
      time: 1777431660,
      open: 1.17078,
      high: 1.17082,
      low: 1.17072,
      close: 1.1708,
      volume: 6,
      closed: false,
    },
  };

  assert.equal(getCandlePayloadItems(snapshot).length, 2);
  assert.deepEqual(getCandlePayloadItems(update), [update.data.candle]);
  assert.deepEqual(getCandlePayloadItems(directUpdate), [directUpdate.data]);
});

test('normalizeLiveCandle keeps candle bucket time separate from backend server_time', () => {
  const candle = normalizeLiveCandle({
    event: 'candle.replace_last',
    channel: 'candles.XAUUSD.1m',
    symbol: 'XAUUSD',
    timeframe: '1m',
    time: '2026-06-30T11:30:00.000Z',
    server_time: '2026-06-30T11:30:12.500Z',
    open: 4030.51,
    high: 4031.16,
    low: 4029.66,
    close: 4031.11,
    volume: 55,
    closed: false,
  });

  assert.ok(candle);
  assert.equal(candle.time, 1782819000);
  assert.equal(candle.updateTime, 1782819012);
  assert.equal(candle.symbol, 'XAUUSD');
  assert.equal(candle.timeframe, 'M1');
  assert.equal(candle.closed, false);
});

test('normalizeLiveCandle maps bridge tf and keeps server candle time as Unix seconds', () => {
  const candle = normalizeLiveCandle({
    type: 'candle',
    symbol: 'EURUSD',
    tf: '1m',
    time: 1_777_431_660,
    open: 1.17078,
    high: 1.17082,
    low: 1.17072,
    close: 1.1708,
    volume: 6,
    closed: false,
  });

  assert.ok(candle);
  assert.equal(candle.timeframe, 'M1');
  assert.equal(candle.time, 1_777_431_660);
  assert.equal(candle.time * 1000, 1_777_431_660_000);
  assert.equal(candle.closed, false);
});
