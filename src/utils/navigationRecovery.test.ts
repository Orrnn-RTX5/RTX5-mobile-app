import assert from 'node:assert/strict';
import test from 'node:test';
import { brokersLaunchController as brokers, scheduleBrokersLaunchNavigation, scheduleBrokersLaunchCoverRemoval } from '../features/settings/brokersLaunchController';
import { brokerDetailLaunchController as detail, scheduleBrokerDetailLaunchNavigation, scheduleBrokerDetailLaunchCoverRemoval } from '../features/settings/brokerDetailLaunchController';
import { registerLaunchController as register, scheduleRegisterLaunchNavigation, scheduleRegisterLaunchCoverRemoval } from '../features/settings/registerLaunchController';
import { quoteInfoLaunchController as quotes, scheduleQuoteInfoLaunchNavigation, scheduleQuoteInfoBackCoverRemoval } from '../features/quotes/quoteInfoLaunchController';
import { chartActionLaunchController as chart, scheduleChartActionLaunchNavigation, scheduleChartActionLaunchCovered } from '../features/chart/chartActionLaunchController';
import { orderTicketLaunchController as order, scheduleOrderTicketLaunchNavigation } from '../features/trade/orderTicketLaunchController';

const selection = { brokerId: 'test-broker', brokerName: 'Test Broker', brokerServer: 'Demo', brokerServerUrl: 'https://example.com', brokerLogoUrl: '', brokerDomain: 'example.com' };
const flows = [
  { name: 'Brokers', controller: brokers, show: () => brokers.show(), navigate: scheduleBrokersLaunchNavigation, release: scheduleBrokersLaunchCoverRemoval },
  { name: 'Broker Detail', controller: detail, show: () => detail.show(selection), navigate: scheduleBrokerDetailLaunchNavigation, release: scheduleBrokerDetailLaunchCoverRemoval },
  { name: 'Demo Account', controller: register, show: () => register.show(selection), navigate: scheduleRegisterLaunchNavigation, release: scheduleRegisterLaunchCoverRemoval },
  { name: 'Quote Info', controller: quotes, show: () => quotes.show('properties', 'EURUSD'), navigate: scheduleQuoteInfoLaunchNavigation, release: scheduleQuoteInfoBackCoverRemoval },
  { name: 'Chart actions', controller: chart, show: () => chart.show('calculator', 'EURUSD'), navigate: scheduleChartActionLaunchNavigation, release: (revision: number) => scheduleChartActionLaunchCovered('calculator', revision) },
  { name: 'Order Ticket', controller: order, show: () => order.show('EURUSD'), navigate: scheduleOrderTicketLaunchNavigation, release: undefined },
] as const;

for (const interruptSecondFrame of [false, true]) {
  test(`all route launches recover with ${interruptSecondFrame ? 'the second' : 'the first'} native frame interrupted`, async () => {
    const originalFrame = globalThis.requestAnimationFrame;
    const frames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    const counts = new Map<string, number>();
    try {
      for (const flow of flows) {
        const revision = flow.show();
        flow.navigate(revision, () => counts.set(flow.name, (counts.get(flow.name) ?? 0) + 1));
      }
      if (interruptSecondFrame) frames.slice().forEach(frame => frame(0));
      await new Promise(resolve => setTimeout(resolve, 130));
      for (const flow of flows) {
        assert.equal(counts.get(flow.name), 1, `${flow.name} must navigate instead of remaining on the preview`);
        assert.equal(flow.controller.getSnapshot().navigationStarted, true);
      }
      frames.forEach(frame => frame(0));
      await new Promise(resolve => setTimeout(resolve, 0));
      for (const flow of flows) assert.equal(counts.get(flow.name), 1, `${flow.name} must not dispatch twice on a late frame`);

      for (const flow of flows) flow.release?.(flow.controller.getSnapshot().revision);
      await new Promise(resolve => setTimeout(resolve, 130));
      for (const flow of flows) {
        if (flow.release) assert.equal(flow.controller.isVisible(), false, `${flow.name} must release its touch-intercepting preview`);
      }
    } finally {
      flows.forEach(flow => flow.controller.hide());
      if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
      else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    }
  });
}

test('superseded and closed launch requests cannot navigate or hide a newer cover after recovery', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  let staleCalls = 0;
  try {
    for (const flow of flows) {
      const stale = flow.show();
      flow.navigate(stale, () => staleCalls++);
      flow.release?.(stale);
      flow.show();
    }
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(staleCalls, 0);
    for (const flow of flows) assert.equal(flow.controller.isVisible(), true, `${flow.name} must retain the newest launch`);
    for (const flow of flows) {
      flow.navigate(flow.controller.getSnapshot().revision, () => staleCalls++);
      flow.controller.hide();
    }
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(staleCalls, 0, 'closed previews must stay closed when fallback timers run');
  } finally {
    flows.forEach(flow => flow.controller.hide());
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});
