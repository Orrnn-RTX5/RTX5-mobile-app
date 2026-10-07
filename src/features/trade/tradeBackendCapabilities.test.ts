import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { CHART_ORDER_TYPES } from '../chart/chartTradeOrderUtils';
import {
  BROKER_SLTP_CAPABILITIES,
  CANONICAL_SLTP_BROKER_IDS,
  MARKET_AND_POSITION_SLTP_CAPABILITIES,
  NO_BROKER_SLTP_CAPABILITIES,
  canonicalBrokerId,
  getSltpUnavailableMessage,
  isDynamicSltpConstraintsBackendLocked,
  isExistingPositionModifyBackendLocked,
  isNewMarketOrderProtectionBackendLocked,
  isPendingOrderProtectionBackendLocked,
  isPendingOrderTypeBackendLocked,
  isRevisionedModifyBackendLocked,
  isTrailingStopBackendLocked,
  isVenueBrokerConfirmationBackendLocked,
  resolveTradeBackendCapabilities,
  type BrokerSltpCapabilities,
} from './tradeBackendCapabilities';

const resolveAppFile = (fileName: string) => {
  const candidates = [
    resolve(process.cwd(), fileName),
    resolve(process.cwd(), 'rtx5-app', fileName),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  assert.ok(path, `${fileName} was not found from the test working directory`);
  return path;
};

test('the fixed broker matrix enables only market and existing-position SL/TP', () => {
  assert.deepEqual(
    Object.keys(BROKER_SLTP_CAPABILITIES).sort(),
    [...CANONICAL_SLTP_BROKER_IDS].sort(),
  );
  assert.equal(Object.isFrozen(BROKER_SLTP_CAPABILITIES), true);
  assert.equal(Object.isFrozen(MARKET_AND_POSITION_SLTP_CAPABILITIES), true);
  assert.equal(Object.isFrozen(NO_BROKER_SLTP_CAPABILITIES), true);

  const expectedKeys: Array<keyof BrokerSltpCapabilities> = [
    'existingPositionPersistence',
    'serverManagedTriggerClose',
    'newMarketOrderProtection',
    'pendingOrderProtection',
    'trailingStop',
    'dynamicConstraints',
    'venueBrokerConfirmation',
    'revisionIdempotencySafety',
  ];
  for (const brokerId of CANONICAL_SLTP_BROKER_IDS) {
    assert.deepEqual(
      Object.keys(BROKER_SLTP_CAPABILITIES[brokerId]).sort(),
      [...expectedKeys].sort(),
    );
    assert.deepEqual(
      BROKER_SLTP_CAPABILITIES[brokerId],
      MARKET_AND_POSITION_SLTP_CAPABILITIES,
    );
    assert.equal(Object.isFrozen(BROKER_SLTP_CAPABILITIES[brokerId]), true);
  }
});

test('only documented broker identifiers canonicalize and the GTA alias is exact', () => {
  assert.equal(canonicalBrokerId(' ACHIEVER-FINANCIALS '), 'achiever-financials');
  assert.equal(canonicalBrokerId('orrnn-demo'), 'orrnn-demo');
  assert.equal(canonicalBrokerId(' GTA_BROKER '), 'gta_broker');
  assert.equal(canonicalBrokerId('grow-trading-academy'), 'gta_broker');
  assert.equal(canonicalBrokerId('MYPROP-TRADE'), 'myprop-trade');
  assert.equal(canonicalBrokerId(' NEXA '), 'nexa');
  assert.equal(canonicalBrokerId('Nexa'), 'nexa');
  // Backend contract v3 broker ids (6.5), matched ignoring case.
  assert.equal(canonicalBrokerId('trivanta-markets'), 'trivanta-markets');
  assert.equal(canonicalBrokerId('TRIVANTA-MARKETS'), 'trivanta-markets');
  assert.equal(canonicalBrokerId('Orrnn'), 'orrnn');
  assert.equal(canonicalBrokerId('orrnn'), 'orrnn');
  assert.equal(canonicalBrokerId(' ORRNN '), 'orrnn');
  assert.notEqual(canonicalBrokerId('orrnn'), canonicalBrokerId('orrnn-demo'));

  for (const unsafe of [
    null,
    undefined,
    '',
    '*',
    'default',
    'all',
    'gta',
    'gta_broker.example.com',
    'prefix-gta_broker',
    'achiever-financials.example.com',
    'myprop-trade-copy',
    'https://myprop-trade.example',
    'trivanta',
    'trivanta-markets.example.com',
    'orrnn-live',
    'service.orrnn.com',
  ]) {
    assert.equal(canonicalBrokerId(unsafe), null, String(unsafe));
  }
});

test('public environment values cannot activate any broker SL/TP capability', () => {
  const hostileEnvironment = {
    EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES: JSON.stringify({
      '*': Object.fromEntries(
        Object.keys(NO_BROKER_SLTP_CAPABILITIES).map((key) => [key, true]),
      ),
      gta_broker: {
        existingPositionPersistence: true,
        serverManagedTriggerClose: true,
        newMarketOrderProtection: true,
        pendingOrderProtection: true,
        trailingStop: true,
        dynamicConstraints: true,
        venueBrokerConfirmation: true,
        revisionIdempotencySafety: true,
      },
    }),
  };

  for (const brokerId of CANONICAL_SLTP_BROKER_IDS) {
    assert.deepEqual(
      resolveTradeBackendCapabilities(hostileEnvironment, brokerId).sltp,
      MARKET_AND_POSITION_SLTP_CAPABILITIES,
    );
  }
  assert.deepEqual(
    resolveTradeBackendCapabilities(hostileEnvironment, 'unknown').sltp,
    NO_BROKER_SLTP_CAPABILITIES,
  );
});

test('known brokers unlock only market-order and existing-position SL/TP flows', () => {
  for (const brokerId of CANONICAL_SLTP_BROKER_IDS) {
    const capabilities = resolveTradeBackendCapabilities({}, brokerId);

    assert.equal(isExistingPositionModifyBackendLocked(capabilities), false);
    assert.equal(isNewMarketOrderProtectionBackendLocked(capabilities), false);
    assert.equal(isPendingOrderProtectionBackendLocked(capabilities), true);
    assert.equal(isTrailingStopBackendLocked(capabilities), true);
    assert.equal(isDynamicSltpConstraintsBackendLocked(capabilities), true);
    assert.equal(isVenueBrokerConfirmationBackendLocked(capabilities), true);
    assert.equal(isRevisionedModifyBackendLocked(capabilities), true);

    for (const orderType of CHART_ORDER_TYPES) {
      assert.equal(
        isPendingOrderTypeBackendLocked(orderType, capabilities),
        orderType !== 'Market Execution',
        `${brokerId} ${orderType} lock state`,
      );
    }
  }
});

test('contract v3 brokers Trivanta and Orrnn enable market and position SL/TP only', () => {
  for (const brokerId of ['trivanta-markets', 'Orrnn', 'orrnn', 'TRIVANTA-MARKETS']) {
    const capabilities = resolveTradeBackendCapabilities({}, brokerId);
    assert.deepEqual(capabilities.sltp, MARKET_AND_POSITION_SLTP_CAPABILITIES, brokerId);
    assert.equal(isNewMarketOrderProtectionBackendLocked(capabilities), false, brokerId);
    assert.equal(isExistingPositionModifyBackendLocked(capabilities), false, brokerId);
    assert.equal(isPendingOrderProtectionBackendLocked(capabilities), true, brokerId);
    assert.equal(isTrailingStopBackendLocked(capabilities), true, brokerId);
  }
});

test('existing-position SL/TP requires persistence and server trigger-close together', () => {
  const base = NO_BROKER_SLTP_CAPABILITIES;
  const capabilities = (sltp: BrokerSltpCapabilities) => ({
    pendingOrders: false,
    sltp,
  });

  assert.equal(isExistingPositionModifyBackendLocked(capabilities(base)), true);
  assert.equal(
    isExistingPositionModifyBackendLocked(capabilities({
      ...base,
      existingPositionPersistence: true,
    })),
    true,
  );
  assert.equal(
    isExistingPositionModifyBackendLocked(capabilities({
      ...base,
      serverManagedTriggerClose: true,
    })),
    true,
  );
  assert.equal(
    isExistingPositionModifyBackendLocked(capabilities({
      ...base,
      existingPositionPersistence: true,
      serverManagedTriggerClose: true,
    })),
    false,
  );
});

test('the remaining SL/TP locks stay independent', () => {
  const withCapability = (
    key: keyof BrokerSltpCapabilities,
  ) => ({
    pendingOrders: false,
    sltp: { ...NO_BROKER_SLTP_CAPABILITIES, [key]: true },
  });

  assert.equal(
    isNewMarketOrderProtectionBackendLocked(withCapability('newMarketOrderProtection')),
    false,
  );
  assert.equal(
    isPendingOrderProtectionBackendLocked(withCapability('pendingOrderProtection')),
    false,
  );
  assert.equal(isTrailingStopBackendLocked(withCapability('trailingStop')), false);
  assert.equal(
    isDynamicSltpConstraintsBackendLocked(withCapability('dynamicConstraints')),
    false,
  );
  assert.equal(
    isVenueBrokerConfirmationBackendLocked(withCapability('venueBrokerConfirmation')),
    false,
  );
  assert.equal(
    isRevisionedModifyBackendLocked(withCapability('revisionIdempotencySafety')),
    false,
  );
});

test('pending-order creation remains independent from SL/TP protection readiness', () => {
  const capabilities = {
    pendingOrders: false,
    sltp: NO_BROKER_SLTP_CAPABILITIES,
  } as const;

  for (const orderType of CHART_ORDER_TYPES) {
    assert.equal(
      isPendingOrderTypeBackendLocked(orderType, capabilities),
      orderType !== 'Market Execution',
      `${orderType} lock state`,
    );
  }
});

test('every pending order type remains locked even if pending creation is enabled', () => {
  const capabilities = resolveTradeBackendCapabilities(
    { EXPO_PUBLIC_PENDING_ORDERS_API_READY: 'true' },
    'orrnn-demo',
  );

  for (const orderType of CHART_ORDER_TYPES) {
    assert.equal(
      isPendingOrderTypeBackendLocked(orderType, capabilities),
      orderType !== 'Market Execution',
      `${orderType} lock state`,
    );
  }
});

test('unavailable feedback is broker specific and fail closed for unknown identity', () => {
  assert.equal(
    getSltpUnavailableMessage('achiever-financials'),
    'SL/TP is unavailable for the requested Achiever trade flow. Only market-order and existing-position SL/TP are enabled.',
  );
  assert.equal(
    getSltpUnavailableMessage('orrnn-demo'),
    'SL/TP is unavailable for the requested Orrnn Demo trade flow. Only market-order and existing-position SL/TP are enabled.',
  );
  assert.equal(
    getSltpUnavailableMessage('grow-trading-academy'),
    'SL/TP is unavailable for the requested GTA trade flow. Only market-order and existing-position SL/TP are enabled.',
  );
  assert.equal(
    getSltpUnavailableMessage('myprop-trade'),
    'SL/TP is unavailable for the requested MyProp trade flow. Only market-order and existing-position SL/TP are enabled.',
  );
  assert.equal(
    getSltpUnavailableMessage('Nexa'),
    'SL/TP is unavailable for the requested Nexa trade flow. Only market-order and existing-position SL/TP are enabled.',
  );
  assert.equal(
    getSltpUnavailableMessage('trivanta-markets'),
    'SL/TP is unavailable for the requested Trivanta Markets trade flow. Only market-order and existing-position SL/TP are enabled.',
  );
  assert.equal(
    getSltpUnavailableMessage('Orrnn'),
    'SL/TP is unavailable for the requested Orrnn trade flow. Only market-order and existing-position SL/TP are enabled.',
  );
  assert.equal(
    getSltpUnavailableMessage('orrnn'),
    getSltpUnavailableMessage('Orrnn'),
  );
  assert.equal(
    getSltpUnavailableMessage('unknown'),
    'SL/TP is unavailable because the selected broker could not be verified.',
  );
});

test('local and EAS build profiles contain no SL/TP activation', () => {
  const dotenvSource = readFileSync(resolveAppFile('.env'), 'utf8');
  const dotenvMatch = dotenvSource.match(
    /^EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES=(.+)$/m,
  );
  assert.ok(dotenvMatch, 'local SL/TP capability configuration is missing');
  const rawDotenvValue = dotenvMatch[1].trim();
  const dotenvValue =
    (
      (rawDotenvValue.startsWith("'") && rawDotenvValue.endsWith("'")) ||
      (rawDotenvValue.startsWith('"') && rawDotenvValue.endsWith('"'))
    )
      ? rawDotenvValue.slice(1, -1)
      : rawDotenvValue;
  assert.deepEqual(JSON.parse(dotenvValue), {});

  const easConfig = JSON.parse(readFileSync(resolveAppFile('eas.json'), 'utf8'));
  for (const [profileName, profile] of Object.entries(easConfig.build as Record<string, any>)) {
    const rawValue = profile.env?.EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES;
    assert.ok(rawValue, `${profileName} SL/TP capability map is missing`);
    assert.deepEqual(JSON.parse(rawValue), {}, `${profileName} SL/TP capability map`);
  }
});
