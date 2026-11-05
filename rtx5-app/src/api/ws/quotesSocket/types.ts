import type { QuoteTickEvent } from '../quoteTickNormalizer';

export type SymbolTickListener = (tick: QuoteTickEvent) => void;
export type GlobalTickListener = (tick: QuoteTickEvent) => void;

export type { QuoteTickEvent };
