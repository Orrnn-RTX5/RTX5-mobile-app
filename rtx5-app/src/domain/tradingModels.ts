/** Shared live trading models; no simulation data or side effects. */
export type QuoteItem = {
  symbol: string;
  bid: number;
  ask: number;
  feedTickAt?: number;
  lastTickAt?: number;
  lastReceivedAt?: number;
  lastPriceChangedAt?: number;
  source?: string;
  authority?: string;
  transport?: 'websocket' | 'rest_snapshot';
  stale?: boolean;
  tradable?: boolean;
  marketState?: string;
  degraded?: boolean;
  degradationReason?: 'missing_ask';
  sequence?: string | number;
  tickId?: string;
  ageMs?: number;
  ageSec?: number;
  prevBid?: number;
  prevAsk?: number;
  changePct: number;
  high: number;
  low: number;
  open?: number;
  close?: number;
  volume?: number;
  volumeSource?: 'backend';
  digits?: number;
  digitsSource?: 'backend';
  contractSize: number;
  minVolume?: number;
  maxVolume?: number;
  stepVolume?: number;
  point?: number;
  tickSize?: number;
  tickValue?: number;
  swapLong: number;
  swapShort: number;
  marginInitial?: number;
  marginMaintenance?: number;
  baseCurrency?: string;
  profitCurrency?: string;
  tradeAllowed?: boolean;
  spread: number;
  volatilityClass?: 'high' | 'medium' | 'low'; // Used by simulation engine
};

export type PositionItem = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  currentPrice: number;
  pnl: number;
  /** False while a confirmed fill has not supplied broker floating profit yet. */
  pnlReported?: boolean;
  swap: number;
  commission?: number;
  openTime: string;
  sl?: number;
  tp?: number;
  clientCreatedAt?: number;
  clientModifiedAt?: number;
};
