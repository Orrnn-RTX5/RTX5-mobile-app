import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatChartCandleCountdown,
  getChartCandleCountdownSeconds,
  resolveChartCandleCloseTimeMs,
} from './chartCandleCountdown';

const utcMs = (
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
): number => Date.UTC(year, month, day, hour, minute, second);

const COUNTDOWN_BOUNDARY_CASES = [
  {
    timeframe: 'M1',
    startMs: utcMs(2026, 6, 27, 10, 7),
    closeMs: utcMs(2026, 6, 27, 10, 8),
    nextCloseMs: utcMs(2026, 6, 27, 10, 9),
    startLabel: '01:00',
  },
  {
    timeframe: 'M5',
    startMs: utcMs(2026, 6, 27, 10, 5),
    closeMs: utcMs(2026, 6, 27, 10, 10),
    nextCloseMs: utcMs(2026, 6, 27, 10, 15),
    startLabel: '05:00',
  },
  {
    timeframe: 'M15',
    startMs: utcMs(2026, 6, 27, 10, 0),
    closeMs: utcMs(2026, 6, 27, 10, 15),
    nextCloseMs: utcMs(2026, 6, 27, 10, 30),
    startLabel: '15:00',
  },
  {
    timeframe: 'M30',
    startMs: utcMs(2026, 6, 27, 10, 0),
    closeMs: utcMs(2026, 6, 27, 10, 30),
    nextCloseMs: utcMs(2026, 6, 27, 11, 0),
    startLabel: '30:00',
  },
  {
    timeframe: 'H1',
    startMs: utcMs(2026, 6, 27, 10, 0),
    closeMs: utcMs(2026, 6, 27, 11, 0),
    nextCloseMs: utcMs(2026, 6, 27, 12, 0),
    startLabel: '60:00',
  },
  {
    timeframe: 'H4',
    startMs: utcMs(2026, 6, 27, 8, 0),
    closeMs: utcMs(2026, 6, 27, 12, 0),
    nextCloseMs: utcMs(2026, 6, 27, 16, 0),
    startLabel: '04:00:00',
  },
  {
    timeframe: 'D1',
    startMs: utcMs(2026, 6, 27),
    closeMs: utcMs(2026, 6, 28),
    nextCloseMs: utcMs(2026, 6, 29),
    startLabel: '24:00:00',
  },
  {
    timeframe: 'W1',
    startMs: utcMs(2026, 6, 27),
    closeMs: utcMs(2026, 7, 3),
    nextCloseMs: utcMs(2026, 7, 10),
    startLabel: '168:00:00',
  },
  {
    timeframe: 'MN',
    startMs: utcMs(2026, 6, 1),
    closeMs: utcMs(2026, 7, 1),
    nextCloseMs: utcMs(2026, 8, 1),
    startLabel: '744:00:00',
  },
] as const;

test('every supported timeframe starts at its full duration and resets on the next market boundary', () => {
  for (const { timeframe, startMs, closeMs, nextCloseMs, startLabel } of COUNTDOWN_BOUNDARY_CASES) {
    const durationSeconds = (closeMs - startMs) / 1000;
    const nextDurationSeconds = (nextCloseMs - closeMs) / 1000;
    const candleOpenTime = startMs / 1000;

    assert.equal(
      getChartCandleCountdownSeconds({ candleOpenTime, timeframe, nowMs: startMs }),
      durationSeconds,
      `${timeframe} must begin with its complete duration`,
    );
    assert.equal(
      formatChartCandleCountdown(durationSeconds, timeframe),
      startLabel,
      `${timeframe} must use the correct full-duration label`,
    );
    assert.equal(
      getChartCandleCountdownSeconds({ candleOpenTime, timeframe, nowMs: startMs + 1000 }),
      durationSeconds - 1,
      `${timeframe} must count down after one second`,
    );
    assert.equal(
      getChartCandleCountdownSeconds({ candleOpenTime, timeframe, nowMs: closeMs }),
      0,
      `${timeframe} must close at its exact boundary`,
    );
    assert.equal(resolveChartCandleCloseTimeMs(candleOpenTime, timeframe), closeMs);
    assert.equal(
      getChartCandleCountdownSeconds({
        candleOpenTime: closeMs / 1000,
        timeframe,
        nowMs: closeMs,
      }),
      nextDurationSeconds,
      `${timeframe} must reset for the next real candle`,
    );
  }
});

test('switching into any timeframe mid-candle preserves the elapsed market time', () => {
  for (const { timeframe, startMs, closeMs } of COUNTDOWN_BOUNDARY_CASES) {
    const durationSeconds = (closeMs - startMs) / 1000;
    const elapsedSeconds = Math.floor(durationSeconds * 0.4);
    const retainedLowerTimeframeOffsetSeconds = Math.max(1, Math.floor(durationSeconds * 0.1));

    assert.equal(
      getChartCandleCountdownSeconds({
        candleOpenTime: startMs / 1000 + retainedLowerTimeframeOffsetSeconds,
        timeframe,
        nowMs: startMs + elapsedSeconds * 1000,
      }),
      durationSeconds - elapsedSeconds,
      `${timeframe} must not restart when selected inside an existing candle`,
    );
  }

  const m5OpenSeconds = utcMs(2026, 6, 27, 10, 0) / 1000;
  const afterTwoAndHalfMinutes = getChartCandleCountdownSeconds({
    candleOpenTime: m5OpenSeconds,
    timeframe: 'M5',
    nowMs: utcMs(2026, 6, 27, 10, 2, 30),
  });
  const afterTwoPointEightMinutes = getChartCandleCountdownSeconds({
    candleOpenTime: m5OpenSeconds,
    timeframe: 'M5',
    nowMs: utcMs(2026, 6, 27, 10, 2, 48),
  });

  assert.equal(afterTwoAndHalfMinutes, 2 * 60 + 30);
  assert.equal(formatChartCandleCountdown(afterTwoAndHalfMinutes, 'M5'), '02:30');
  assert.equal(afterTwoPointEightMinutes, 2 * 60 + 12);
  assert.equal(formatChartCandleCountdown(afterTwoPointEightMinutes, 'M5'), '02:12');
});

test('a candle first painted five seconds after its boundary keeps those five seconds elapsed', () => {
  for (const { timeframe, closeMs, nextCloseMs } of COUNTDOWN_BOUNDARY_CASES) {
    const nextDurationSeconds = (nextCloseMs - closeMs) / 1000;

    assert.equal(
      getChartCandleCountdownSeconds({
        candleOpenTime: closeMs / 1000,
        timeframe,
        nowMs: closeMs + 5_000,
      }),
      nextDurationSeconds - 5,
      `${timeframe} must not show a false full duration when its first paint is five seconds late`,
    );
  }

  assert.equal(
    formatChartCandleCountdown(
      getChartCandleCountdownSeconds({
        candleOpenTime: utcMs(2026, 6, 27, 10, 5) / 1000,
        timeframe: 'M5',
        nowMs: utcMs(2026, 6, 27, 10, 5, 5),
      }),
      'M5',
    ),
    '04:55',
  );
});

test('M15 and M30 realign a retained lower-timeframe timestamp to market boundaries', () => {
  const retainedM1OpenSeconds = utcMs(2026, 6, 27, 10, 7) / 1000;
  const nowMs = utcMs(2026, 6, 27, 10, 7, 23);

  const m15Remaining = getChartCandleCountdownSeconds({
    candleOpenTime: retainedM1OpenSeconds,
    timeframe: 'M15',
    nowMs,
  });
  const m30Remaining = getChartCandleCountdownSeconds({
    candleOpenTime: retainedM1OpenSeconds,
    timeframe: 'M30',
    nowMs,
  });

  assert.equal(resolveChartCandleCloseTimeMs(retainedM1OpenSeconds, 'M15'), utcMs(2026, 6, 27, 10, 15));
  assert.equal(m15Remaining, 7 * 60 + 37);
  assert.equal(formatChartCandleCountdown(m15Remaining), '07:37');
  assert.equal(resolveChartCandleCloseTimeMs(retainedM1OpenSeconds, 'M30'), utcMs(2026, 6, 27, 10, 30));
  assert.equal(m30Remaining, 22 * 60 + 37);
  assert.equal(formatChartCandleCountdown(m30Remaining), '22:37');
});

test('countdown uses the selected M1 and M5 boundaries without an M1 fallback', () => {
  const candleOpenTime = utcMs(2026, 6, 31, 10, 0) / 1000;
  const nowMs = utcMs(2026, 6, 31, 10, 0, 23);

  assert.equal(
    getChartCandleCountdownSeconds({ candleOpenTime, timeframe: 'M1', nowMs }),
    37,
  );
  assert.equal(
    getChartCandleCountdownSeconds({ candleOpenTime, timeframe: 'M5', nowMs }),
    277,
  );
  assert.equal(formatChartCandleCountdown(37), '00:37');
  assert.equal(formatChartCandleCountdown(277), '04:37');
});

test('invalid timeframe is rejected instead of silently becoming M1', () => {
  const candleOpenTime = utcMs(2026, 6, 31, 10, 0) / 1000;

  assert.equal(
    getChartCandleCountdownSeconds({
      candleOpenTime,
      timeframe: 'M2',
      nowMs: utcMs(2026, 6, 31, 10, 0, 23),
    }),
    null,
  );
  assert.equal(resolveChartCandleCloseTimeMs(candleOpenTime, 'M2'), null);
});

test('countdown reaches zero and waits for the next candle timestamp', () => {
  const candleOpenTime = utcMs(2026, 6, 31, 10, 0) / 1000;

  assert.equal(
    getChartCandleCountdownSeconds({
      candleOpenTime,
      timeframe: 'M5',
      nowMs: utcMs(2026, 6, 31, 10, 5),
    }),
    0,
  );
  assert.equal(
    getChartCandleCountdownSeconds({
      candleOpenTime,
      timeframe: 'M5',
      nowMs: utcMs(2026, 6, 31, 10, 7),
    }),
    0,
  );
  assert.equal(formatChartCandleCountdown(0), '00:00');
});

test('monthly countdown follows the real UTC calendar boundary', () => {
  const februaryOpenSeconds = utcMs(2028, 1, 1) / 1000;

  assert.equal(
    resolveChartCandleCloseTimeMs(februaryOpenSeconds, 'MN'),
    utcMs(2028, 2, 1),
  );
  assert.equal(
    getChartCandleCountdownSeconds({
      candleOpenTime: februaryOpenSeconds,
      timeframe: 'MN',
      nowMs: utcMs(2028, 1, 29, 23, 59, 59),
    }),
    1,
  );
});

test('long countdowns use hour and day-aware labels', () => {
  assert.equal(formatChartCandleCountdown(4 * 60 * 60), '04:00:00');
  assert.equal(formatChartCandleCountdown(7 * 24 * 60 * 60), '7d 00:00:00');
});

test('H1 stays minute-second based and H4 stays hour-minute-second based through zero', () => {
  assert.equal(formatChartCandleCountdown(60 * 60, 'H1'), '60:00');
  assert.equal(formatChartCandleCountdown(60 * 60 - 1, 'H1'), '59:59');
  assert.equal(formatChartCandleCountdown(0, 'H1'), '00:00');

  assert.equal(formatChartCandleCountdown(4 * 60 * 60, 'H4'), '04:00:00');
  assert.equal(formatChartCandleCountdown(4 * 60 * 60 - 1, 'H4'), '03:59:59');
  assert.equal(formatChartCandleCountdown(60 * 60 - 1, 'H4'), '00:59:59');
  assert.equal(formatChartCandleCountdown(0, 'H4'), '00:00:00');
});

test('D1 displays a correct twenty-four-hour countdown through zero', () => {
  assert.equal(formatChartCandleCountdown(24 * 60 * 60, 'D1'), '24:00:00');
  assert.equal(formatChartCandleCountdown(24 * 60 * 60 - 1, 'D1'), '23:59:59');
  assert.equal(formatChartCandleCountdown(60 * 60, 'D1'), '01:00:00');
  assert.equal(formatChartCandleCountdown(0, 'D1'), '00:00:00');
});

test('W1 displays a seven-day countdown as total hours through zero', () => {
  assert.equal(formatChartCandleCountdown(7 * 24 * 60 * 60, 'W1'), '168:00:00');
  assert.equal(formatChartCandleCountdown(7 * 24 * 60 * 60 - 1, 'W1'), '167:59:59');
  assert.equal(formatChartCandleCountdown(24 * 60 * 60, 'W1'), '24:00:00');
  assert.equal(formatChartCandleCountdown(0, 'W1'), '00:00:00');
});

test('MN displays the real calendar-month length as total hours', () => {
  assert.equal(formatChartCandleCountdown(28 * 24 * 60 * 60, 'MN'), '672:00:00');
  assert.equal(formatChartCandleCountdown(29 * 24 * 60 * 60, 'MN'), '696:00:00');
  assert.equal(formatChartCandleCountdown(30 * 24 * 60 * 60, 'MN'), '720:00:00');
  assert.equal(formatChartCandleCountdown(31 * 24 * 60 * 60, 'MN'), '744:00:00');
  assert.equal(formatChartCandleCountdown(31 * 24 * 60 * 60 - 1, 'MN'), '743:59:59');
  assert.equal(formatChartCandleCountdown(0, 'MN'), '00:00:00');
});
