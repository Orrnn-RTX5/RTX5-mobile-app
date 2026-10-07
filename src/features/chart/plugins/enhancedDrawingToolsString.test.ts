import assert from 'node:assert/strict';
import test from 'node:test';
import { ENHANCED_DRAWING_TOOLS_JS } from './enhancedDrawingToolsString';

type ChartPoint = { x: number; y: number };
type ChartClickParam = { point: ChartPoint; time: number };
type WebViewMessage = {
  active?: boolean;
  candle?: { close: number | null; high: number | null; low: number | null; open: number | null; time: number | null };
  canRedo?: boolean;
  canUndo?: boolean;
  drawings?: Array<any>;
  drawingActive?: boolean;
  label?: string;
  locked?: boolean;
  recordId?: string;
  selectedDrawingId?: string | null;
  text?: string;
  tool?: string;
  type: string;
};

type Listener<T> = (payload: T) => void;

function createFakeChartEnvironment({
  deferredAnimationFrames = false,
  nullCoordinateTimeFromX = Number.POSITIVE_INFINITY,
  priceFormat = { precision: 5 },
  seriesData: suppliedSeriesData,
  touch = false,
}: { deferredAnimationFrames?: boolean; nullCoordinateTimeFromX?: number; priceFormat?: { precision?: number; minMove?: number }; seriesData?: Array<Record<string, number>>; touch?: boolean } = {}) {
  const clickListeners: Array<Listener<ChartClickParam>> = [];
  const moveListeners: Array<Listener<ChartClickParam>> = [];
  const messages: WebViewMessage[] = [];
  const appliedOptions: unknown[] = [];
  const priceScaleActions: unknown[] = [];
  const timeScaleActions: string[] = [];
  const attachedPrimitives: unknown[] = [];
  const detachedPrimitives: unknown[] = [];
  const hostListeners: Record<string, Array<Listener<any>>> = {};
  const animationFrames = new Map<number, () => void>();
  let nextAnimationFrameId = 0;
  let priceCoordinateOrigin = 100;
  let pixelsPerPriceUnit = 10;
  const createElement = () => {
    const element: any = {
      children: [] as any[],
      parentNode: null as any,
      style: {} as Record<string, string>,
      textContent: '',
      addEventListener: () => undefined,
      appendChild: (child: any) => {
        child.parentNode = element;
        element.children.push(child);
      },
      focus: () => {
        element.focused = true;
      },
      removeChild: (child: any) => {
        element.children = element.children.filter((item: any) => item !== child);
        child.parentNode = null;
      },
      removeEventListener: () => undefined,
      select: () => {
        element.selectedText = true;
      },
      setAttribute: (name: string, value: string) => {
        element[name] = value;
      },
    };
    return element;
  };
  const host = createElement();
  Object.assign(host, {
    addEventListener: (name: string, listener: Listener<any>) => {
      hostListeners[name] = [...(hostListeners[name] ?? []), listener];
    },
    getBoundingClientRect: () => ({ height: 320, left: 0, top: 0, width: 360 }),
    removeEventListener: (name: string, listener: Listener<any>) => {
      hostListeners[name] = (hostListeners[name] ?? []).filter((item) => item !== listener);
    },
  });

  const seriesData: Array<Record<string, number>> = suppliedSeriesData ?? Array.from(
    { length: 30 },
    (_, index) => ({
      close: 4,
      high: 5,
      low: 1,
      open: 2,
      time: index + 1,
    }),
  );
  const timeScale = {
    coordinateToLogical: (x: number) => x / 10,
    coordinateToTime: (x: number) => (x >= nullCoordinateTimeFromX ? null : Math.max(1, Math.round(x / 10))),
    fitContent: () => timeScaleActions.push('fitContent'),
    logicalToCoordinate: (logical: number) => logical * 10,
    scrollToRealTime: () => timeScaleActions.push('scrollToRealTime'),
    timeToCoordinate: (time: number) => (time > seriesData[seriesData.length - 1].time ? null : time * 10),
    timeToIndex: (time: number) => time,
  };
  const chart = {
    applyOptions: (options: unknown) => appliedOptions.push(options),
    priceScale: (id: string) => ({
      applyOptions: (options: unknown) => priceScaleActions.push({ id, options }),
    }),
    subscribeClick: (listener: Listener<ChartClickParam>) => {
      clickListeners.push(listener);
    },
    subscribeCrosshairMove: (listener: Listener<ChartClickParam>) => {
      moveListeners.push(listener);
    },
    timeScale: () => timeScale,
    unsubscribeClick: (listener: Listener<ChartClickParam>) => {
      const index = clickListeners.indexOf(listener);
      if (index >= 0) clickListeners.splice(index, 1);
    },
    unsubscribeCrosshairMove: (listener: Listener<ChartClickParam>) => {
      const index = moveListeners.indexOf(listener);
      if (index >= 0) moveListeners.splice(index, 1);
    },
  };
  const series = {
    attachPrimitive: (primitive: any) => {
      attachedPrimitives.push(primitive);
      if (typeof primitive.attached === 'function') {
        primitive.attached({ chart, requestUpdate: () => undefined, series });
      }
    },
    coordinateToPrice: (y: number) => priceCoordinateOrigin - y / pixelsPerPriceUnit,
    data: () => seriesData,
    dataByIndex: (index: number) => ({
      close: 4,
      high: 5,
      low: 1,
      open: 2,
      time: index,
    }),
    detachPrimitive: (primitive: any) => {
      detachedPrimitives.push(primitive);
      const index = attachedPrimitives.indexOf(primitive);
      if (index >= 0) attachedPrimitives.splice(index, 1);
      if (typeof primitive.detached === 'function') {
        primitive.detached();
      }
    },
    options: () => ({ priceFormat }),
    priceToCoordinate: (price: number) => (priceCoordinateOrigin - price) * pixelsPerPriceUnit,
  };

  const fakeWindow: any = {
    LightweightCharts: {
      CrosshairMode: {
        Hidden: 2,
        Normal: 0,
      },
    },
    ReactNativeWebView: {
      postMessage: (raw: string) => messages.push(JSON.parse(raw)),
    },
  };
  if (touch) {
    fakeWindow.ontouchstart = null;
  }
  if (deferredAnimationFrames) {
    fakeWindow.requestAnimationFrame = (callback: () => void) => {
      const id = ++nextAnimationFrameId;
      animationFrames.set(id, callback);
      return id;
    };
    fakeWindow.cancelAnimationFrame = (id: number) => animationFrames.delete(id);
  }

  (globalThis as any).window = fakeWindow;
  (globalThis as any).LightweightCharts = fakeWindow.LightweightCharts;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: touch ? { maxTouchPoints: 1 } : { maxTouchPoints: 0 },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: touch
      ? {
        addEventListener: () => undefined,
        createElement,
        getElementById: () => host,
        removeEventListener: () => undefined,
      }
      : undefined,
  });

  new Function(ENHANCED_DRAWING_TOOLS_JS)();
  const DrawingToolsManager = fakeWindow.DrawingToolsManager;
  const manager = new DrawingToolsManager(chart, series);

  const drawingMessages = () => messages.filter((message) => message.type === 'DRAWINGS_CHANGED');
  const latestDrawings = () => {
    const drawingMessageList = drawingMessages();
    return drawingMessageList[drawingMessageList.length - 1]?.drawings ?? [];
  };
  const listenerCounts = () => ({
    click: clickListeners.length,
    crosshairMove: moveListeners.length,
    touchCancel: hostListeners.touchcancel?.length ?? 0,
    touchEnd: hostListeners.touchend?.length ?? 0,
    touchMove: hostListeners.touchmove?.length ?? 0,
    touchStart: hostListeners.touchstart?.length ?? 0,
  });
  const toolsChanged = () => messages.filter((message) => message.type === 'TOOL_ACTIVE_CHANGED');
  const crosshairMessages = () => messages.filter((message) => message.type === 'CHART_CROSSHAIR_CANDLE');
  const click = (x: number, y: number, time = Math.max(1, Math.round(x / 10))) => {
    clickListeners.slice().forEach((listener) => listener({ point: { x, y }, time }));
  };
  const move = (x: number, y: number, time = Math.max(1, Math.round(x / 10))) => {
    moveListeners.slice().forEach((listener) => listener({ point: { x, y }, time }));
  };
  const touchEvent = (x: number, y: number, identifier = 1, emptyChangedTouches = false) => {
    const touchPoint = { clientX: x, clientY: y, identifier };
    const event: any = {
      preventDefaultCalls: 0,
      stopImmediatePropagationCalls: 0,
      stopPropagationCalls: 0,
      changedTouches: emptyChangedTouches ? [] : [touchPoint],
      touches: [touchPoint],
    };
    event.preventDefault = () => { event.preventDefaultCalls += 1; };
    event.stopImmediatePropagation = () => { event.stopImmediatePropagationCalls += 1; };
    event.stopPropagation = () => { event.stopPropagationCalls += 1; };
    return event;
  };
  const touchStart = (x: number, y: number) => {
    const event = touchEvent(x, y);
    (hostListeners.touchstart ?? []).slice().forEach((listener) => listener(event));
    return event;
  };
  const touchMove = (x: number, y: number) => {
    const event = touchEvent(x, y);
    (hostListeners.touchmove ?? []).slice().forEach((listener) => listener(event));
    return event;
  };
  const touchEnd = (x: number, y: number, options: { emptyChangedTouches?: boolean } = {}) => {
    const event = touchEvent(x, y, 1, options.emptyChangedTouches === true);
    event.touches = [];
    (hostListeners.touchend ?? []).slice().forEach((listener) => listener(event));
    return event;
  };

  return {
    appliedOptions,
    attachedPrimitives,
    click,
    crosshairMessages,
    detachedPrimitives,
    drawingMessages,
    flushAnimationFrames: () => {
      const callbacks = [...animationFrames.values()];
      animationFrames.clear();
      callbacks.forEach((callback) => callback());
    },
    host,
    latestDrawings,
    listenerCounts,
    manager,
    messages,
    move,
    priceScaleActions,
    setPriceCoordinateMapping: (origin: number, pixelsPerUnit = 10) => {
      priceCoordinateOrigin = origin;
      pixelsPerPriceUnit = pixelsPerUnit;
    },
    timeScale,
    timeScaleActions,
    toolsChanged,
    touchEnd,
    touchMove,
    touchStart,
  };
}

function createFakeBitmapTarget() {
  const ellipses: Array<{ centerX: number; centerY: number; radiusX: number; radiusY: number }> = [];
  const fillRects: Array<{ height: number; width: number; x: number; y: number }> = [];
  const moves: Array<{ x: number; y: number }> = [];
  const roundRects: Array<{ height: number; width: number; x: number; y: number }> = [];
  const texts: Array<{ text: string; x: number; y: number }> = [];
  const lines: Array<{ x: number; y: number }> = [];
  const context = {
    arc: () => undefined,
    beginPath: () => undefined,
    clip: () => undefined,
    ellipse: (centerX: number, centerY: number, radiusX: number, radiusY: number) => {
      ellipses.push({ centerX, centerY, radiusX, radiusY });
    },
    fill: () => undefined,
    fillRect: (x: number, y: number, width: number, height: number) => {
      fillRects.push({ height, width, x, y });
    },
    fillText: (text: string, x: number, y: number) => {
      texts.push({ text, x, y });
    },
    lineTo: (x: number, y: number) => lines.push({ x, y }),
    measureText: (text: string) => ({ width: text.length * 7 }),
    moveTo: (x: number, y: number) => moves.push({ x, y }),
    rect: () => undefined,
    restore: () => undefined,
    roundRect: (x: number, y: number, width: number, height: number) => {
      roundRects.push({ height, width, x, y });
    },
    save: () => undefined,
    setLineDash: () => undefined,
    stroke: () => undefined,
  };

  return {
    ellipses,
    fillRects,
    lines,
    moves,
    roundRects,
    texts,
    target: {
      useBitmapCoordinateSpace: (callback: (scope: any) => void) => callback({
        bitmapSize: { height: 320, width: 360 },
        context,
        horizontalPixelRatio: 1,
        verticalPixelRatio: 1,
      }),
    },
  };
}

test('Crosshair stays passive and does not create drawing records', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('crosshair');
  harness.click(10, 100);
  harness.click(20, 90);

  assert.equal(harness.manager.getActiveTool(), 'crosshair');
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Crosshair fixes the viewport until inspection is turned off', () => {
  for (const touch of [false, true]) {
    const harness = createFakeChartEnvironment({ touch });
    harness.manager.setActiveTool('crosshair');
    const locked = harness.appliedOptions.at(-1) as any;
    assert.deepEqual(locked.handleScroll, {
      mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false,
    });
    assert.deepEqual(locked.handleScale, {
      mouseWheel: false, pinch: false, axisPressedMouseMove: false,
    });
    harness.touchStart(120, 140);
    harness.touchMove(160, 170);
    harness.touchEnd(160, 170);
    harness.move(160, 170);
    if (touch) {
      assert.ok(harness.crosshairMessages().some((message) => message.active === true));
    }
    assert.deepEqual(harness.latestDrawings(), []);
    harness.manager.setActiveTool('none');
    const restored = harness.appliedOptions.at(-1) as any;
    assert.equal(restored.handleScroll.horzTouchDrag, true);
    assert.equal(restored.handleScroll.pressedMouseMove, true);
    assert.equal(restored.handleScale.pinch, true);
    assert.equal(restored.handleScale.mouseWheel, true);
    assert.equal(restored.handleScale.axisPressedMouseMove, true);
    assert.equal(harness.manager._crosshairLocked, false);
  }
});

test('Crosshair activation immediately shows a centered cursor with axis labels and no popup or lock badge', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('crosshair');

  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.ok(overlay);
  const [vertical, horizontal, priceLabel, timeLabel, center, tooltip, lockBadge] = overlay.children;
  assert.equal(overlay.style.display, 'block');
  assert.equal(vertical.style.left, '150px');
  assert.equal(horizontal.style.top, '148px');
  assert.equal(priceLabel.style.display, 'block');
  assert.equal(priceLabel.textContent, '85.20000');
  assert.equal(timeLabel.style.display, 'block');
  assert.notEqual(timeLabel.textContent, '');
  assert.equal(center.textContent, '');
  assert.equal(center.children.length, 4);
  assert.ok(center.children.every((arm: any) => arm.style.display === 'block' && arm.style.background === '#2962FF'));
  assert.ok(center.children.every((arm: any) => {
    const left = Number.parseFloat(arm.style.left);
    const top = Number.parseFloat(arm.style.top);
    const right = left + Number.parseFloat(arm.style.width);
    const bottom = top + Number.parseFloat(arm.style.height);
    return !(left <= 11 && right >= 11 && top <= 11 && bottom >= 11);
  }), 'four separate arms leave the center clear');
  assert.equal(center.style.color, '#2962FF');
  assert.equal(priceLabel.style.background, '#D3D3D3');
  assert.equal(priceLabel.style.color, '#000000');
  assert.equal(priceLabel.style.font, '400 13px Arial, sans-serif');
  assert.equal(priceLabel.style.borderRadius, '0');
  assert.equal(priceLabel.style.boxShadow, 'none');
  assert.equal(timeLabel.style.background, '#D3D3D3');
  assert.equal(timeLabel.style.color, '#000000');
  assert.equal(tooltip.style.display, 'none');
  assert.equal(tooltip.innerHTML, '');
  assert.equal(lockBadge.style.display, 'none');
  assert.equal(lockBadge.textContent, '');
  assert.equal(harness.manager._crosshairLocked, false);
  assert.equal(harness.host.style.touchAction, 'none');
  assert.ok(harness.crosshairMessages().some((message) => message.active === true));
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Crosshair native guide geometry respects device pixels, occludes the ruler anchor, and restores Area styling', () => {
  const harness = createFakeChartEnvironment({
    seriesData: [{ time: 1, value: 85 }, { time: 2, value: 87 }], touch: true,
  });
  const fakeWindow = (globalThis as any).window;
  fakeWindow.devicePixelRatio = 3;
  harness.manager._chart.options = () => ({ layout: { background: { type: 'solid', color: '#121212' } } });
  harness.manager.setActiveTool('crosshair');
  harness.touchStart(180, 180);
  harness.touchEnd(180, 180);
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  for (const index of [0, 12]) {
    const guide = overlay.children[index];
    assert.equal(Number.parseFloat(guide.style.width) * fakeWindow.devicePixelRatio, 2);
    assert.equal(guide.style.borderLeft, '0');
    assert.equal(guide.style.background, 'repeating-linear-gradient(to bottom, #D3D3D3 0px, #D3D3D3 4px, transparent 4px, transparent 7px)');
  }
  for (const index of [1, 13]) {
    const guide = overlay.children[index];
    assert.equal(Number.parseFloat(guide.style.height) * fakeWindow.devicePixelRatio, 2);
    assert.equal(guide.style.borderTop, '0');
    assert.equal(guide.style.background, 'repeating-linear-gradient(to right, #D3D3D3 0px, #D3D3D3 4px, transparent 4px, transparent 7px)');
  }
  assert.equal(overlay.children[8].style.background, '#121212');
  harness.manager._chart.options = () => ({ layout: { background: { type: 'solid', color: 'transparent' } } });
  fakeWindow.getComputedStyle = () => ({ backgroundColor: 'rgb(255, 255, 255)' });
  harness.manager.refreshCrosshairData();
  assert.equal(overlay.children[8].style.background, 'rgb(255, 255, 255)');
  fakeWindow.getComputedStyle = () => ({ backgroundColor: 'rgba(0, 0, 0, 0)' });
  harness.manager.refreshCrosshairData();
  assert.equal(overlay.children[8].style.background, '#000000');

  harness.manager.setCrosshairConfig({ areaSeriesInspector: true });
  assert.equal(overlay.children[0].style.width, '0');
  assert.equal(overlay.children[0].style.background, 'none');
  assert.equal(overlay.children[0].style.marginLeft, '0');
  assert.equal(overlay.children[0].style.borderLeft, '1px solid rgba(148, 163, 184, 0.68)');
  assert.equal(overlay.children[1].style.height, '0');
  assert.equal(overlay.children[1].style.background, 'none');
  assert.equal(overlay.children[1].style.display, 'none');
  assert.equal(overlay.children[8].style.display, 'none');
});

test('Crosshair drags update continuously and retain their final location after release and repeated activation', () => {
  const harness = createFakeChartEnvironment({ touch: true });
  harness.manager.setActiveTool('crosshair');
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  const [vertical, horizontal] = overlay.children;

  const startEvent = harness.touchStart(20, 250);
  assert.equal(vertical.style.left, '150px');
  assert.equal(horizontal.style.top, '148px');
  harness.touchMove(22, 251);
  assert.equal(vertical.style.left, '150px');
  assert.equal(horizontal.style.top, '149px');
  // The library reports the absolute finger position during and after the
  // gesture; it must never overwrite the bridge's relative cursor movement.
  harness.move(22, 251);
  assert.equal(vertical.style.left, '150px');
  harness.touchMove(30, 245);
  const endEvent = harness.touchEnd(30, 245);
  harness.move(30, 245);
  harness.click(30, 245);
  harness.manager.setActiveTool('crosshair');

  assert.equal(overlay.style.display, 'block');
  assert.equal(vertical.style.left, '160px');
  assert.equal(horizontal.style.top, '143px');
  assert.equal(harness.manager._crosshairLocked, false);
  assert.equal(harness.manager._crosshairRulerAnchor, null);
  assert.equal(startEvent.preventDefaultCalls, 0);
  assert.equal(endEvent.preventDefaultCalls, 0);
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Crosshair snaps to logical bar centers and starts each drag from the visible cursor without accumulating residual motion', () => {
  const harness = createFakeChartEnvironment({ touch: true });
  harness.manager.setActiveTool('crosshair');
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  harness.touchStart(40, 250);
  harness.touchMove(44, 243);
  assert.equal(overlay.children[0].style.left, '150px');
  harness.touchEnd(44, 243);
  assert.equal(harness.manager._lastCrosshairParam.point.x, 150);

  harness.touchStart(80, 250);
  harness.touchMove(84, 243);
  harness.touchEnd(84, 243);
  assert.equal(overlay.children[0].style.left, '150px', 'a new drag must not accumulate the previous four-pixel residual');

  harness.touchStart(80, 250);
  harness.touchMove(86, 250);
  assert.equal(overlay.children[0].style.left, '160px');
  harness.touchMove(94, 250);
  assert.equal(overlay.children[0].style.left, '160px');
  harness.touchMove(96, 250);
  assert.equal(overlay.children[0].style.left, '170px');
  harness.touchEnd(96, 250);
  assert.equal(harness.manager._lastCrosshairState.logicalIndex, 17);
  assert.equal(harness.manager._lastCrosshairState.time, 17);
});

test('Crosshair regular time labels show the UTC weekday, date, year, and selected bar time', () => {
  const baseTime = Date.UTC(2026, 9, 5, 12, 11) / 1000;
  const seriesData = Array.from({ length: 30 }, (_, index) => ({
    time: baseTime + (index + 1) * 60, open: 90, high: 95, low: 85, close: 92,
  }));
  const harness = createFakeChartEnvironment({ seriesData, touch: true });
  harness.timeScale.coordinateToTime = (x) => baseTime + Math.max(1, Math.round(x / 10)) * 60;
  harness.timeScale.timeToIndex = (time) => (time - baseTime) / 60;
  harness.manager.setCrosshairConfig({ timeframe: 'M1' });
  harness.manager.setActiveTool('crosshair');
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.equal(overlay.children[3].textContent, "Mon 5 Oct '26 12:26");
});

test('Crosshair pending render uses updated timeframe labels without resurrecting a dismissed cursor', () => {
  const baseTime = Date.UTC(2026, 9, 5, 12, 11) / 1000;
  const harness = createFakeChartEnvironment({ deferredAnimationFrames: true, touch: true });
  harness.timeScale.coordinateToTime = (x) => baseTime + Math.max(1, Math.round(x / 10)) * 60;
  harness.manager.setCrosshairConfig({ timeframe: 'M1' });
  harness.manager.setActiveTool('crosshair');
  assert.equal(harness.manager._crosshairVisible, false);
  harness.manager.setCrosshairConfig({ timeframe: 'D1' });
  harness.flushAnimationFrames();
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.equal(overlay.children[3].textContent, "Mon 5 Oct '26");
  harness.manager.setActiveTool('none');
  harness.manager.setCrosshairConfig({ timeframe: 'M1' });
  harness.flushAnimationFrames();
  assert.equal(overlay.style.display, 'none');
  assert.equal(harness.manager._pendingCrosshairState, null);
});

test('Crosshair clipped drag reverses immediately from the visible edge and ruler stats flip below the top', () => {
  const harness = createFakeChartEnvironment({ touch: true });
  harness.manager.setActiveTool('crosshair');
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  harness.touchStart(180, 100);
  harness.touchEnd(180, 100);
  overlay.children[11].offsetWidth = 100;
  overlay.children[11].offsetHeight = 32;
  harness.touchStart(100, 100);
  harness.touchMove(500, -200);
  assert.equal(overlay.children[0].style.left, '290px');
  assert.equal(overlay.children[1].style.top, '2px');
  assert.equal(overlay.children[11].style.top, '6px');
  const anchor = harness.manager._crosshairRulerAnchor;
  harness.touchMove(460, -150);
  assert.equal(overlay.children[0].style.left, '250px');
  assert.equal(overlay.children[1].style.top, '52px');
  harness.touchEnd(460, -150);
  assert.equal(overlay.children[0].style.left, '250px');
  assert.equal(overlay.children[1].style.top, '52px');
  assert.equal(harness.manager._crosshairRulerAnchor, anchor);
});

test('Crosshair stationary tap starts a transient ruler with broker points and two price/time labels', () => {
  const seriesData = Array.from({ length: 30 }, (_, index) => ({
    time: (index + 1) * 60, open: 190, high: 191, low: 189, close: 190,
  }));
  const harness = createFakeChartEnvironment({
    priceFormat: { minMove: 0.01, precision: 3 }, seriesData, touch: true,
  });
  harness.setPriceCoordinateMapping(204.8);
  harness.timeScale.coordinateToTime = (x) => Math.max(1, Math.round(x / 10)) * 60;
  harness.timeScale.timeToIndex = (time) => time / 60;
  harness.manager.setCrosshairConfig({ pointSize: 0.001 });
  harness.manager.setActiveTool('crosshair');
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  const [vertical, horizontal, priceLabel, timeLabel, , tooltip, lockBadge, rectangle, anchor, anchorPriceLabel, anchorTimeLabel, stats] = overlay.children;

  harness.touchStart(208, 148.55);
  assert.equal(vertical.style.left, '150px');
  assert.equal(horizontal.style.top, '148px');
  harness.touchEnd(208, 148.55);

  assert.equal(rectangle.style.display, 'block');
  assert.equal(rectangle.style.left, '150px');
  assert.equal(rectangle.style.width, '60px');
  assert.equal(rectangle.style.border, '0');
  assert.equal(rectangle.style.background, 'rgba(244, 67, 54, 0.20)');
  assert.equal(anchor.style.left, '150px');
  assert.equal(anchor.style.top, '148px');
  assert.equal(anchor.style.width, '8px');
  assert.equal(anchor.style.height, '8px');
  assert.equal(priceLabel.textContent, '189.945');
  assert.equal(anchorPriceLabel.textContent, '190.000');
  assert.equal(anchorPriceLabel.style.display, 'block');
  assert.equal(anchorTimeLabel.style.display, 'block');
  assert.notEqual(anchorTimeLabel.textContent, timeLabel.textContent);
  assert.equal(stats.textContent, '55 points (-0.03%, -0.055)\n6 bars, 6m');
  assert.equal(stats.style.background, '#D3D3D3');
  assert.equal(stats.style.color, '#000000');
  assert.equal(stats.style.font, '400 13px Arial, sans-serif');
  assert.equal(overlay.children[12].style.display, 'block');
  assert.equal(overlay.children[12].style.left, '150px');
  assert.equal(overlay.children[12].style.height, '296px');
  assert.equal(overlay.children[13].style.display, 'block');
  assert.equal(overlay.children[13].style.top, '148px');
  assert.equal(overlay.children[13].style.width, '296px');
  assert.equal(tooltip.style.display, 'none');
  assert.equal(lockBadge.style.display, 'none');
  assert.equal(harness.manager.getActiveTool(), 'crosshair');
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Crosshair positive ruler uses a signed percent, blue fill, and a gray stats label above its endpoint', () => {
  const harness = createFakeChartEnvironment({ priceFormat: { precision: 3 }, touch: true });
  harness.setPriceCoordinateMapping(204.8);
  harness.manager.setCrosshairConfig({ pointSize: 0.001 });
  harness.manager.setActiveTool('crosshair');
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  overlay.children[11].offsetWidth = 120;
  overlay.children[11].offsetHeight = 32;
  harness.touchStart(180, 147.57);
  harness.touchEnd(180, 147.57);

  assert.match(overlay.children[11].textContent, /^43 points \(\+0.02%, \+0.043\)/);
  assert.equal(overlay.children[7].style.background, 'rgba(33, 150, 243, 0.20)');
  assert.equal(overlay.children[7].style.border, '0');
  assert.equal(overlay.children[11].style.left, '56px', 'label flips left when there is insufficient room to the right');
  assert.equal(overlay.children[11].style.top, '112px');
});

test('Crosshair negative ruler stats sit below and beside the endpoint rather than inside the rectangle', () => {
  const harness = createFakeChartEnvironment({ touch: true });
  harness.manager.setActiveTool('crosshair');
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  overlay.children[11].offsetWidth = 100;
  overlay.children[11].offsetHeight = 32;
  harness.touchStart(120, 180);
  harness.touchEnd(120, 180);
  assert.equal(overlay.children[11].style.left, '124px');
  assert.equal(overlay.children[11].style.top, '184px');
  assert.equal(overlay.children[12].style.height, '296px');
  assert.equal(overlay.children[13].style.width, '296px');
});

test('Crosshair ruler points and price change use the same digit-rounded prices as its axis labels', () => {
  const harness = createFakeChartEnvironment({ priceFormat: { minMove: 0.01, precision: 3 }, touch: true });
  harness.setPriceCoordinateMapping(76.5276);
  harness.manager.setActiveTool('crosshair');
  harness.touchStart(180, 149.612);
  harness.touchEnd(180, 149.612);
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.equal(overlay.children[9].textContent, '61.728');
  assert.equal(overlay.children[2].textContent, '61.566');
  assert.match(overlay.children[11].textContent, /^162 points \(-0.26%, -0.162\)/);
  assert.equal(harness.manager._resolveCrosshairPointSize(), 0.001, 'digit point must not be replaced by a larger trading tick size');
});

test('Crosshair tap on the current cursor shows a zero ruler and a second tap exits inspection', () => {
  const harness = createFakeChartEnvironment({ priceFormat: { precision: 3 }, touch: true });
  harness.manager.setActiveTool('crosshair');
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  harness.touchStart(148, 148);
  harness.touchEnd(148, 148);
  assert.equal(overlay.children[11].textContent, '0 points (0.00%, +0.000)\n0 bars, 0m');
  assert.ok(harness.manager._crosshairRulerAnchor);

  harness.touchStart(210, 190);
  harness.touchEnd(210, 190);
  assert.equal(harness.manager.getActiveTool(), 'none');
  assert.equal(overlay.style.display, 'none');
  assert.equal(harness.manager._crosshairRulerAnchor, null);
  assert.equal(harness.toolsChanged().at(-1)?.tool, 'none');
  const restored = harness.appliedOptions.at(-1) as any;
  assert.equal(restored.handleScroll.horzTouchDrag, true);
  assert.equal(restored.handleScale.pinch, true);
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Crosshair ruler taps inspect the exact pointer price even when drawing magnet snapping is enabled', () => {
  const harness = createFakeChartEnvironment({
    seriesData: Array.from({ length: 30 }, (_, index) => ({
      time: index + 1, open: 85, high: 87, low: 83, close: 84,
    })),
    touch: true,
  });
  harness.manager.setCrosshairConfig({
    snap: { enabled: true, type: 'ohlc-nearest', thresholdPx: 18 },
  });
  harness.manager.setActiveTool('crosshair');
  harness.touchStart(180, 164);
  harness.touchEnd(180, 164);
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.equal(overlay.children[2].textContent, '83.60000');
  assert.equal(overlay.children[1].style.top, '164px');
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Crosshair ruler drag moves only the endpoint by touch delta and survives library events and release', () => {
  const harness = createFakeChartEnvironment({ touch: true });
  harness.manager.setCrosshairConfig({ pointSize: 0.1 });
  harness.manager.setActiveTool('crosshair');
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  harness.touchStart(208, 180);
  harness.touchEnd(208, 180);
  const originalAnchor = harness.manager._crosshairRulerAnchor;

  harness.touchStart(10, 220);
  assert.equal(overlay.children[0].style.left, '210px');
  harness.touchMove(30, 200);
  harness.move(30, 200);
  harness.touchEnd(30, 200);
  harness.move(30, 200);
  harness.click(30, 200);
  harness.manager.setActiveTool('crosshair');

  assert.equal(overlay.style.display, 'block');
  assert.equal(overlay.children[0].style.left, '230px');
  assert.equal(overlay.children[1].style.top, '160px');
  assert.equal(overlay.children[8].style.left, '150px');
  assert.equal(overlay.children[8].style.top, '148px');
  assert.equal(harness.manager._crosshairRulerAnchor, originalAnchor);
  assert.match(overlay.children[11].textContent, /^12 points \(-1.41%, -1.20000\)\n8 bars, 8s$/);
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Crosshair ruler measures logical bars in future space without clamping them to the final candle', () => {
  const harness = createFakeChartEnvironment({
    nullCoordinateTimeFromX: 40,
    seriesData: [{ time: 1, open: 90, high: 91, low: 80, close: 85 }, { time: 2, open: 90, high: 91, low: 80, close: 85 }],
    touch: true,
  });
  harness.manager.setActiveTool('crosshair');
  harness.touchStart(248, 180);
  harness.touchEnd(248, 180);
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.match(overlay.children[11].textContent, /\n10 bars, 10s$/);
  assert.equal(harness.manager._crosshairRulerAnchor.dataIndex, 1);
  assert.equal(harness.manager._lastCrosshairState.dataIndex, 1);
});

test('Crosshair ruler elapsed time follows actual timestamps across gaps instead of multiplying bars by timeframe', () => {
  const harness = createFakeChartEnvironment({ touch: true });
  harness.timeScale.coordinateToTime = (x) => {
    const bar = Math.max(1, Math.round(x / 10));
    return bar * 60 + (bar >= 20 ? 86400 : 0);
  };
  harness.manager.setActiveTool('crosshair');
  harness.touchStart(208, 180);
  harness.touchEnd(208, 180);
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.match(overlay.children[11].textContent, /\n6 bars, 1d 6m$/);
  assert.doesNotMatch(overlay.children[11].textContent, /6 bars, 6m$/);
});

test('Crosshair ruler preserves remaining minutes after whole hours', () => {
  const harness = createFakeChartEnvironment({ touch: true });
  harness.timeScale.coordinateToTime = (x) => Math.max(1, Math.round(x / 10)) * 15 * 60;
  harness.manager.setCrosshairConfig({ timeframe: 'M15' });
  harness.manager.setActiveTool('crosshair');
  harness.touchStart(210, 180);
  harness.touchEnd(210, 180);
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.match(overlay.children[11].textContent, /\n6 bars, 1h 30m$/);
  harness.touchStart(10, 250);
  harness.touchMove(30, 250);
  harness.touchEnd(30, 250);
  assert.match(overlay.children[11].textContent, /\n8 bars, 2h$/);
});

test('Crosshair live-scale refresh keeps both ruler labels and measurement aligned with retained screen positions', () => {
  const harness = createFakeChartEnvironment({ touch: true });
  harness.manager.setCrosshairConfig({ pointSize: 0.01 });
  harness.manager.setActiveTool('crosshair');
  harness.touchStart(180, 160);
  harness.touchEnd(180, 160);
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');

  harness.setPriceCoordinateMapping(110, 20);
  harness.timeScale.coordinateToTime = (x) => Math.max(1, Math.round(x / 10)) + 3600;
  harness.manager.refreshCrosshairData();

  assert.equal(overlay.children[0].style.left, '180px');
  assert.equal(overlay.children[1].style.top, '160px');
  assert.equal(overlay.children[8].style.left, '150px');
  assert.equal(overlay.children[8].style.top, '148px');
  assert.equal(overlay.children[2].textContent, '102.00000');
  assert.equal(overlay.children[9].textContent, '102.60000');
  assert.equal(harness.manager._crosshairRulerAnchor.time, 3615);
  assert.equal(harness.manager._lastCrosshairState.time, 3618);
  assert.match(overlay.children[11].textContent, /^60 points .*\n3 bars, 3s$/);
});

test('Crosshair point metadata clears by context and survives partial magnet config without symbol guesses', () => {
  const harness = createFakeChartEnvironment({ priceFormat: {}, touch: true });
  harness.manager.setCrosshairConfig({ symbol: 'GBPUSD', pointSize: 0.00001 });
  assert.equal(harness.manager._resolveCrosshairPointSize(), 0.00001);
  harness.manager.setCrosshairConfig({ snap: { enabled: true } });
  assert.equal(harness.manager._resolveCrosshairPointSize(), 0.00001);
  harness.manager.setCrosshairConfig({ symbol: 'BTCUSD', pointSize: null });
  assert.equal(harness.manager._resolveCrosshairPointSize(), null);
  harness.manager.setCrosshairConfig({ pointSize: 0.01 });
  harness.manager.setCrosshairConfig({ symbol: 'XAUUSD' });
  assert.equal(harness.manager._resolveCrosshairPointSize(), null);
  harness.manager.setCrosshairConfig({ pointSize: -1 });
  assert.equal(harness.manager._resolveCrosshairPointSize(), null);
  harness.manager.setActiveTool('crosshair');
  harness.touchStart(180, 170);
  harness.touchEnd(180, 170);
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.match(overlay.children[11].textContent, /^Price change/);
  assert.doesNotMatch(overlay.children[11].textContent, /points/);
});

test('Crosshair survives empty move events, touch cancellation, and suppressed multitouch gestures', () => {
  const harness = createFakeChartEnvironment({ touch: true });
  harness.manager.setActiveTool('crosshair');
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  const [vertical, horizontal] = overlay.children;
  const first = { clientX: 148, clientY: 148, identifier: 1 };
  const second = { clientX: 210, clientY: 180, identifier: 2 };
  const event = (touches: any[], changedTouches = touches) => ({
    touches,
    changedTouches,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    stopImmediatePropagation: () => undefined,
  });

  harness.manager._handleCrosshairMove({});
  harness.manager._handleTouchCancel(event([]));
  harness.manager._handleTouchStart(event([first, second], [second]));
  harness.manager._handleTouchMove(event([first, second]));
  harness.manager._handleCrosshairMove({ point: { x: 210, y: 180 }, time: 21 });
  harness.manager._handleTouchEnd(event([], [first, second]));

  assert.equal(overlay.style.display, 'block');
  assert.equal(vertical.style.left, '150px');
  assert.equal(horizontal.style.top, '148px');
  assert.equal(harness.manager._crosshairLocked, false);
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Crosshair retries its centered seed when candle data arrives after activation', () => {
  const seriesData: Array<Record<string, number>> = [];
  const harness = createFakeChartEnvironment({ seriesData, touch: true });
  harness.manager.setActiveTool('crosshair');
  assert.equal(harness.manager._regularCrosshairSeedPending, true);
  assert.equal(harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true'), undefined);

  seriesData.push({ time: 1, open: 90, high: 95, low: 80, close: 92 });
  harness.manager.refreshCrosshairData();
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.ok(overlay);
  assert.equal(overlay.style.display, 'block');
  assert.equal(overlay.children[0].style.left, '150px');
  assert.equal(harness.manager._regularCrosshairSeedPending, false);
});

test('Crosshair toggle-off and drawing replay discard any queued cursor render', () => {
  for (const reset of ['toggle-off', 'replay']) {
    const harness = createFakeChartEnvironment({ deferredAnimationFrames: true, touch: true });
    harness.manager.setActiveTool('crosshair');
    harness.flushAnimationFrames();
    const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
    assert.equal(overlay.style.display, 'block');
    harness.touchStart(148, 148);
    harness.touchMove(160, 170);
    if (reset === 'toggle-off') {
      harness.manager.setActiveTool('none');
    } else {
      harness.manager.setSerializedDrawings([]);
    }
    harness.flushAnimationFrames();
    harness.manager.refreshCrosshairData();
    harness.flushAnimationFrames();
    assert.equal(overlay.style.display, 'none');
    assert.equal(harness.manager._lastCrosshairParam, null);
    assert.equal(harness.manager._pendingCrosshairState, null);

    harness.manager.setActiveTool('crosshair');
    harness.flushAnimationFrames();
    assert.equal(overlay.style.display, 'block');
    assert.equal(overlay.children[0].style.left, '150px');
    assert.equal(overlay.children[1].style.top, '148px');
  }
});

test('Area inspector configuration is disabled by default and remains settable independently of magnet mode', () => {
  const harness = createFakeChartEnvironment();

  assert.equal(harness.manager._crosshairConfig.areaSeriesInspector, false);

  harness.manager.setCrosshairConfig({ areaSeriesInspector: true });
  harness.manager.setCrosshairConfig({ snap: { enabled: true, type: 'ohlc-nearest' } });
  assert.equal(harness.manager._crosshairConfig.areaSeriesInspector, true);

  harness.manager.setCrosshairConfig({ areaSeriesInspector: false });
  assert.equal(harness.manager._crosshairConfig.areaSeriesInspector, false);
});

test('Area inspector configuration does not snap ordinary drawing tools to Area values', () => {
  const harness = createFakeChartEnvironment({
    seriesData: [
      { time: 1, value: 92 },
      { time: 2, value: 94 },
    ],
  });

  harness.manager.setCrosshairConfig({ areaSeriesInspector: true });
  harness.manager.setActiveTool('trendline');
  harness.click(10, 100, 1);
  harness.click(20, 200, 2);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.deepEqual(drawings[0].points.map((point: any) => point.price), [90, 80]);
});

test('Area inspector seeds the latest point and snaps movement to the nearest Area time and value', () => {
  const harness = createFakeChartEnvironment({
    seriesData: [
      { time: 1, value: 92 },
      { time: 2, value: 94 },
      { time: 3, value: 97 },
    ],
    touch: true,
  });

  harness.manager.setCrosshairConfig({ areaSeriesInspector: true, timeframe: '1D' });
  harness.manager.setActiveTool('crosshair');

  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.ok(overlay);
  const [vertical, horizontal, priceLabel, timeLabel, center, tooltip] = overlay.children;

  assert.equal(overlay.style.display, 'block');
  assert.equal(vertical.style.left, '30px');
  assert.equal(horizontal.style.display, 'none');
  assert.equal(center.style.left, '30px');
  assert.equal(center.style.top, '30px');
  assert.equal(priceLabel.style.display, 'none');
  assert.equal(timeLabel.style.display, 'none');
  assert.match(tooltip.innerHTML, /97\.00000/);
  assert.match(tooltip.innerHTML, /01 Jan 1970/);
  assert.doesNotMatch(tooltip.innerHTML, />O</);
  assert.deepEqual(harness.crosshairMessages().at(-1)?.candle, {
    close: 97,
    high: 97,
    low: 97,
    open: 97,
    time: 3,
    volume: null,
  });

  // The pointer is between points and far below the series. Area inspection
  // must still land on point 2 rather than deriving a price from pointer Y.
  harness.move(16, 240, 2);

  assert.equal(vertical.style.left, '20px');
  assert.equal(center.style.left, '20px');
  assert.equal(center.style.top, '60px');
  assert.match(tooltip.innerHTML, /94\.00000/);
  assert.equal(harness.crosshairMessages().at(-1)?.candle?.time, 2);
  assert.equal(harness.crosshairMessages().at(-1)?.candle?.close, 94);
});

test('Area inspector retries its initial latest-point seed when data arrives after activation', () => {
  const seriesData: Array<Record<string, number>> = [];
  const harness = createFakeChartEnvironment({ seriesData, touch: true });

  harness.manager.setCrosshairConfig({ areaSeriesInspector: true });
  harness.manager.setActiveTool('crosshair');

  assert.equal(harness.manager._areaInspectorSeedPending, true);
  assert.equal(
    harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true'),
    undefined,
  );

  seriesData.push(
    { time: 1, value: 92 },
    { time: 2, value: 94 },
  );
  harness.manager.refreshCrosshairData();

  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.ok(overlay);
  const [vertical, horizontal, , , center, tooltip] = overlay.children;
  assert.equal(harness.manager._areaInspectorSeedPending, false);
  assert.equal(overlay.style.display, 'block');
  assert.equal(vertical.style.left, '20px');
  assert.equal(horizontal.style.display, 'none');
  assert.equal(center.style.left, '20px');
  assert.match(tooltip.innerHTML, /94\.00000/);
});

test('Area inspector preserves touch drag, tap lock, unlock, and pinch suppression', () => {
  const harness = createFakeChartEnvironment({
    seriesData: [
      { time: 1, value: 92 },
      { time: 2, value: 94 },
      { time: 3, value: 97 },
    ],
    touch: true,
  });
  const makeGestureEvent = (touches: any[], changedTouches = touches) => ({
    changedTouches,
    preventDefault: () => undefined,
    stopImmediatePropagation: () => undefined,
    stopPropagation: () => undefined,
    touches,
  });

  harness.manager.setCrosshairConfig({ areaSeriesInspector: true });
  harness.manager.setActiveTool('crosshair');
  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  const [vertical, , , , , , lockBadge] = overlay.children;

  const first = { clientX: 16, clientY: 220, identifier: 1 };
  const second = { clientX: 50, clientY: 220, identifier: 2 };
  harness.manager._handleTouchStart(makeGestureEvent([first, second], [second]));
  assert.equal(overlay.style.display, 'none');
  assert.equal(harness.manager._crosshairLocked, false);
  harness.manager._handleTouchEnd(makeGestureEvent([], [second]));
  assert.equal(harness.manager._crosshairLocked, false);

  harness.touchStart(16, 220);
  harness.touchEnd(16, 220);
  assert.equal(harness.manager._crosshairLocked, true);
  assert.equal(overlay.style.display, 'block');
  assert.equal(vertical.style.left, '20px');
  assert.equal(lockBadge.style.display, 'block');

  harness.touchStart(26, 220);
  harness.touchMove(6, 260);
  harness.touchEnd(6, 260);
  assert.equal(harness.manager._crosshairLocked, true);
  assert.equal(overlay.style.display, 'block');
  assert.equal(vertical.style.left, '10px');

  harness.touchStart(6, 260);
  harness.touchEnd(6, 260);
  assert.equal(harness.manager._crosshairLocked, false);
  assert.equal(overlay.style.display, 'none');

  // A deliberate unlock is not an incomplete initial seed. Live refreshes
  // must keep the inspector dismissed until the user interacts again.
  harness.manager.refreshCrosshairData();
  assert.equal(overlay.style.display, 'none');
});

test('No drawing tool selected leaves chart touches passive and hides drawing UI', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  assert.equal(harness.manager.getActiveTool(), 'none');
  const startEvent = harness.touchStart(120, 140);
  const moveEvent = harness.touchMove(124, 144);
  const endEvent = harness.touchEnd(124, 144);
  harness.move(124, 144);
  harness.click(124, 144);

  assert.equal(startEvent.preventDefaultCalls, 0);
  assert.equal(moveEvent.preventDefaultCalls, 0);
  assert.equal(endEvent.preventDefaultCalls, 0);
  assert.equal(harness.host.style.touchAction, 'none');
  assert.equal(harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true'), undefined);
  assert.deepEqual(harness.crosshairMessages(), []);
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Magnet mode snaps drawing anchors to nearby OHLC prices', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setCrosshairConfig({
    snap: { enabled: true, type: 'ohlc-nearest', thresholdPx: 18 },
  });
  harness.manager.setActiveTool('trendline');
  harness.click(10, 954);
  harness.click(20, 954);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'trendline');
  assert.equal(drawings[0].points[0].price, 5);
  assert.equal(drawings[0].points[1].price, 5);
});

test('Serialized drawings stay visible regardless of the selected drawing tool', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'text_level_saved',
      kind: 'textLevel',
      label: 'Entry',
      points: [{ time: 1, price: 90 }],
      text: 'Entry',
    },
    {
      hidden: false,
      id: 'fib_saved',
      kind: 'fib',
      label: 'Fib',
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
    },
  ]);

  const textLevelPrimitive: any = harness.attachedPrimitives[0];
  const fibPrimitive: any = harness.attachedPrimitives[1];
  // TradingView parity: restored drawings render immediately, before any
  // drawing tool is armed.
  assert.equal(textLevelPrimitive._options.visible, true);
  assert.equal(fibPrimitive._options.visible, true);
  assert.equal(harness.latestDrawings().length, 2);
  assert.equal(harness.latestDrawings()[0].hidden, false);

  harness.manager.setActiveTool('textLevel');
  assert.equal(textLevelPrimitive._options.visible, true);
  assert.equal(fibPrimitive._options.visible, true);

  harness.manager.setActiveTool('fib');
  assert.equal(textLevelPrimitive._options.visible, true);
  assert.equal(fibPrimitive._options.visible, true);

  harness.manager.setActiveTool('none');
  assert.equal(textLevelPrimitive._options.visible, true);
  assert.equal(fibPrimitive._options.visible, true);

  harness.manager.setDrawingsHidden(true);
  assert.equal(textLevelPrimitive._options.visible, false);
  assert.equal(fibPrimitive._options.visible, false);

  harness.manager.setDrawingsHidden(false);
  assert.equal(textLevelPrimitive._options.visible, true);
  assert.equal(fibPrimitive._options.visible, true);
});

test('Trend Line creates a two-point line and keeps only that tool selected', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.move(20, 90);
  harness.click(20, 90);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'trendline');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].type, 'trendline');
  assert.equal(drawings[0].paneId, 'main');
  assert.equal(drawings[0].extendMode, 'none');
  assert.equal(drawings[0].style.color, '#2962FF');
  assert.equal(typeof drawings[0].createdAt, 'number');
  assert.equal(typeof drawings[0].updatedAt, 'number');
  assert.equal(harness.manager.getActiveTool(), 'trendline');
  const toolMessages = harness.toolsChanged();
  assert.equal(toolMessages[toolMessages.length - 1]?.drawingActive, false);
});

test('Trend Line can be selected and deleted from crosshair mode', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(20, 90);
  harness.manager.setActiveTool('crosshair');
  (harness.manager as any)._ignoreCrosshairClickUntil = 0;
  harness.click(15, 95);

  assert.equal(harness.latestDrawings()[0].selected, true);
  (harness.manager as any)._handleKeyDown({ key: 'Delete', preventDefault: () => undefined });

  assert.equal(harness.latestDrawings().length, 0);
});

test('Trend Line direct mobile editing moves endpoints and whole lines without React move spam', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('trendline');
  harness.touchStart(10, 100);
  harness.touchMove(100, 60);
  harness.touchEnd(100, 60);
  assert.equal(harness.latestDrawings().length, 1);

  harness.manager.setActiveTool('crosshair');
  harness.touchStart(10, 100);
  const messagesBeforeEndpointMove = harness.drawingMessages().length;
  harness.touchMove(20, 110);
  assert.equal(harness.drawingMessages().length, messagesBeforeEndpointMove);
  harness.touchEnd(20, 110);

  let drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].points[0].time, 2);
  assert.equal(drawings[0].points[0].price, 89);
  assert.equal(drawings[0].points[1].time, 10);
  assert.equal(drawings[0].points[1].price, 94);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  harness.touchStart(60, 85);
  const messagesBeforeBodyMove = harness.drawingMessages().length;
  harness.touchMove(70, 95);
  assert.equal(harness.drawingMessages().length, messagesBeforeBodyMove);
  harness.touchEnd(70, 95);

  drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 3);
  assert.equal(drawings[0].points[0].price, 88);
  assert.equal(drawings[0].points[1].time, 11);
  assert.equal(drawings[0].points[1].price, 93);
});

test('Trend Line supports direct mobile drag input without chart pan interference', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('trendline');
  const startEvent = harness.touchStart(10, 100);
  const moveEvent = harness.touchMove(40, 80);
  const endEvent = harness.touchEnd(40, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'trendline');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(harness.manager.getActiveTool(), 'trendline');
  const toolMessages = harness.toolsChanged();
  assert.equal(toolMessages[toolMessages.length - 1]?.drawingActive, false);
  assert.equal(startEvent.preventDefaultCalls, 1);
  assert.equal(moveEvent.preventDefaultCalls, 1);
  assert.equal(endEvent.preventDefaultCalls, 1);
  assert.equal(harness.host.style.touchAction, 'none');
});

test('Direct touch box tools commit in empty chart space even when touchend has no changed touch', () => {
  const harness = createFakeChartEnvironment({ nullCoordinateTimeFromX: 250, touch: true });

  harness.manager.setActiveTool('measure');
  harness.touchStart(20, 120);
  harness.touchEnd(20, 120, { emptyChangedTouches: true });
  harness.touchStart(320, 80);
  harness.touchEnd(320, 80, { emptyChangedTouches: true });

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'measure');
  assert.equal(drawings[0].points.length, 2);
  assert.ok(drawings[0].points[1].time > drawings[0].points[0].time);
  assert.notEqual(drawings[0].points[1].price, drawings[0].points[0].price);

  harness.manager.setActiveTool('measure');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const renderer = primitive.paneViews()[0].renderer();
  const drawTarget = createFakeBitmapTarget();
  renderer.draw(drawTarget.target);
  assert.ok(drawTarget.roundRects.some((rect) => rect.width > 250 && rect.height > 30));
});

test('Fibonacci Retracement creates standard 0-1 retracement levels without default zones', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setCrosshairConfig({ symbol: 'BTCUSD', timeframe: 'M1' });
  harness.manager.setActiveTool('fib');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'fib');
  assert.equal(drawings[0].type, 'fibRetracement');
  assert.equal(drawings[0].symbol, 'BTCUSD');
  assert.equal(drawings[0].timeframe, 'M1');
  assert.equal(drawings[0].points.length, 2);
  assert.ok(drawings[0].levels.some((level: any) => level.value === 0.618));
  assert.ok(drawings[0].levels.some((level: any) => level.value === 0.786));
  assert.equal(drawings[0].levels.some((level: any) => level.value === 0.65), false);
  assert.equal(drawings[0].levels.some((level: any) => level.value > 1), false);
  assert.equal(drawings[0].goldenPocket.enabled, false);
  assert.equal(drawings[0].extendMode, 'none');

  harness.manager.setActiveTool('fib');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  const prices = primitive.getLevelPrices();
  assert.equal(prices.find((level: any) => level.value === 0).price, 90);
  assert.equal(prices.find((level: any) => level.value === 0.5).price, 91);
  assert.equal(prices.find((level: any) => level.value === 1).price, 92);
  assert.equal(Number(prices.find((level: any) => level.value === 0.618).price.toFixed(3)), 91.236);
  assert.equal(Number(prices.find((level: any) => level.value === 0.786).price.toFixed(3)), 91.572);

  primitive.updateAllViews();
  const renderer = primitive.paneViews()[0].renderer();
  const drawTarget = createFakeBitmapTarget();
  renderer.draw(drawTarget.target);
  assert.ok(drawTarget.fillRects.length > 0);
  assert.ok(drawTarget.lines.length >= drawings[0].levels.length);
});

test('Fibonacci Retracement stacks crowded horizontal level labels without overlap', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('fib');
  harness.click(10, 300);
  harness.click(30, 310);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);

  const labelRects = drawTarget.roundRects.filter((rect) => rect.width > 24 && rect.height > 8);
  assert.ok(labelRects.length >= 5);
  const sorted = labelRects.slice().sort((a, b) => a.y - b.y);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    assert.ok(current.y >= previous.y + previous.height);
  }
});

test('Fibonacci Retracement calculates bearish direction accurately on restore', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([{
    id: 'fib_bearish',
    kind: 'fib',
    label: 'Bearish Fib',
    points: [{ time: 1, price: 200 }, { time: 3, price: 100 }],
  }]);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  const prices = primitive.getLevelPrices();
  assert.equal(prices.find((level: any) => level.value === 0).price, 200);
  assert.equal(prices.find((level: any) => level.value === 0.5).price, 150);
  assert.equal(prices.find((level: any) => level.value === 1).price, 100);
  assert.equal(Number(prices.find((level: any) => level.value === 0.618).price.toFixed(1)), 138.2);
  assert.equal(prices.some((level: any) => level.value > 1), false);
});

test('Fibonacci Retracement supports mobile anchor and body editing without React move spam', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('fib');
  harness.touchStart(10, 100);
  harness.touchMove(120, 60);
  harness.touchEnd(120, 60);

  let drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'fib');

  harness.manager.setActiveTool('crosshair');
  harness.touchStart(120, 60);
  const messagesBeforeAnchorMove = harness.drawingMessages().length;
  harness.touchMove(130, 70);
  assert.equal(harness.drawingMessages().length, messagesBeforeAnchorMove);
  harness.touchEnd(130, 70);

  drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 1);
  assert.equal(drawings[0].points[0].price, 90);
  assert.equal(drawings[0].points[1].time, 13);
  assert.equal(drawings[0].points[1].price, 93);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal((harness.manager as any)._hitTestEditableDrawingAtPoint({ x: 70, y: 85 })?.part, 'body');

  harness.touchStart(70, 85);
  const messagesBeforeBodyMove = harness.drawingMessages().length;
  harness.touchMove(80, 95);
  assert.equal(harness.drawingMessages().length, messagesBeforeBodyMove);
  harness.touchEnd(80, 95);

  drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 2);
  assert.equal(drawings[0].points[0].price, 89);
  assert.equal(drawings[0].points[1].time, 14);
  assert.equal(drawings[0].points[1].price, 92);
});

test('Highlight Box creates a two-point box drawing with persistence metadata', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('brush');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'brush');
  assert.equal(drawings[0].type, 'highlightBox');
  assert.equal(drawings[0].paneId, 'main');
  assert.equal(drawings[0].label, 'Highlight');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'none');
  assert.equal(drawings[0].extendUntil, 'none');
  assert.equal(drawings[0].zoneType, 'neutral');
  assert.equal(drawings[0].style.fillColor, 'rgba(41, 98, 255, 0.15)');
  assert.equal(drawings[0].style.borderColor, '#2962FF');
  assert.deepEqual(drawings[0].alertMetadata.supportedEvents, [
    'enter-zone',
    'exit-zone',
    'touch-top',
    'touch-bottom',
    'close-inside',
    'close-beyond',
  ]);
  assert.equal(drawings[0].alertMetadata.priceTop, 92);
  assert.equal(drawings[0].alertMetadata.priceBottom, 90);
  assert.equal(typeof drawings[0].createdAt, 'number');
  assert.equal(typeof drawings[0].updatedAt, 'number');
  assert.equal(harness.manager.getActiveTool(), 'brush');
});

test('Rectangle creates a separate two-point shape drawing without highlight metadata', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('rectangle');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'rectangle');
  assert.equal(drawings[0].type, 'rectangle');
  assert.equal(drawings[0].paneId, 'main');
  assert.equal(drawings[0].label, 'Rectangle');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'none');
  assert.equal(drawings[0].zoneType, undefined);
  assert.equal(drawings[0].extendUntil, undefined);
  assert.equal(drawings[0].alertMetadata, undefined);
  assert.equal(drawings[0].style.fillColor, 'rgba(100, 116, 139, 0.12)');
  assert.equal(drawings[0].style.borderColor, '#64748B');
  assert.equal(drawings[0].style.showLabel, false);
  assert.equal(harness.manager.getActiveTool(), 'rectangle');
});

test('Rectangle restore keeps shape styling independent from Highlight Box records', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      id: 'saved_rectangle',
      kind: 'rectangle',
      label: 'Rectangle saved',
      points: [{ time: 1, price: 90 }, { time: 8, price: 96 }],
      style: {
        borderColor: '#334155',
        borderStyle: 'dashed',
        fillColor: 'rgba(51, 65, 85, 0.12)',
        showLabel: true,
      },
      type: 'rectangle',
    },
    {
      id: 'saved_highlight',
      kind: 'brush',
      label: 'Demand zone',
      points: [{ time: 2, price: 88 }, { time: 4, price: 92 }],
      type: 'highlightBox',
      zoneType: 'demand',
    },
  ]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 2);
  assert.equal(drawings[0].kind, 'rectangle');
  assert.equal(drawings[0].type, 'rectangle');
  assert.equal(drawings[0].zoneType, undefined);
  assert.equal(drawings[0].style.borderStyle, 'dashed');
  assert.equal(drawings[1].kind, 'brush');
  assert.equal(drawings[1].type, 'highlightBox');
  assert.equal(drawings[1].zoneType, 'demand');

  const primitive: any = harness.attachedPrimitives[0];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal(primitive.hitTest({ x: 45, y: 70 }, { isTouch: false })?.part, 'body');
});

test('Circle / Ellipse creates a separate two-point oval drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('ellipse');
  harness.click(10, 120);
  harness.move(70, 60);
  harness.click(70, 60);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'ellipse');
  assert.equal(drawings[0].type, 'ellipse');
  assert.equal(drawings[0].paneId, 'main');
  assert.equal(drawings[0].label, 'Circle / Ellipse');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'none');
  assert.equal(drawings[0].zoneType, undefined);
  assert.equal(drawings[0].extendUntil, undefined);
  assert.equal(drawings[0].alertMetadata, undefined);
  assert.equal(drawings[0].style.fillColor, 'rgba(139, 92, 246, 0.12)');
  assert.equal(drawings[0].style.borderColor, '#8B5CF6');
  assert.equal(drawings[0].style.showLabel, false);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.equal(drawTarget.ellipses.length, 1);
  assert.equal(primitive.hitTest({ x: 40, y: 90 }, { isTouch: false })?.part, 'body');
});

test('Circle / Ellipse restore keeps oval styling and resize handles', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      id: 'saved_ellipse',
      kind: 'ellipse',
      label: 'Ellipse saved',
      points: [{ time: 1, price: 90 }, { time: 8, price: 96 }],
      style: {
        borderColor: '#7C3AED',
        borderStyle: 'dashed',
        fillColor: 'rgba(124, 58, 237, 0.12)',
        showLabel: true,
      },
      type: 'ellipse',
    },
  ]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'ellipse');
  assert.equal(drawings[0].type, 'ellipse');
  assert.equal(drawings[0].style.borderStyle, 'dashed');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  assert.equal(primitive.getHandleCoordinates().length, 8);
  assert.equal(primitive.hitTest({ x: 10, y: 100 }, { isTouch: false })?.part, 'bottom-left');
});

test('Freehand Brush creates and restores a multi-point path', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('freehand');
  harness.click(10, 100);
  harness.move(20, 94);
  harness.move(30, 98);
  harness.move(40, 90);
  harness.click(50, 88);

  let drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'freehand');
  assert.equal(drawings[0].type, 'freehand');
  assert.equal(drawings[0].label, 'Freehand Brush 1');
  assert.equal(drawings[0].points.length, 5);
  assert.equal(drawings[0].style.color, '#EC4899');
  assert.equal(drawings[0].style.width, 3);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 4);
  assert.equal(primitive.hitTest({ x: 30, y: 98 }, { isTouch: false })?.part, 'body');

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'freehand_saved',
      kind: 'freehand',
      label: 'Saved path',
      points: drawings[0].points,
      style: { color: '#BE185D', lineStyle: 'dashed', width: 4 },
      type: 'freehand',
    },
  ]);

  drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'freehand');
  assert.equal(drawings[0].points.length, 5);
  assert.equal(drawings[0].style.lineStyle, 'dashed');
});

test('Freehand Brush supports direct mobile drag creation without trimming path points', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('freehand');
  const startEvent = harness.touchStart(10, 100);
  harness.touchMove(20, 96);
  harness.touchMove(30, 94);
  harness.touchMove(40, 92);
  const endEvent = harness.touchEnd(50, 90);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'freehand');
  assert.ok(drawings[0].points.length >= 5);
  assert.equal(startEvent.preventDefaultCalls, 1);
  assert.equal(endEvent.preventDefaultCalls, 1);
});

test('Highlight Box restore preserves serialized zone metadata and alert settings', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([{
    alertMetadata: {
      id: 'supply-alert-1',
      supportedEvents: ['enter-zone'],
      triggerOnce: true,
    },
    createdAt: 1000,
    extendMode: 'right',
    extendUntil: 'price-touch',
    hidden: true,
    id: 'supply_zone_saved',
    kind: 'brush',
    label: 'London supply',
    locked: true,
    paneId: 'main',
    points: [{ time: 1, price: 95 }, { time: 4, price: 90 }],
    selected: true,
    style: {
      borderColor: '#EF5350',
      borderStyle: 'dashed',
      fillColor: 'rgba(239, 83, 80, 0.14)',
      showMidline: true,
    },
    type: 'highlightBox',
    updatedAt: 2000,
    zoneType: 'supply',
  }]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].id, 'supply_zone_saved');
  assert.equal(drawings[0].kind, 'brush');
  assert.equal(drawings[0].type, 'highlightBox');
  assert.equal(drawings[0].label, 'London supply');
  assert.equal(drawings[0].zoneType, 'supply');
  assert.equal(drawings[0].extendMode, 'right');
  assert.equal(drawings[0].extendUntil, 'price-touch');
  assert.equal(drawings[0].hidden, true);
  assert.equal(drawings[0].locked, true);
  assert.equal(drawings[0].selected, true);
  assert.equal(drawings[0].createdAt, 1000);
  assert.equal(drawings[0].updatedAt, 2000);
  assert.deepEqual(drawings[0].alertMetadata, {
    id: 'supply-alert-1',
    supportedEvents: ['enter-zone'],
    triggerOnce: true,
  });
  assert.equal(drawings[0].style.borderStyle, 'dashed');
  assert.equal(drawings[0].style.showMidline, true);
});

test('Highlight Box right extension renders to the pane edge without moving anchors', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([{
    extendMode: 'right',
    id: 'extended_demand_zone',
    kind: 'brush',
    label: 'Extended demand',
    points: [{ time: 1, price: 90 }, { time: 8, price: 96 }],
    style: { showLabel: false },
    type: 'highlightBox',
    zoneType: 'demand',
  }]);

  harness.manager.setActiveTool('brush');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const renderer = primitive.paneViews()[0].renderer();
  const drawTarget = createFakeBitmapTarget();
  renderer.draw(drawTarget.target);

  const geometry = primitive.getGeometry();
  assert.deepEqual(primitive.getPoints(), [{ time: 1, price: 90 }, { time: 8, price: 96 }]);
  assert.equal(geometry.anchorRect.anchorLeft, 10);
  assert.equal(geometry.anchorRect.anchorRight, 80);
  assert.equal(geometry.visibleRect.left, 10);
  assert.equal(geometry.visibleRect.right, 360);
  assert.ok(drawTarget.roundRects.some((rect) => rect.x === 10 && rect.width >= 349));
});

test('Highlight Box hit testing prefers handles over body and extended fill', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([{
    extendMode: 'right',
    id: 'editable_box',
    kind: 'brush',
    label: 'Editable Box',
    points: [{ time: 1, price: 90 }, { time: 8, price: 96 }],
    selected: true,
    style: { showLabel: false },
    type: 'highlightBox',
  }]);

  harness.manager.setActiveTool('brush');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  const hitContext = { isTouch: false, manager: harness.manager };
  assert.equal(primitive.hitTest({ x: 10, y: 40 }, hitContext)?.part, 'top-left');
  assert.equal(primitive.hitTest({ x: 45, y: 70 }, hitContext)?.part, 'body');
  assert.equal(primitive.hitTest({ x: 200, y: 70 }, hitContext)?.part, 'body');
});

test('Highlight Box edge and corner resize math updates only the intended boundaries', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([{
    id: 'resize_math_box',
    kind: 'brush',
    label: 'Resize Math',
    points: [{ time: 5, price: 90 }, { time: 1, price: 100 }],
    type: 'highlightBox',
  }]);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  const originalPoints = [{ time: 5, price: 90 }, { time: 1, price: 100 }];

  assert.deepEqual(
    primitive.buildEditPoints('top-left', originalPoints, originalPoints[1], { time: 2, price: 110 }),
    [{ time: 5, price: 90 }, { time: 2, price: 110 }],
  );
  assert.deepEqual(
    primitive.buildEditPoints('right', originalPoints, originalPoints[0], { time: 7, price: 95 }),
    [{ time: 7, price: 90 }, { time: 1, price: 100 }],
  );
  assert.deepEqual(
    primitive.buildEditPoints('bottom', originalPoints, originalPoints[0], { time: 3, price: 80 }),
    [{ time: 5, price: 80 }, { time: 1, price: 100 }],
  );
});

test('Highlight Box direct mobile drag creation and resize avoid React move spam', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('brush');
  const startEvent = harness.touchStart(10, 100);
  const messagesBeforeCreateMove = harness.drawingMessages().length;
  const moveEvent = harness.touchMove(80, 40);
  assert.equal(harness.drawingMessages().length, messagesBeforeCreateMove);
  const endEvent = harness.touchEnd(80, 40);

  let drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'brush');
  assert.equal(drawings[0].type, 'highlightBox');
  assert.equal(drawings[0].points[0].time, 1);
  assert.equal(drawings[0].points[0].price, 90);
  assert.equal(drawings[0].points[1].time, 8);
  assert.equal(drawings[0].points[1].price, 96);
  assert.equal(startEvent.preventDefaultCalls, 1);
  assert.equal(moveEvent.preventDefaultCalls, 1);
  assert.equal(endEvent.preventDefaultCalls, 1);
  assert.equal(harness.manager.getActiveTool(), 'brush');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  harness.manager.setActiveTool('crosshair');
  const editStartEvent = harness.touchStart(80, 40);
  const messagesBeforeResizeMove = harness.drawingMessages().length;
  const editMoveEvent = harness.touchMove(90, 30);
  assert.equal(harness.drawingMessages().length, messagesBeforeResizeMove);
  const editEndEvent = harness.touchEnd(90, 30);

  drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 1);
  assert.equal(drawings[0].points[0].price, 90);
  assert.equal(drawings[0].points[1].time, 9);
  assert.equal(drawings[0].points[1].price, 97);
  assert.equal(editStartEvent.preventDefaultCalls, 1);
  assert.equal(editMoveEvent.preventDefaultCalls, 1);
  assert.equal(editEndEvent.preventDefaultCalls, 1);

  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  const bodyStartEvent = harness.touchStart(45, 70);
  const messagesBeforeBodyMove = harness.drawingMessages().length;
  const bodyMoveEvent = harness.touchMove(55, 60);
  assert.equal(harness.drawingMessages().length, messagesBeforeBodyMove);
  const bodyEndEvent = harness.touchEnd(55, 60);

  drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 2);
  assert.equal(drawings[0].points[0].price, 91);
  assert.equal(drawings[0].points[1].time, 10);
  assert.equal(drawings[0].points[1].price, 98);
  assert.equal(bodyStartEvent.preventDefaultCalls, 1);
  assert.equal(bodyMoveEvent.preventDefaultCalls, 1);
  assert.equal(bodyEndEvent.preventDefaultCalls, 1);
});

test('Text Label creates a one-point label drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('text');
  harness.click(10, 100);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'text');
  assert.equal(drawings[0].points.length, 1);
  assert.equal(drawings[0].style.textColor, '#FFFFFF');
});

test('Show object descriptions does not hide Text Label or Sticker object content', () => {
  for (const tool of ['text', 'smiley']) {
    const harness = createFakeChartEnvironment();
    harness.manager.setActiveTool(tool);
    harness.click(10, 100);
    const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
    const renderTexts = () => {
      primitive.updateAllViews();
      const drawTarget = createFakeBitmapTarget();
      primitive.paneViews()[0].renderer().draw(drawTarget.target);
      return drawTarget.texts;
    };

    assert.ok(renderTexts().length > 0);
    harness.manager.setShowObjectDescriptions(false);
    assert.ok(renderTexts().length > 0);
  }
});

test('Text Level creates a snapped one-point price level drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setCrosshairConfig({ symbol: 'GBPUSD', timeframe: 'M5' });
  harness.manager.setActiveTool('textLevel');
  harness.click(120, 100, 12);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'textLevel');
  assert.equal(drawings[0].type, 'textLevel');
  assert.equal(drawings[0].symbol, 'GBPUSD');
  assert.equal(drawings[0].timeframe, 'M5');
  assert.equal(drawings[0].points.length, 1);
  assert.equal(drawings[0].points[0].time, 12);
  assert.equal(drawings[0].points[0].price, 90);
  assert.equal(drawings[0].text, 'Level');
  assert.equal(drawings[0].levelLine.enabled, true);
  assert.equal(drawings[0].levelLine.extendMode, 'right');
  assert.equal(drawings[0].labelPosition, 'right');
  assert.equal(drawings[0].showPrice, true);
  assert.equal(drawings[0].showPriceAxisLabel, true);
  assert.equal(drawings[0].levelType, 'neutral');
  assert.deepEqual(drawings[0].labelOffset, { x: 0, y: 0 });

  harness.manager.setActiveTool('crosshair');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal(primitive.priceAxisViews()[0].text(), '90.00000');
  assert.ok(primitive.getGeometry().labelBox.width > 0);
});

test('Show object descriptions hides Text Level labels without changing its saved options', () => {
  const harness = createFakeChartEnvironment();
  harness.manager.setSerializedDrawings([{
    id: 'text-level-description-test',
    kind: 'textLevel',
    label: 'Entry',
    points: [{ time: 1, price: 90 }],
    text: 'Entry',
    levelLine: {
      enabled: true,
      extendMode: 'right',
      lineColor: '#2962FF',
      lineStyle: 'solid',
      lineWidth: 1,
      opacity: 0.9,
    },
    showPrice: false,
    showPriceAxisLabel: true,
  }]);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  const renderTexts = () => {
    primitive.updateAllViews();
    const drawTarget = createFakeBitmapTarget();
    primitive.paneViews()[0].renderer().draw(drawTarget.target);
    return drawTarget.texts;
  };
  const priceAxisView = primitive.priceAxisViews()[0];
  const labelBox = primitive.getGeometry().labelBox;
  const labelCenter = {
    x: (labelBox.left + labelBox.right) / 2,
    y: (labelBox.top + labelBox.bottom) / 2,
  };

  assert.ok(renderTexts().length > 0);
  assert.equal(priceAxisView.visible(), true);
  assert.equal(primitive.hitTest(labelCenter, { isTouch: false })?.part, 'label');

  harness.manager.setShowObjectDescriptions(false);
  assert.equal(renderTexts().length, 0);
  assert.equal(priceAxisView.visible(), false);
  assert.notEqual(primitive.hitTest(labelCenter, { isTouch: false })?.part, 'label');

  harness.manager.setShowObjectDescriptions(true);
  assert.ok(renderTexts().length > 0);
  assert.equal(priceAxisView.visible(), true);
  assert.equal(primitive.hitTest(labelCenter, { isTouch: false })?.part, 'label');
  assert.equal(primitive._options.showPrice, false);
  assert.equal(primitive._options.showPriceAxisLabel, true);
});

test('Text Level touch drag moves the level price without changing its time anchor', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'text_level_saved',
      kind: 'textLevel',
      label: 'Entry',
      points: [{ time: 1, price: 90 }],
      text: 'Entry',
      levelLine: { enabled: true, extendMode: 'right', lineColor: '#2962FF', lineWidth: 1, lineStyle: 'solid', opacity: 0.9 },
      showPriceAxisLabel: true,
    },
  ]);
  harness.manager.setActiveTool('crosshair');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  harness.touchStart(180, 100);
  const messagesBeforeMove = harness.drawingMessages().length;
  harness.touchMove(180, 80);
  assert.equal(harness.drawingMessages().length, messagesBeforeMove);
  harness.touchEnd(180, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 1);
  assert.equal(drawings[0].points[0].price, 92);
});

test('Text Level touch drag on the label stores label offset without moving the level', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'text_level_label_saved',
      kind: 'textLevel',
      label: 'Entry',
      labelOffset: { x: 0, y: 0 },
      points: [{ time: 1, price: 90 }],
      text: 'Entry',
      levelLine: { enabled: true, extendMode: 'right', lineColor: '#2962FF', lineWidth: 1, lineStyle: 'solid', opacity: 0.9 },
      showPriceAxisLabel: true,
    },
  ]);
  harness.manager.setActiveTool('crosshair');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  const labelBox = primitive.getGeometry().labelBox;
  const labelX = (labelBox.left + labelBox.right) / 2;
  const labelY = (labelBox.top + labelBox.bottom) / 2;

  harness.touchStart(labelX, labelY);
  const messagesBeforeMove = harness.drawingMessages().length;
  harness.touchMove(labelX - 30, labelY + 20);
  assert.equal(harness.drawingMessages().length, messagesBeforeMove);
  harness.touchEnd(labelX - 30, labelY + 20);

  const drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 1);
  assert.equal(drawings[0].points[0].price, 90);
  assert.ok(drawings[0].labelOffset.x < 0);
  assert.ok(drawings[0].labelOffset.y > 0);
});

test('Text Level mobile tap on the label opens native editing and sanitizes persisted text', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'text_level_edit_saved',
      kind: 'textLevel',
      label: 'Entry',
      points: [{ time: 1, price: 90 }],
      text: 'Entry',
      levelLine: { enabled: true, extendMode: 'right', lineColor: '#2962FF', lineWidth: 1, lineStyle: 'solid', opacity: 0.9 },
      showPriceAxisLabel: true,
    },
  ]);
  harness.manager.setActiveTool('crosshair');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  const labelBox = primitive.getGeometry().labelBox;
  const labelX = (labelBox.left + labelBox.right) / 2;
  const labelY = (labelBox.top + labelBox.bottom) / 2;

  harness.touchStart(labelX, labelY);
  harness.touchEnd(labelX, labelY);

  const editRequests = harness.messages.filter((message) => message.type === 'DRAWING_TEXT_EDIT_REQUEST');
  assert.equal(editRequests.length, 1);
  assert.equal(editRequests[0].recordId, 'text_level_edit_saved');
  assert.equal(editRequests[0].text, 'Entry');

  (harness.manager as any).applyTextRecordEdit(
    'text_level_edit_saved',
    '<b>Breakout</b>\n<script>x</script>',
  );

  const drawings = harness.latestDrawings();
  assert.equal(drawings[0].text, 'Breakout x');
  assert.equal(drawings[0].label, 'Breakout x');
});

test('Pattern Path creates a three-point polyline drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('patterns');
  harness.click(10, 100);
  harness.click(20, 90);
  harness.click(30, 95);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'patterns');
  assert.equal(drawings[0].points.length, 3);
  assert.equal(drawings[0].style.color, '#A855F7');
  assert.equal(drawings[0].style.lineStyle, 'solid');
});

test('Pitchfork direct touch commits three anchors in empty chart space', () => {
  const harness = createFakeChartEnvironment({ nullCoordinateTimeFromX: 250, touch: true });

  harness.manager.setActiveTool('pitchfork');
  harness.touchStart(20, 120);
  harness.touchEnd(20, 120, { emptyChangedTouches: true });
  harness.touchStart(160, 90);
  harness.touchEnd(160, 90, { emptyChangedTouches: true });
  harness.touchStart(320, 110);
  harness.touchEnd(320, 110, { emptyChangedTouches: true });

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'pitchfork');
  assert.equal(drawings[0].points.length, 3);
  assert.ok(drawings[0].points[2].time > drawings[0].points[1].time);

  harness.manager.setActiveTool('pitchfork');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const renderer = primitive.paneViews()[0].renderer();
  const drawTarget = createFakeBitmapTarget();
  renderer.draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 3);
});

test('Long Position creates a two-point position box drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('prediction');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'prediction');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].style.borderColor, '#10B981');
  assert.equal(drawings[0].style.borderStyle, 'solid');
});

test('Horizontal and Vertical Line create full-axis line drawings from one tap', () => {
  const horizontalHarness = createFakeChartEnvironment();

  horizontalHarness.manager.setActiveTool('horizontalLine');
  horizontalHarness.click(20, 120);

  let drawings = horizontalHarness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'horizontalLine');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].points[0].price, drawings[0].points[1].price);
  assert.equal(drawings[0].extendMode, 'both');

  const verticalHarness = createFakeChartEnvironment();
  verticalHarness.manager.setActiveTool('verticalLine');
  verticalHarness.click(30, 110);

  drawings = verticalHarness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'verticalLine');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].points[0].time, drawings[0].points[1].time);
  assert.equal(drawings[0].extendMode, 'both');
});

test('Show object descriptions hides and restores an existing horizontal-line price label', () => {
  const harness = createFakeChartEnvironment();
  harness.manager.setActiveTool('horizontalLine');
  harness.click(20, 120);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  const renderTexts = () => {
    primitive.updateAllViews();
    const drawTarget = createFakeBitmapTarget();
    primitive.paneViews()[0].renderer().draw(drawTarget.target);
    return drawTarget.texts;
  };

  assert.ok(renderTexts().length > 0);

  harness.manager.setShowObjectDescriptions(false);
  assert.equal(harness.manager.getShowObjectDescriptions(), false);
  assert.equal(renderTexts().length, 0);

  harness.manager.setShowObjectDescriptions(true);
  assert.equal(harness.manager.getShowObjectDescriptions(), true);
  assert.ok(renderTexts().length > 0);
});

test('Show object descriptions remains off for restored and newly created drawings', () => {
  const harness = createFakeChartEnvironment();
  harness.manager.setActiveTool('horizontalLine');
  harness.click(20, 120);
  const serializedDrawings = harness.latestDrawings();

  harness.manager.setShowObjectDescriptions(false);
  harness.manager.setSerializedDrawings(serializedDrawings);

  const restoredPrimitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  restoredPrimitive.updateAllViews();
  const restoredTarget = createFakeBitmapTarget();
  restoredPrimitive.paneViews()[0].renderer().draw(restoredTarget.target);
  assert.equal(restoredTarget.texts.length, 0);

  harness.manager.setActiveTool('horizontalLine');
  harness.click(30, 110);
  const newPrimitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  newPrimitive.updateAllViews();
  const newTarget = createFakeBitmapTarget();
  newPrimitive.paneViews()[0].renderer().draw(newTarget.target);
  assert.equal(newTarget.texts.length, 0);

  harness.manager.setShowObjectDescriptions(true);
  const restoredAfterEnable = createFakeBitmapTarget();
  restoredPrimitive.paneViews()[0].renderer().draw(restoredAfterEnable.target);
  const newAfterEnable = createFakeBitmapTarget();
  newPrimitive.paneViews()[0].renderer().draw(newAfterEnable.target);
  assert.ok(restoredAfterEnable.texts.length > 0);
  assert.ok(newAfterEnable.texts.length > 0);
});

test('Show object descriptions hides generated labels across complex drawing renderers', () => {
  const scenarios = [
    { points: [[10, 100], [40, 70]], tool: 'fib' },
    { points: [[10, 100], [40, 70]], tool: 'prediction' },
    { points: [[10, 100], [20, 80], [30, 110], [40, 70], [50, 90], [60, 60]], tool: 'elliottWave' },
    { points: [[10, 100], [20, 70], [30, 95], [40, 60], [50, 85]], tool: 'xabcd' },
  ] as const;

  for (const scenario of scenarios) {
    const harness = createFakeChartEnvironment();
    harness.manager.setActiveTool(scenario.tool);
    scenario.points.forEach(([x, y]) => harness.click(x, y));

    const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
    const renderTexts = () => {
      primitive.updateAllViews();
      const drawTarget = createFakeBitmapTarget();
      primitive.paneViews()[0].renderer().draw(drawTarget.target);
      return drawTarget.texts;
    };

    assert.ok(renderTexts().length > 0, `${scenario.tool} should render descriptions by default`);
    harness.manager.setShowObjectDescriptions(false);
    assert.equal(renderTexts().length, 0, `${scenario.tool} should hide its descriptions`);
    harness.manager.setShowObjectDescriptions(true);
    assert.ok(renderTexts().length > 0, `${scenario.tool} should restore its descriptions`);
  }
});

test('Show object descriptions updates an already attached drawing preview', () => {
  const harness = createFakeChartEnvironment();
  harness.manager.setActiveTool('fib');
  harness.click(10, 100);
  harness.move(40, 70);

  const preview: any = harness.manager._tools.fib._preview;
  const renderTexts = () => {
    preview.updateAllViews();
    const drawTarget = createFakeBitmapTarget();
    preview.paneViews()[0].renderer().draw(drawTarget.target);
    return drawTarget.texts;
  };

  assert.ok(renderTexts().length > 0);
  harness.manager.setShowObjectDescriptions(false);
  assert.equal(renderTexts().length, 0);
});

test('Horizontal Ray creates a one-tap right-extended price ray', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('horizontalRay');
  harness.click(20, 120);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'horizontalRay');
  assert.equal(drawings[0].type, 'horizontalRay');
  assert.equal(drawings[0].label, 'Horizontal Ray 1');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].points[0].price, drawings[0].points[1].price);
  assert.equal(drawings[0].points[1].time, drawings[0].points[0].time + 1);
  assert.equal(drawings[0].extendMode, 'right');
  assert.equal(drawings[0].style.color, '#0EA5E9');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal(primitive.hitTest({ x: 180, y: 120 }, { isTouch: false })?.part, 'body');
});

test('Horizontal Ray supports direct mobile one-tap input', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('horizontalRay');
  const startEvent = harness.touchStart(20, 120);
  harness.touchEnd(20, 120);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'horizontalRay');
  assert.equal(drawings[0].extendMode, 'right');
  assert.equal(startEvent.preventDefaultCalls, 1);
});

test('Ray creates a right-extended two-point drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('ray');
  harness.click(10, 100);
  harness.move(40, 70);
  harness.click(40, 70);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'ray');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'right');
});

test('Extended Line creates a both-way extended two-point drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('extendedLine');
  harness.click(10, 100);
  harness.move(40, 70);
  harness.click(40, 70);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'extendedLine');
  assert.equal(drawings[0].type, 'extendedLine');
  assert.equal(drawings[0].label, 'Extended Line 1');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'both');
  assert.equal(drawings[0].style.color, '#7C3AED');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal(primitive.hitTest({ x: 70, y: 40 }, { isTouch: false })?.part, 'body');
});

test('Arrow / Marker creates a finite two-point drawing with an arrowhead', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('arrow');
  harness.click(10, 100);
  harness.move(40, 70);
  harness.click(40, 70);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'arrow');
  assert.equal(drawings[0].type, 'arrow');
  assert.equal(drawings[0].label, 'Arrow / Marker 1');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'none');
  assert.equal(drawings[0].style.color, '#F97316');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 3);
});

test('Fibonacci Extension creates extension levels beyond one', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('fibExtension');
  harness.click(10, 100);
  harness.move(30, 80);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'fibExtension');
  assert.equal(drawings[0].type, 'fibExtension');
  assert.equal(drawings[0].extendMode, 'right');
  assert.ok(drawings[0].levels.some((level: any) => level.value > 1));
});

test('Parallel Channel creates three anchors and renders parallel rails', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('parallelChannel');
  harness.click(50, 220);
  harness.click(160, 120);
  harness.click(300, 180);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'parallelChannel');
  assert.equal(drawings[0].points.length, 3);
  assert.equal(drawings[0].extendMode, 'right');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);

  const strokeStarts = drawTarget.moves.slice(-3);
  const strokeEnds = drawTarget.lines.slice(-3);
  assert.equal(strokeStarts.length, 3);
  assert.equal(strokeEnds.length, 3);
  const slope = (start: { x: number; y: number }, end: { x: number; y: number }) =>
    (end.y - start.y) / (end.x - start.x);
  const baseSlope = slope(strokeStarts[0], strokeEnds[0]);
  assert.ok(Math.abs(slope(strokeStarts[1], strokeEnds[1]) - baseSlope) < 0.000001);
  assert.ok(Math.abs(slope(strokeStarts[2], strokeEnds[2]) - baseSlope) < 0.000001);
});

test('Short Position creates a two-point short box drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('shortPosition');
  harness.click(10, 100);
  harness.click(30, 120);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'shortPosition');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].style.borderColor, '#F43F5E');
  assert.equal(drawings[0].style.borderStyle, 'solid');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  assert.match(primitive._options.label, /^Short /);
});

test('Position drawings restore risk-reward plans with zones, labels and editable anchors', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'long_plan_saved',
      kind: 'prediction',
      label: 'Long plan',
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
      position: { stopPrice: 88, accountSize: 10000, riskPercent: 1 },
    },
  ]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].position.stopPrice, 88);
  assert.equal(drawings[0].position.accountSize, 10000);

  harness.manager.setActiveTool('prediction');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  const texts = drawTarget.texts.map((entry) => entry.text);
  assert.ok(texts.includes('Long RR 2.00'));
  // Prices format at the series precision (5 in this fake environment).
  assert.ok(texts.includes('Target 94.00000 (+4.0000)'));
  assert.ok(texts.includes('Stop 88.00000 (-2.0000)'));

  assert.equal(primitive.hitTest({ x: 10, y: 100 }, { isTouch: false })?.part, 'p1');
  assert.equal(primitive.hitTest({ x: 30, y: 60 }, { isTouch: false })?.part, 'p2');
  assert.equal(primitive.hitTest({ x: 20, y: 110 }, { isTouch: false })?.part, 'body');
  assert.equal(primitive.hitTest({ x: 200, y: 200 }, { isTouch: false }), null);
});

test('Short position restore defaults the stop to a 1:1 mirror above the entry', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'short_plan_saved',
      kind: 'shortPosition',
      label: 'Short plan',
      points: [{ time: 1, price: 94 }, { time: 3, price: 90 }],
    },
  ]);

  harness.manager.setActiveTool('shortPosition');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  const texts = drawTarget.texts.map((entry) => entry.text);
  assert.ok(texts.includes('Short RR 1.00'));
  assert.ok(texts.includes('Target 90.00000 (+4.0000)'));
  assert.ok(texts.includes('Stop 98.00000 (-4.0000)'));
});

test('Pitchfork creates a three-point pitchfork drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('pitchfork');
  harness.click(50, 220);
  harness.click(160, 120);
  harness.click(300, 180);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'pitchfork');
  assert.equal(drawings[0].points.length, 3);
  assert.equal(drawings[0].style.color, '#8B5CF6');
  assert.equal(drawings[0].style.lineStyle, 'solid');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);

  const segments = drawTarget.moves.slice(0, 3).map((start, index) => ({
    end: drawTarget.lines[index],
    start,
  }));
  assert.equal(segments.length, 3);
  assert.deepEqual(segments.map((segment) => Math.round(segment.start.x)), [50, 160, 300]);
  assert.deepEqual(segments.map((segment) => Math.round(segment.start.y)), [220, 120, 180]);

  const slope = (segment: { end: { x: number; y: number }; start: { x: number; y: number } }) =>
    (segment.end.y - segment.start.y) / (segment.end.x - segment.start.x);
  const medianSlope = slope(segments[0]);
  assert.ok(Math.abs(slope(segments[1]) - medianSlope) < 0.000001);
  assert.ok(Math.abs(slope(segments[2]) - medianSlope) < 0.000001);
  for (const segment of segments) {
    assert.ok(segment.end.x >= 0 && segment.end.x <= 360);
    assert.ok(segment.end.y >= 0 && segment.end.y <= 320);
  }
});

test('Sticker creates a one-point sticker drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('smiley');
  harness.click(10, 100);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'smiley');
  assert.equal(drawings[0].points.length, 1);
  assert.equal(drawings[0].style.backgroundColor, 'rgba(245, 158, 11, 0.94)');
});

test('Scale creates a two-point measurement box with TradingView-style details', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setCrosshairConfig({ symbol: 'AUDJPY', timeframe: 'M1' });
  harness.manager.setActiveTool('measure');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'measure');
  assert.equal(drawings[0].symbol, 'AUDJPY');
  assert.equal(drawings[0].timeframe, 'M1');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].style.borderColor, '#94A3B8');
  assert.equal(drawings[0].style.borderStyle, 'solid');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  assert.match(primitive._options.label, /\+2\.0000 \(\+2\.22%\) \/ 2 bars \/ 2s/);
});

test('Gann Fan creates a two-point fan of angle rays', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('gannFan');
  harness.click(20, 200);
  harness.move(120, 120);
  harness.click(120, 120);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'gannFan');
  assert.equal(drawings[0].type, 'gannFan');
  assert.equal(drawings[0].paneId, 'main');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].style.color, '#EAB308');
  assert.equal(harness.manager.getActiveTool(), 'gannFan');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 5);
  assert.equal(primitive.hitTest({ x: 20, y: 200 }, { isTouch: false })?.part, 'p1');
  assert.equal(primitive.hitTest({ x: 120, y: 120 }, { isTouch: false })?.part, 'p2');
});

test('Regression Channel fits a two-point channel over the candle range', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('regressionChannel');
  harness.click(20, 200);
  harness.move(200, 100);
  harness.click(200, 100);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'regressionChannel');
  assert.equal(drawings[0].type, 'regressionChannel');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].style.color, '#0EA5E9');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal(primitive.hitTest({ x: 20, y: 200 }, { isTouch: false })?.part, 'p1');
});

test('Elliott Wave creates a six-point numbered impulse polyline', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('elliottWave');
  harness.click(10, 200);
  harness.click(40, 150);
  harness.click(70, 180);
  harness.click(110, 90);
  harness.click(150, 130);
  harness.click(200, 60);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'elliottWave');
  assert.equal(drawings[0].type, 'elliottWave');
  assert.equal(drawings[0].points.length, 6);
  assert.equal(drawings[0].style.color, '#6366F1');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 5);
  assert.ok(drawTarget.texts.map((entry) => entry.text).includes('5'));
  assert.equal(primitive.hitTest({ x: 10, y: 200 }, { isTouch: false })?.part, 'p1');
  assert.equal(primitive.hitTest({ x: 200, y: 60 }, { isTouch: false })?.part, 'p6');
});

test('Elliott Wave restores custom wave labels and serializes them back to the host', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'elliott_saved',
      kind: 'elliottWave',
      label: 'Elliott saved',
      points: [
        { time: 1, price: 90 },
        { time: 2, price: 94 },
        { time: 3, price: 91 },
        { time: 4, price: 96 },
        { time: 5, price: 93 },
        { time: 6, price: 98 },
      ],
      waves: [
        { id: 'wave_1', label: '0', visible: false },
        { id: 'wave_2', label: 'A', visible: true },
        { id: 'wave_3', label: 'B', visible: true },
        { id: 'wave_4', label: 'C', visible: true },
        { id: 'wave_5', label: 'D', visible: true },
        { id: 'wave_6', label: 'E', visible: true },
      ],
    },
  ]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].waves.length, 6);
  assert.equal(drawings[0].waves[0].visible, false);
  assert.equal(drawings[0].waves[1].label, 'A');

  harness.manager.setActiveTool('elliottWave');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  const texts = drawTarget.texts.map((entry) => entry.text);
  assert.ok(texts.includes('E'));
  assert.equal(texts.includes('0'), false);
  assert.equal(texts.includes('5'), false);
});

test('XABCD Harmonic creates a five-point pattern with ratio labels', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('xabcd');
  harness.click(10, 80);
  harness.click(60, 220);
  harness.click(110, 110);
  harness.click(160, 200);
  harness.click(210, 60);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'xabcd');
  assert.equal(drawings[0].type, 'xabcd');
  assert.equal(drawings[0].points.length, 5);
  assert.equal(drawings[0].style.color, '#DB2777');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 4);
  assert.ok(drawTarget.texts.map((entry) => entry.text).includes('X'));
  assert.ok(drawTarget.texts.map((entry) => entry.text).includes('D'));
  assert.equal(primitive.hitTest({ x: 10, y: 80 }, { isTouch: false })?.part, 'p1');
  assert.equal(primitive.hitTest({ x: 210, y: 60 }, { isTouch: false })?.part, 'p5');
});

test('XABCD Harmonic restores ratio targets and renders measured / target labels', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'xabcd_saved',
      kind: 'xabcd',
      label: 'XABCD saved',
      points: [
        { time: 1, price: 90 },
        { time: 2, price: 96 },
        { time: 3, price: 92 },
        { time: 4, price: 95 },
        { time: 5, price: 99 },
      ],
      ratios: [
        { id: 'ratio_ab', target: 0.618, visible: true },
        { id: 'ratio_bc', target: null, visible: false },
        { id: 'ratio_cd', target: null, visible: true },
      ],
    },
  ]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].ratios.length, 3);
  assert.equal(drawings[0].ratios[0].target, 0.618);
  assert.equal(drawings[0].ratios[1].visible, false);

  harness.manager.setActiveTool('xabcd');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  const texts = drawTarget.texts.map((entry) => entry.text);
  assert.ok(texts.includes('0.667 / 0.618'));
  assert.ok(texts.includes('1.333'));
  assert.equal(texts.includes('0.750'), false);
  assert.ok(texts.includes('X'));
  assert.ok(texts.includes('D'));
});

test('Serialized style restores for object-menu drawing tools', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'patterns_saved',
      kind: 'patterns',
      label: 'Pattern saved',
      points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }],
      style: { color: '#14B8A6', width: 5, lineStyle: 'dashed', opacity: 0.55 },
    },
    {
      hidden: false,
      id: 'text_saved',
      kind: 'text',
      label: 'Text saved',
      points: [{ time: 1, price: 90 }],
      text: 'TXT',
      style: { backgroundColor: '#111827', textColor: '#F59E0B', anchorLineColor: '#F59E0B', fontSize: 13, opacity: 0.66 },
    },
    {
      hidden: false,
      id: 'long_saved',
      kind: 'prediction',
      label: 'Long saved',
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
      style: { fillColor: 'rgba(20, 184, 166, 0.22)', borderColor: '#14B8A6', borderWidth: 4, borderStyle: 'dotted', opacity: 0.44 },
    },
    {
      hidden: false,
      id: 'short_saved',
      kind: 'shortPosition',
      label: 'Short saved',
      points: [{ time: 1, price: 90 }, { time: 3, price: 86 }],
      style: { fillColor: 'rgba(239, 68, 68, 0.22)', borderColor: '#EF4444', borderWidth: 3, borderStyle: 'dashed', opacity: 0.5 },
    },
    {
      hidden: false,
      id: 'pitchfork_saved',
      kind: 'pitchfork',
      label: 'Pitchfork saved',
      points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }],
      style: { color: '#EC4899', width: 4, lineStyle: 'dotted', opacity: 0.6 },
    },
    {
      hidden: false,
      id: 'sticker_saved',
      kind: 'smiley',
      label: 'Sticker saved',
      points: [{ time: 1, price: 90 }],
      text: ':)',
      style: { color: '#F59E0B', textColor: '#111827', opacity: 0.7 },
    },
    {
      hidden: false,
      id: 'measure_saved',
      kind: 'measure',
      label: 'Scale saved',
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
      style: { fillColor: 'rgba(100, 116, 139, 0.32)', borderColor: '#64748B', borderWidth: 2, borderStyle: 'dashed', opacity: 0.35 },
    },
  ]);

  const [
    patternPrimitive,
    textPrimitive,
    longPrimitive,
    shortPrimitive,
    pitchforkPrimitive,
    stickerPrimitive,
    measurePrimitive,
  ] = harness.attachedPrimitives as any[];

  assert.equal(patternPrimitive._options.color, '#14B8A6');
  assert.equal(patternPrimitive._options.width, 5);
  assert.equal(patternPrimitive._options.lineStyle, 'dashed');
  assert.equal(patternPrimitive._options.opacity, 0.55);

  assert.equal(textPrimitive._options.backgroundColor, '#111827');
  assert.equal(textPrimitive._options.textColor, '#F59E0B');
  assert.equal(textPrimitive._options.anchorColor, '#F59E0B');
  assert.equal(textPrimitive._options.fontSize, 13);
  assert.equal(textPrimitive._options.opacity, 0.66);

  assert.equal(longPrimitive._options.fillColor, 'rgba(20, 184, 166, 0.22)');
  assert.equal(longPrimitive._options.borderColor, '#14B8A6');
  assert.equal(longPrimitive._options.borderWidth, 4);
  assert.equal(longPrimitive._options.borderStyle, 'dotted');
  assert.equal(longPrimitive._options.opacity, 0.44);

  assert.equal(shortPrimitive._options.fillColor, 'rgba(239, 68, 68, 0.22)');
  assert.equal(shortPrimitive._options.borderColor, '#EF4444');
  assert.equal(shortPrimitive._options.borderWidth, 3);
  assert.equal(shortPrimitive._options.borderStyle, 'dashed');
  assert.equal(shortPrimitive._options.opacity, 0.5);

  assert.equal(pitchforkPrimitive._options.color, '#EC4899');
  assert.equal(pitchforkPrimitive._options.width, 4);
  assert.equal(pitchforkPrimitive._options.lineStyle, 'dotted');
  assert.equal(pitchforkPrimitive._options.opacity, 0.6);

  assert.equal(stickerPrimitive._options.backgroundColor, '#F59E0B');
  assert.equal(stickerPrimitive._options.textColor, '#111827');
  assert.equal(stickerPrimitive._options.anchorColor, '#F59E0B');
  assert.equal(stickerPrimitive._options.opacity, 0.7);

  assert.equal(measurePrimitive._options.fillColor, 'rgba(100, 116, 139, 0.32)');
  assert.equal(measurePrimitive._options.borderColor, '#64748B');
  assert.equal(measurePrimitive._options.borderWidth, 2);
  assert.equal(measurePrimitive._options.borderStyle, 'dashed');
  assert.equal(measurePrimitive._options.opacity, 0.35);
});

test('Serialized drawings restore each registered drawing tool through the runtime registry', async (t) => {
  const cases = [
    { kind: 'trendline', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'horizontalLine', points: [{ time: 1, price: 90 }, { time: 3, price: 90 }] },
    { kind: 'horizontalRay', points: [{ time: 1, price: 90 }, { time: 3, price: 90 }] },
    { kind: 'verticalLine', points: [{ time: 1, price: 90 }, { time: 1, price: 94 }] },
    { kind: 'ray', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'extendedLine', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'arrow', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'patterns', points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }] },
    { kind: 'fib', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'fibExtension', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'ellipse', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'freehand', points: [{ time: 1, price: 90 }, { time: 2, price: 92 }, { time: 3, price: 94 }] },
    { kind: 'brush', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'text', points: [{ time: 1, price: 90 }], text: 'TXT' },
    { kind: 'textLevel', points: [{ time: 1, price: 90 }], text: 'Entry' },
    { kind: 'parallelChannel', points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }] },
    { kind: 'prediction', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'shortPosition', points: [{ time: 1, price: 90 }, { time: 3, price: 86 }] },
    { kind: 'pitchfork', points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }] },
    { kind: 'gannFan', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'regressionChannel', points: [{ time: 1, price: 90 }, { time: 5, price: 94 }] },
    { kind: 'elliottWave', points: [{ time: 1, price: 90 }, { time: 2, price: 94 }, { time: 3, price: 91 }, { time: 4, price: 96 }, { time: 5, price: 93 }, { time: 6, price: 98 }] },
    { kind: 'xabcd', points: [{ time: 1, price: 90 }, { time: 2, price: 96 }, { time: 3, price: 92 }, { time: 4, price: 95 }, { time: 5, price: 99 }] },
    { kind: 'smiley', points: [{ time: 1, price: 90 }], text: ':)' },
    { kind: 'measure', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
  ];

  for (const restoreCase of cases) {
    await t.test(restoreCase.kind, () => {
      const harness = createFakeChartEnvironment();

      harness.manager.setSerializedDrawings([
        {
          hidden: true,
          id: `${restoreCase.kind}_saved`,
          kind: restoreCase.kind,
          label: `${restoreCase.kind} saved`,
          points: restoreCase.points,
          text: restoreCase.text,
        },
      ]);

      const drawings = harness.latestDrawings();
      assert.equal(drawings.length, 1);
      assert.equal(drawings[0].kind, restoreCase.kind);
      assert.equal(drawings[0].points.length, restoreCase.points.length);
      assert.equal(drawings[0].hidden, true);
    });
  }
});

test('Serialized drawings ignore unknown or incomplete drawing records safely', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    { id: 'unknown_saved', kind: 'unknown', label: 'Unknown', points: [{ time: 1, price: 90 }] },
    { id: 'trendline_incomplete', kind: 'trendline', label: 'Incomplete', points: [{ time: 1, price: 90 }] },
    { id: 'bad_price', kind: 'text', label: 'Bad Price', points: [{ time: 1, price: Number.NaN }] },
  ]);

  assert.deepEqual(harness.latestDrawings(), []);
});

test('Zoom To Fit delegates to chart time and price scale APIs', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.zoomToFit();

  assert.deepEqual(harness.timeScaleActions, ['fitContent', 'scrollToRealTime']);
  assert.deepEqual(harness.priceScaleActions, [{ id: 'right', options: { autoScale: true } }]);
});

test('Stay in Drawing Mode keeps the same tool active after completion', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setStayInDrawingMode(true);
  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(30, 80);

  assert.equal(harness.manager.getActiveTool(), 'trendline');
  assert.equal(harness.latestDrawings().length, 1);
});

test('Lock All Drawings blocks selecting drawing tools until unlocked', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.manager.setDrawingsLocked(true);
  harness.manager.setActiveTool('trendline');

  assert.equal(harness.manager.getActiveTool(), 'none');

  harness.manager.setDrawingsLocked(false);
  harness.manager.setActiveTool('trendline');

  assert.equal(harness.manager.getActiveTool(), 'trendline');
});

test('Hide All Drawings toggles persisted hidden state for existing drawings', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(30, 80);
  harness.manager.setDrawingsHidden(true);

  assert.equal(harness.latestDrawings()[0].hidden, true);

  harness.manager.setDrawingsHidden(false);

  assert.equal(harness.latestDrawings()[0].hidden, false);
});

test('Clear Drawings removes drawings and returns to inactive mode', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(30, 80);
  harness.manager.removeAllDrawings();

  assert.deepEqual(harness.latestDrawings(), []);
  assert.equal(harness.manager.getActiveTool(), 'none');
});

test('Undo and redo drawing actions restore drawing snapshots', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(30, 80);

  const created = harness.latestDrawings()[0];
  assert.equal(harness.latestDrawings().length, 1);
  assert.equal(harness.manager.undoDrawingAction(), true);

  assert.deepEqual(harness.latestDrawings(), []);
  assert.equal(harness.manager.redoDrawingAction(), true);
  assert.equal(harness.latestDrawings().length, 1);
  assert.equal(harness.latestDrawings()[0].id, created.id);
  assert.equal(harness.latestDrawings()[0].kind, 'trendline');
});

test('Undo and redo drawing actions cover clear drawings', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('fib');
  harness.click(10, 100);
  harness.click(40, 70);
  assert.equal(harness.latestDrawings().length, 1);

  harness.manager.removeAllDrawings();
  assert.deepEqual(harness.latestDrawings(), []);
  assert.equal(harness.manager.undoDrawingAction(), true);

  assert.equal(harness.latestDrawings().length, 1);
  assert.equal(harness.latestDrawings()[0].kind, 'fib');
  assert.equal(harness.manager.redoDrawingAction(), true);
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Manager teardown detaches drawings without clearing persisted host state', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('fib');
  harness.click(10, 100);
  harness.click(40, 70);

  assert.equal(harness.latestDrawings().length, 1);
  const messagesBeforeTeardown = harness.drawingMessages().length;
  harness.manager.remove();

  assert.equal(harness.drawingMessages().length, messagesBeforeTeardown);
  assert.equal(harness.latestDrawings().length, 1);
  assert.ok(harness.detachedPrimitives.length > 0);
});

test('Manager can republish current drawings for host-side objects sync', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('fib');
  harness.click(10, 100);
  harness.click(40, 70);

  const messagesBeforePublish = harness.drawingMessages().length;
  harness.manager.publishDrawingsToHost();

  assert.equal(harness.drawingMessages().length, messagesBeforePublish + 1);
  assert.equal(harness.latestDrawings().length, 1);
  assert.equal(harness.latestDrawings()[0].kind, 'fib');
  assert.equal(harness.latestDrawings()[0].type, 'fibRetracement');
});

test('setSerializedDrawings clears locked crosshair overlay before replaying records', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('crosshair');
  harness.touchStart(120, 140);
  harness.touchEnd(120, 140);
  harness.click(120, 140);

  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.ok(overlay);
  assert.equal(overlay.style.display, 'block');

  harness.manager.setSerializedDrawings([]);

  assert.equal(overlay.style.display, 'none');
  assert.ok(harness.crosshairMessages().some((message) => message.active === false));
});

test('Repeated tool switching does not duplicate native chart listeners', () => {
  const harness = createFakeChartEnvironment();
  const initialCounts = harness.listenerCounts();

  for (let index = 0; index < 25; index += 1) {
    harness.manager.setActiveTool('trendline');
    harness.manager.setActiveTool('fib');
    harness.manager.setActiveTool('measure');
    harness.manager.setActiveTool('text');
    harness.manager.setActiveTool('crosshair');
  }

  assert.deepEqual(harness.listenerCounts(), initialCounts);

  harness.manager.remove();

  assert.deepEqual(harness.listenerCounts(), {
    click: 0,
    crosshairMove: 0,
    touchCancel: 0,
    touchEnd: 0,
    touchMove: 0,
    touchStart: 0,
  });
});

test('DRAWINGS_CHANGED reports undo/redo availability and the selected drawing id', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(20, 90);

  let latest = harness.drawingMessages().at(-1);
  assert.equal(latest?.canUndo, true);
  assert.equal(latest?.canRedo, false);
  assert.equal(latest?.selectedDrawingId, null);

  harness.manager.undoDrawingAction();
  latest = harness.drawingMessages().at(-1);
  assert.equal(harness.latestDrawings().length, 0);
  assert.equal(latest?.canUndo, false);
  assert.equal(latest?.canRedo, true);

  harness.manager.redoDrawingAction();
  latest = harness.drawingMessages().at(-1);
  assert.equal(harness.latestDrawings().length, 1);
  assert.equal(latest?.canUndo, true);
  assert.equal(latest?.canRedo, false);

  harness.manager.setActiveTool('crosshair');
  (harness.manager as any)._ignoreCrosshairClickUntil = 0;
  harness.click(15, 95);
  latest = harness.drawingMessages().at(-1);
  assert.equal(latest?.selectedDrawingId, harness.latestDrawings()[0].id);
});

test('Selected-drawing commands lock, hide, and delete only the selected drawing', () => {
  const harness = createFakeChartEnvironment({ touch: true });
  const manager: any = harness.manager;

  harness.manager.setActiveTool('trendline');
  harness.touchStart(10, 100);
  harness.touchMove(60, 80);
  harness.touchEnd(60, 80);
  harness.manager.setActiveTool('trendline');
  harness.touchStart(10, 180);
  harness.touchMove(60, 160);
  harness.touchEnd(60, 160);
  assert.equal(harness.latestDrawings().length, 2);

  // Tap the second line's body in crosshair (selection) mode.
  harness.manager.setActiveTool('crosshair');
  manager._lastDrawingTap = null;
  harness.touchStart(35, 170);
  harness.touchEnd(35, 170);
  const selectedId = manager.getSelectedDrawingId();
  assert.equal(typeof selectedId, 'string');
  let drawings = harness.latestDrawings();
  assert.equal(drawings[1].id, selectedId);
  assert.equal(drawings[1].selected, true);
  assert.equal(drawings[0].selected, false);

  // Lock only the selected drawing.
  manager.setSelectedDrawingLocked(true);
  drawings = harness.latestDrawings();
  assert.equal(drawings[1].locked, true);
  assert.equal(drawings[0].locked, false);

  // Locked drawings show a floating lock badge chip.
  const badgeOverlay = (harness.host.children as any[]).find(
    (child) => child['data-rtx5-drawing-badges'] === 'true',
  );
  assert.ok(badgeOverlay, 'expected a drawing badge overlay for the locked drawing');
  assert.ok(
    (badgeOverlay.children as any[]).some(
      (chip) => typeof chip.textContent === 'string'
        && chip.textContent.includes(String.fromCodePoint(0x1f512)),
    ),
    'expected a lock glyph badge chip',
  );

  // A drag on the locked drawing selects it but must not move its points.
  const lockedPoints = JSON.stringify(drawings[1].points);
  manager._lastDrawingTap = null;
  harness.touchStart(35, 170);
  harness.touchMove(45, 210);
  harness.touchEnd(45, 210);
  drawings = harness.latestDrawings();
  assert.equal(JSON.stringify(drawings[1].points), lockedPoints);
  assert.equal(manager.getSelectedDrawingId(), selectedId);

  // Unlock All releases per-record locks.
  manager.unlockAllDrawings();
  drawings = harness.latestDrawings();
  assert.equal(drawings[0].locked, false);
  assert.equal(drawings[1].locked, false);

  // Hide only the selected drawing: record stays stored, loses selection,
  // and no longer receives touches.
  manager.setSelectedDrawingHidden(true);
  drawings = harness.latestDrawings();
  assert.equal(drawings.length, 2);
  assert.equal(drawings[1].hidden, true);
  assert.equal(drawings[1].selected, false);
  assert.equal(harness.drawingMessages().at(-1)?.selectedDrawingId, null);
  manager._lastDrawingTap = null;
  harness.touchStart(35, 170);
  harness.touchEnd(35, 170);
  assert.equal(manager.getSelectedDrawingId(), null);

  // Show All restores the individually hidden drawing.
  harness.manager.setDrawingsHidden(false);
  drawings = harness.latestDrawings();
  assert.equal(drawings[1].hidden, false);

  // Delete Selected removes only the selected drawing.
  manager._lastDrawingTap = null;
  harness.touchStart(35, 170);
  harness.touchEnd(35, 170);
  assert.equal(manager.getSelectedDrawingId(), drawings[1].id);
  manager.removeSelectedDrawing();
  drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].points[0].price, 90);
});

test('Double-tapping a drawing in browse mode selects it and requests the action menu', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('trendline');
  harness.touchStart(10, 100);
  harness.touchMove(60, 80);
  harness.touchEnd(60, 80);
  harness.manager.setActiveTool('none');

  const menuRequests = () =>
    harness.messages.filter((message) => message.type === 'DRAWING_ACTION_MENU_REQUEST');

  // First tap on the drawing must stay passive (panning keeps working).
  harness.touchStart(35, 90);
  harness.touchEnd(35, 90);
  assert.equal(menuRequests().length, 0);

  // Second tap on the same drawing selects it and asks the host for the menu.
  harness.touchStart(35, 90);
  harness.touchEnd(35, 90);
  assert.equal(menuRequests().length, 1);
  const drawings = harness.latestDrawings();
  assert.equal(menuRequests()[0].recordId, drawings[0].id);
  assert.equal(menuRequests()[0].locked, false);
  assert.equal(drawings[0].selected, true);

  // Double-tapping empty chart space never selects a drawing; with drawings
  // present it instead requests the quick drawing-actions shortcut sheet.
  const quickRequests = () =>
    harness.messages.filter((message) => message.type === 'DRAWING_QUICK_ACTIONS_REQUEST');
  harness.touchStart(300, 300);
  harness.touchEnd(300, 300);
  assert.equal(quickRequests().length, 0);
  harness.touchStart(300, 300);
  harness.touchEnd(300, 300);
  assert.equal(menuRequests().length, 1);
  assert.equal(quickRequests().length, 1);
  assert.equal(harness.latestDrawings()[0].selected, true);
});

test('Empty-chart double tap stays silent while no drawings exist', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('none');
  harness.touchStart(300, 300);
  harness.touchEnd(300, 300);
  harness.touchStart(300, 300);
  harness.touchEnd(300, 300);

  const quickRequests = harness.messages.filter(
    (message) => message.type === 'DRAWING_QUICK_ACTIONS_REQUEST',
  );
  assert.equal(quickRequests.length, 0);
});

test('Direct touch bridge stays single-bound through repeated drawing activation', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  assert.deepEqual(harness.listenerCounts(), {
    click: 1,
    crosshairMove: 1,
    touchCancel: 1,
    touchEnd: 1,
    touchMove: 1,
    touchStart: 1,
  });

  for (let index = 0; index < 25; index += 1) {
    harness.manager.setActiveTool('trendline');
    harness.manager.setActiveTool('fib');
    harness.manager.setActiveTool('crosshair');
  }

  assert.deepEqual(harness.listenerCounts(), {
    click: 1,
    crosshairMove: 1,
    touchCancel: 1,
    touchEnd: 1,
    touchMove: 1,
    touchStart: 1,
  });

  harness.manager.remove();

  assert.deepEqual(harness.listenerCounts(), {
    click: 0,
    crosshairMove: 0,
    touchCancel: 0,
    touchEnd: 0,
    touchMove: 0,
    touchStart: 0,
  });
});
