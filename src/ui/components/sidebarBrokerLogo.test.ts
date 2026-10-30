import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSidebarBrokerLogoCandidates } from './sidebarBrokerLogo';

const active = { isLoggedIn: true, brokerId: 'broker-a', brokerApiBase: 'https://services.broker-a.com/api/v2' };

test('login without saved branding uses the matching broker configuration or cached directory logo', () => {
  assert.deepEqual(resolveSidebarBrokerLogoCandidates({
    ...active,
    brokerConfig: { broker_id: 'broker-a', logo_url: '/images/logo.png' },
    brokerServers: [{ broker_id: 'broker-a', logo_url: 'https://cdn.broker-a.com/logo.png' }],
  }), ['https://services.broker-a.com/images/logo.png', 'https://cdn.broker-a.com/logo.png']);
  assert.deepEqual(resolveSidebarBrokerLogoCandidates({
    ...active,
    brokerServers: [{ broker_id: 'broker-a', logo_url: 'https://cdn.broker-a.com/logo.png' }],
  }), ['https://cdn.broker-a.com/logo.png']);
});

test('saved HTTP and protocol-relative images become absolute HTTPS sources', () => {
  assert.deepEqual(resolveSidebarBrokerLogoCandidates({
    ...active, persistedLogoUrl: ' http://cdn.broker-a.com/logo.png ',
    brokerConfig: { broker_id: 'broker-a', logo_url: '//cdn.broker-a.com/config.png' },
  }), ['https://cdn.broker-a.com/logo.png', 'https://cdn.broker-a.com/config.png']);
});

test('directory paths use the configured directory origin while config paths use the broker origin', () => {
  assert.deepEqual(resolveSidebarBrokerLogoCandidates({
    ...active, directoryApiBase: 'https://directory.example.com/api/v2',
    persistedLogoUrl: '/uploads/a.png',
    brokerConfig: { broker_id: 'broker-a', logo_url: '/uploads/config.png' },
  }), ['https://directory.example.com/uploads/a.png', 'https://services.broker-a.com/uploads/config.png']);
});

test('unavailable saved images have distinct fallback sources and duplicate URLs are removed', () => {
  assert.deepEqual(resolveSidebarBrokerLogoCandidates({
    ...active, persistedLogoUrl: 'https://cdn.broker-a.com/old.png',
    brokerConfig: { broker_id: 'broker-a', logo_url: 'https://cdn.broker-a.com/new.png' },
    brokerServers: [{ broker_id: 'broker-a', logo_url: 'https://cdn.broker-a.com/new.png' }],
  }), ['https://cdn.broker-a.com/old.png', 'https://cdn.broker-a.com/new.png']);
});

test('logout and account switches cannot display another broker branding', () => {
  const branding = {
    brokerConfig: { broker_id: 'broker-b', logo_url: 'https://cdn.broker-b.com/logo.png' },
    brokerServers: [{ broker_id: 'broker-b', logo_url: 'https://cdn.broker-b.com/logo.png' }],
  };
  assert.deepEqual(resolveSidebarBrokerLogoCandidates({ ...active, ...branding }), []);
  assert.deepEqual(resolveSidebarBrokerLogoCandidates({
    ...active, isLoggedIn: false, persistedLogoUrl: 'https://cdn.broker-a.com/logo.png',
  }), []);
  assert.deepEqual(resolveSidebarBrokerLogoCandidates({
    ...active, brokerId: ' BROKER-A ',
    brokerConfig: { broker_id: 'broker-a', logo_url: 'https://cdn.broker-a.com/logo.png' },
  }), ['https://cdn.broker-a.com/logo.png']);
});

test('invalid image schemes and unresolved relative URLs do not reach the native image loader', () => {
  assert.deepEqual(resolveSidebarBrokerLogoCandidates({
    ...active, persistedLogoUrl: 'javascript:alert(1)',
    brokerConfig: { broker_id: 'broker-a', logo_url: 'file:///private/photo.png' },
  }), []);
  assert.deepEqual(resolveSidebarBrokerLogoCandidates({
    isLoggedIn: true, brokerId: 'broker-a', persistedLogoUrl: '/uploads/a.png',
  }), []);
});
