export function checkOrderPolicy(instrument: any, volume: number, side: unknown, account: any): string | null {
  if (!instrument || instrument.enabled === false || instrument.visible === false || instrument.trade_enabled === false) return 'This symbol is unavailable for this account.';
  const rawMode = instrument.trade_mode !== undefined ? instrument.trade_mode : instrument.tradeMode;
  const mode = typeof rawMode === 'string' ? rawMode.trim().toLowerCase().replace(/[\s_-]/g, '') : rawMode;
  // Contract v3 authorizes catalog instruments with enabled:true and omits
  // trade_mode. Explicit modes still restrict that approval; missing both
  // fields never authorizes trading. Market/quote/margin checks run separately.
  const enabledWithoutMode = rawMode === undefined && instrument.enabled === true;
  if (!enabledWithoutMode && ![4, '4', 'full', 'enabled', 'both', 1, '1', 2, '2', 'longonly', 'shortonly'].includes(mode)) return 'Trading mode is unavailable or restricted.';
  if (([1, '1', 'longonly'].includes(mode) && side !== 'buy') || ([2, '2', 'shortonly'].includes(mode) && side !== 'sell')) return 'This direction is restricted for the symbol.';
  const min = Number(instrument.volume_min ?? instrument.min_volume ?? instrument.minVolume);
  const max = Number(instrument.volume_max ?? instrument.max_volume ?? instrument.maxVolume);
  const step = Number(instrument.volume_step ?? instrument.step_volume ?? instrument.stepVolume);
  if (![min, max, step, volume].every(Number.isFinite) || min <= 0 || max < min || step <= 0 || volume < min || volume > max || Math.abs((volume - min) / step - Math.round((volume - min) / step)) > 1e-7) return 'Volume does not satisfy this account’s symbol limits.';
  if (account?.trade_enabled === false || account?.trading_enabled === false || ['disabled', 'blocked', 'closed'].includes(String(account?.status).toLowerCase())) return 'Trading is disabled for this account.';
  return null;
}
