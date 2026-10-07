import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveAreaChartColor,
  resolveAreaChartDirection,
  resolveAreaChartDirectionForRange,
} from './areaChartDirection';

test('Area direction is unknown until the selected period has two usable points', () => {
  assert.equal(resolveAreaChartDirection([]), 'unknown');
  assert.equal(
    resolveAreaChartDirection([
      { time: 1, value: 100 },
      { time: Number.NaN, value: 110 },
      { time: 2, value: Number.POSITIVE_INFINITY },
    ]),
    'unknown',
  );
});

test('Area direction compares the latest period value with the fixed first value', () => {
  assert.equal(
    resolveAreaChartDirection([
      { time: 1, close: 100 },
      { time: 2, close: 90 },
      { time: 3, close: 101 },
    ]),
    'up',
  );
  assert.equal(
    resolveAreaChartDirection([
      { time: 1, value: 100 },
      { time: 2, value: 110 },
      { time: 3, value: 99 },
    ]),
    'down',
  );
});

test('Area direction sorts timestamps, keeps the last duplicate, and treats flat as up', () => {
  assert.equal(
    resolveAreaChartDirection([
      { time: 3, value: 90 },
      { time: 1, value: 100 },
      { time: 2, value: Number.NaN, close: 105 },
      { time: 3, value: 100 },
    ]),
    'up',
  );
});

test('Area direction colors use candle trend colors and retain line color while unknown', () => {
  const colors = {
    candlesUptrend: '#00AA66',
    candlesDowntrend: '#DD3344',
    lineBody: '#4488CC',
  };

  assert.equal(resolveAreaChartColor('up', colors), colors.candlesUptrend);
  assert.equal(resolveAreaChartColor('down', colors), colors.candlesDowntrend);
  assert.equal(resolveAreaChartColor('unknown', colors), colors.lineBody);
});

test('Area auto and 1 Day follow the finite Quotes daily percentage', () => {
  const points = [
    { time: 1, close: 100 },
    { time: 2, close: 120 },
  ];

  assert.equal(resolveAreaChartDirectionForRange({
    range: 'auto',
    points,
    dailyChangePct: -0.83,
  }), 'down');
  assert.equal(resolveAreaChartDirectionForRange({
    range: '1d',
    points: [
      { time: 1, close: 120 },
      { time: 2, close: 100 },
    ],
    dailyChangePct: 0.12,
  }), 'up');
  assert.equal(resolveAreaChartDirectionForRange({
    range: '1d',
    points,
    dailyChangePct: 0,
  }), 'up');
});

test('Area range presets compare the first and last candle inside the selected range', () => {
  const daySeconds = 24 * 60 * 60;
  const latest = Date.UTC(2026, 7, 20) / 1000;
  const points = [
    { time: latest - 400 * daySeconds, close: 200 },
    { time: latest - 360 * daySeconds, close: 80 },
    { time: latest - 200 * daySeconds, close: 120 },
    { time: latest - 100 * daySeconds, close: 90 },
    { time: latest - 40 * daySeconds, close: 130 },
    { time: latest - 10 * daySeconds, close: 110 },
    { time: latest - 7 * daySeconds, close: 120 },
    { time: latest - 2 * daySeconds, close: 140 },
    { time: latest, close: 100 },
  ];

  const expected = new Map([
    ['5d', 'down'],
    ['1m', 'down'],
    ['3m', 'down'],
    ['6m', 'up'],
    ['ytd', 'down'],
    ['1y', 'up'],
    ['all', 'down'],
  ] as const);
  expected.forEach((direction, range) => {
    assert.equal(resolveAreaChartDirectionForRange({
      range,
      points,
      dailyChangePct: 99,
    }), direction, range);
  });

  assert.equal(resolveAreaChartDirectionForRange({
    range: 'custom',
    points,
    customDateValue: new Date((latest - 12 * daySeconds) * 1000),
    dailyChangePct: -99,
  }), 'up');
});

test('Area range direction falls back to candles and limits auto to its recent window', () => {
  const points = [
    { time: 1, close: 500 },
    { time: 2, close: 100 },
    { time: 3, close: 110 },
    { time: 4, close: 120 },
  ];

  assert.equal(resolveAreaChartDirectionForRange({
    range: 'auto',
    points,
    dailyChangePct: Number.NaN,
    autoVisiblePointCount: 3,
  }), 'up');
  assert.equal(resolveAreaChartDirectionForRange({
    range: '1d',
    points: [
      { time: 100, close: 120 },
      { time: 100 + 12 * 60 * 60, close: 100 },
    ],
    dailyChangePct: null,
  }), 'down');
});
