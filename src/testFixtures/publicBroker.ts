export const publicBrokerFixture = (brokerId = 'Nexa', overrides: Record<string, unknown> = {}) => ({
  broker_id: brokerId, broker_name: brokerId, enabled: true, active: true, license_active: true,
  config_version: 'test-1', services_domain: 'services.example.com',
  server_url: 'https://services.example.com', market_api_url: 'https://services.example.com/api/v2',
  feed_wss_url: 'wss://services.example.com/ws/feed', feed_status_https_url: 'https://services.example.com/ws/feed/status',
  trade_wss_url: 'wss://services.example.com/ws/v2', ...overrides,
});
