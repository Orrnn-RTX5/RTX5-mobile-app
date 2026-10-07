export function calculateWinRatePercentFromCounts({
  wins,
  losses,
}: {
  wins: number;
  losses: number;
}): number {
  const safeWins = Number.isFinite(wins) ? Math.max(0, Math.trunc(wins)) : 0;
  const safeLosses = Number.isFinite(losses) ? Math.max(0, Math.trunc(losses)) : 0;
  // Breakeven trades are still trades, but they are not wins or losses.
  // Win rate uses only decisive closed trades: wins / (wins + losses).
  const decisiveTrades = safeWins + safeLosses;

  if (decisiveTrades === 0) {
    return 0;
  }

  return Math.round((safeWins / decisiveTrades) * 100);
}

export function calculateWinRatePercentFromPnl(values: readonly number[]): number {
  let wins = 0;
  let losses = 0;

  values.forEach((value) => {
    // Zero net P/L is breakeven and should not reduce the win percentage.
    if (!Number.isFinite(value) || value === 0) {
      return;
    }

    if (value > 0) {
      wins += 1;
      return;
    }

    losses += 1;
  });

  return calculateWinRatePercentFromCounts({ wins, losses });
}
