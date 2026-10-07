import React, { useEffect, useRef } from 'react';
import type { IChartApi } from 'lightweight-charts';

import {
  formatChartCandleCountdown,
  getChartCandleCountdownSeconds,
} from '../chartCandleCountdown';

type ChartRef = Readonly<{ current: IChartApi | null }>;
type SeriesRef = Readonly<{
  current: null | {
    priceToCoordinate?: (price: number) => number | null;
  };
}>;
type ContainerRef = Readonly<{ current: HTMLDivElement | null }>;

type CountdownCandle = Readonly<{
  time: number;
  open: number;
  close: number;
}>;

type Props = Readonly<{
  active?: boolean;
  candle: CountdownCandle | null;
  chartContainerRef: ContainerRef;
  chartRef: ChartRef;
  displayDecimals: number;
  downColor: string;
  seriesRef: SeriesRef;
  timeframe: string;
  upColor: string;
  visible?: boolean;
}>;

type LiveProps = Omit<Props, 'chartContainerRef' | 'chartRef' | 'seriesRef'>;

const PRICE_ROW_HEIGHT = 18;
const COUNTDOWN_ROW_HEIGHT = 14;
const SINGLE_ROW_HEIGHT = 22;
const BADGE_MIN_WIDTH = 56;

/**
 * Imperative DOM badge for the browser chart. The aligned timer mutates only
 * two text nodes, so the large ChartScreen React tree does not re-render every
 * second while the active candle is forming.
 */
export const ChartCandleCountdownBadge = React.memo(function ChartCandleCountdownBadge({
  active = true,
  candle,
  chartContainerRef,
  chartRef,
  displayDecimals,
  downColor,
  seriesRef,
  timeframe,
  upColor,
  visible = true,
}: Props) {
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const priceRef = useRef<HTMLSpanElement | null>(null);
  const countdownRef = useRef<HTMLSpanElement | null>(null);
  const refreshRef = useRef<(() => void) | null>(null);
  const livePropsRef = useRef<LiveProps>({
    active,
    candle,
    displayDecimals,
    downColor,
    timeframe,
    upColor,
    visible,
  });
  livePropsRef.current = {
    active,
    candle,
    displayDecimals,
    downColor,
    timeframe,
    upColor,
    visible,
  };

  useEffect(() => {
    let disposed = false;
    let frameHandle = 0;
    let timerHandle: ReturnType<typeof setTimeout> | null = null;
    let subscribedChart: IChartApi | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const scheduleRefreshFrame = () => {
      if (disposed || frameHandle) return;
      frameHandle = requestAnimationFrame(() => {
        frameHandle = 0;
        refreshRef.current?.();
      });
    };

    const ensureVisibleRangeSubscription = () => {
      const nextChart = chartRef.current;
      if (nextChart === subscribedChart) return;
      if (subscribedChart) {
        try {
          subscribedChart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleRefreshFrame);
        } catch (_error) {
          // The prior chart may already have been disposed.
        }
      }
      subscribedChart = nextChart;
      if (subscribedChart) {
        try {
          subscribedChart.timeScale().subscribeVisibleLogicalRangeChange(scheduleRefreshFrame);
        } catch (_error) {
          subscribedChart = null;
        }
      }
    };

    const refresh = () => {
      if (disposed) return;
      ensureVisibleRangeSubscription();

      const badge = badgeRef.current;
      const priceNode = priceRef.current;
      const countdownNode = countdownRef.current;
      const container = chartContainerRef.current;
      const series = seriesRef.current;
      const chart = chartRef.current;
      const current = livePropsRef.current;
      const currentCandle = current.candle;

      if (
        !badge ||
        !priceNode ||
        !countdownNode ||
        !container ||
        !series ||
        !chart ||
        !current.active ||
        !current.visible ||
        !currentCandle ||
        !Number.isFinite(currentCandle.close) ||
        currentCandle.close <= 0 ||
        typeof series.priceToCoordinate !== 'function'
      ) {
        if (badge) badge.style.display = 'none';
        return;
      }

      const coordinate = series.priceToCoordinate(currentCandle.close);
      if (typeof coordinate !== 'number' || !Number.isFinite(coordinate)) {
        badge.style.display = 'none';
        return;
      }

      const remainingSeconds = getChartCandleCountdownSeconds({
        candleOpenTime: currentCandle.time,
        timeframe: current.timeframe,
      });
      const countdownLabel = formatChartCandleCountdown(remainingSeconds, current.timeframe);
      const hasCountdown = countdownLabel !== null;
      const priceRowHeight = hasCountdown ? PRICE_ROW_HEIGHT : SINGLE_ROW_HEIGHT;
      const badgeHeight = hasCountdown
        ? PRICE_ROW_HEIGHT + COUNTDOWN_ROW_HEIGHT
        : SINGLE_ROW_HEIGHT;
      const chartRoot = container.firstElementChild as HTMLElement | null;
      const renderedChartWidth = chartRoot?.clientWidth || container.clientWidth;
      const offsetParent = badge.offsetParent as HTMLElement | null;
      const parentWidth = offsetParent?.clientWidth || container.clientWidth;
      const rightInset = Math.max(
        0,
        Math.round(parentWidth - (container.offsetLeft + renderedChartWidth)),
      );
      const scale = chart.priceScale('right') as unknown as { width?: () => number };
      const scaleWidth = typeof scale.width === 'function' ? scale.width() : BADGE_MIN_WIDTH;
      const color = currentCandle.close >= currentCandle.open ? current.upColor : current.downColor;
      const safeDecimals = Math.max(0, Math.min(10, Math.floor(current.displayDecimals)));

      badge.style.display = 'flex';
      badge.style.right = `${rightInset}px`;
      badge.style.top = `${Math.round(container.offsetTop + coordinate - priceRowHeight / 2)}px`;
      badge.style.width = `${Math.max(BADGE_MIN_WIDTH, Math.round(scaleWidth || 0))}px`;
      badge.style.height = `${badgeHeight}px`;
      badge.style.background = color;
      priceNode.style.height = `${priceRowHeight}px`;
      priceNode.style.lineHeight = `${priceRowHeight}px`;
      priceNode.textContent = currentCandle.close.toFixed(safeDecimals);
      countdownNode.style.display = hasCountdown ? 'block' : 'none';
      countdownNode.textContent = countdownLabel ?? '';
      countdownNode.style.fontSize = countdownLabel && countdownLabel.length > 11 ? '8px' : '10px';
    };

    const scheduleNextSecond = () => {
      if (disposed) return;
      const delay = Math.max(50, 1_000 - (Date.now() % 1_000) + 16);
      timerHandle = setTimeout(() => {
        timerHandle = null;
        scheduleRefreshFrame();
        scheduleNextSecond();
      }, delay);
    };

    refreshRef.current = refresh;
    const container = chartContainerRef.current;
    if (container) {
      container.addEventListener('pointermove', scheduleRefreshFrame, { passive: true });
      container.addEventListener('touchmove', scheduleRefreshFrame, { passive: true });
      container.addEventListener('wheel', scheduleRefreshFrame, { passive: true });
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleRefreshFrame);
        resizeObserver.observe(container);
      }
    }
    refresh();
    scheduleNextSecond();

    return () => {
      disposed = true;
      refreshRef.current = null;
      if (timerHandle !== null) clearTimeout(timerHandle);
      if (frameHandle) cancelAnimationFrame(frameHandle);
      resizeObserver?.disconnect();
      if (container) {
        container.removeEventListener('pointermove', scheduleRefreshFrame);
        container.removeEventListener('touchmove', scheduleRefreshFrame);
        container.removeEventListener('wheel', scheduleRefreshFrame);
      }
      if (subscribedChart) {
        try {
          subscribedChart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleRefreshFrame);
        } catch (_error) {
          // The chart may already have been disposed by its parent effect.
        }
      }
    };
  }, [chartContainerRef, chartRef, seriesRef]);

  useEffect(() => {
    refreshRef.current?.();
  }, [active, candle?.close, candle?.open, candle?.time, displayDecimals, downColor, timeframe, upColor, visible]);

  return (
    <div
      ref={badgeRef}
      data-rtx5-role="market-price-scale-live"
      style={{
        alignItems: 'stretch',
        borderRadius: 2,
        boxSizing: 'border-box',
        color: '#FFFFFF',
        display: 'none',
        flexDirection: 'column',
        fontFeatureSettings: '"tnum" 1, "lnum" 1',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 700,
        overflow: 'hidden',
        padding: '0 4px',
        pointerEvents: 'none',
        position: 'absolute',
        textAlign: 'right',
        whiteSpace: 'nowrap',
        zIndex: 14,
      }}
    >
      <span ref={priceRef} style={{ display: 'block', fontSize: 12 }} />
      <span
        ref={countdownRef}
        data-rtx5-role="candle-countdown"
        style={{ display: 'block', height: COUNTDOWN_ROW_HEIGHT, lineHeight: `${COUNTDOWN_ROW_HEIGHT}px` }}
      />
    </div>
  );
});
