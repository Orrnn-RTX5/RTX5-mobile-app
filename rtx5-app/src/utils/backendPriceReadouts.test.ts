import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeQuoteTickPayload } from '../api/ws/quoteTickNormalizer';
import { applyLiveQuoteTickToSnapshot } from '../features/quotes/liveQuoteSnapshot';
import { resolveChartDisplayDecimals } from '../features/chart/chartPricePrecision';
import { splitFormattedChartTradePrice } from '../features/chart/components/ChartTradeButtonsFeature/pricePresentation';
import { formatBackendPrice } from './backendPrice';
import { fmt } from './format';
import { normalizeHistoryCandle } from '../domain/candles/normalization/candleNormalizer';
import { convertCandlesForChart } from '../domain/candles/normalization/chartAdapter';

test('live readouts follow integer-digit rules regardless of symbol, broker suffix and scale digits', () => {
  const cases = [
    { symbol: 'EURUSD', digits: 5, bid: 1.11854, ask: 1.11867, text: ['1.1185', '1.1187'] },
    { symbol: 'EURUSD.PRO', digits: 5, bid: 1.1184800000000001, ask: 1.11867, text: ['1.1185', '1.1187'] },
    { symbol: 'EURJPY', digits: 3, bid: 176.985, ask: 177.009, text: ['176.99', '177.01'] },
    { symbol: 'USDJPY', digits: 5, bid: 158.23, ask: 158.23899999999998, text: ['158.23', '158.24'] },
    { symbol: 'XAGUSD', digits: 2, bid: 58.872, ask: 58.931, text: ['58.87', '58.93'] },
    { symbol: 'BTCUSD', digits: 8, bid: 82535.65000000001, ask: 82558.15000000001, text: ['82535.65', '82558.15'] },
    { symbol: 'SOLUSD', bid: 114.252, ask: 114.46400000000001, text: ['114.25', '114.46'] },
    { symbol: 'XAUUSD', digits: 5, bid: 4122.237, ask: 4122.459, text: ['4122.24', '4122.46'] },
    { symbol: 'US30', digits: 1, bid: 50685, ask: 50700.2, text: ['50685.00', '50700.20'] },
    { symbol: 'WHOLE', digits: 0, bid: 123, ask: 124, text: ['123.00', '124.00'] },
    { symbol: 'FINE', digits: 12, bid: 1.234567891234, ask: 1.234567891235, text: ['1.2346', '1.2346'] },
  ];
  for (const payload of cases) {
    const normalized = normalizeQuoteTickPayload(payload, 1700000000000);
    assert.equal(normalized.ok, true);
    const tick = { ...normalized.update, receivedAt: 1700000000000, timestamp: 1700000000000 };
    const snapshot = applyLiveQuoteTickToSnapshot(payload.symbol, undefined, tick, 1);
    assert.ok(snapshot);
    for (const side of ['bid', 'ask'] as const) {
      const expected = payload.text[side === 'bid' ? 0 : 1];
      assert.equal(formatBackendPrice(snapshot[side]), expected);
      assert.equal(snapshot[side], payload[side]);
      const parts = splitFormattedChartTradePrice(formatBackendPrice(snapshot[side]));
      assert.equal(parts.leading + parts.trailing, expected);
    }
  }
});

test('price scales keep broker precision independently of readout rules', () => {
  const bid = 58.872;
  const scaleDigits = resolveChartDisplayDecimals({ instrumentDigits: 2, liveQuoteBid: bid, liveQuoteAsk: 58.931 });
  assert.equal(scaleDigits, 2);
  assert.equal(fmt.price(bid, scaleDigits), '58.87');
  assert.equal(formatBackendPrice(bid), '58.87');
  const forexScaleDigits = resolveChartDisplayDecimals({ instrumentDigits: 5, liveQuoteBid: 1.11854, liveQuoteAsk: 1.11867 });
  assert.equal(forexScaleDigits, 5);
  assert.equal(fmt.price(1.11854, forexScaleDigits), '1.11854');
  assert.equal(formatBackendPrice(1.11854), '1.1185');
});

test('BTCUSD OHLC readouts round the screenshot values while candle data stays exact', () => {
  const raw = {
    time: 1791528300, open: 82512.79, high: 82554.83,
    low: 82469.79, close: 82535.65000000001,
  };
  const normalized = normalizeHistoryCandle(raw);
  assert.ok(normalized);
  const [candle] = convertCandlesForChart([normalized]);
  assert.ok(candle);
  const expected = { open: '82512.79', high: '82554.83', low: '82469.79', close: '82535.65' };
  for (const field of ['open', 'high', 'low', 'close'] as const) {
    assert.equal(candle[field], raw[field]);
    assert.equal(formatBackendPrice(candle[field]), expected[field]);
  }
});
