import { readBackendNumber, resolveAccountCurrency } from '../../utils/accountCurrency';
import { resolveTradeAccountMetrics } from '../../utils/accountMetrics';

export interface ExposureAssetRow {
  asset: string;
  volume: number;
  signedUnits: number;
  signedNotional: number;
  marginValue: number;
  netExposurePercent: number;
  side: 'LONG' | 'SHORT' | 'FLAT';
  isCash: boolean;
}

export interface AccountExposureSummary {
  rows: ExposureAssetRow[];
  cashRow: ExposureAssetRow | null;
  cashBasis: number;
  longValue: number;
  shortValue: number;
  longPercent: number;
  shortPercent: number;
  totalAbsExposure: number;
}

export interface InstrumentCatalogEntry {
  symbol?: string;
  base_currency?: string;
  baseCurrency?: string;
  contract_size?: number | string;
  contractSize?: number | string;
}

export interface CalculateAccountExposureInput {
  positions: readonly any[] | null | undefined;
  account: any;
  contractSizesBySymbol?: ReadonlyMap<string, number> | Record<string, number>;
  baseCurrenciesBySymbol?: ReadonlyMap<string, string> | Record<string, string>;
  instruments?: readonly InstrumentCatalogEntry[] | null;
}

const lookupMapOrRecordNumber = (
  source: ReadonlyMap<string, number> | Record<string, number> | undefined,
  key: string,
): number | undefined => {
  if (!source || !key) return undefined;
  if (typeof (source as ReadonlyMap<string, number>).get === 'function') {
    const val = (source as ReadonlyMap<string, number>).get(key);
    return readBackendNumber(val);
  }
  return readBackendNumber((source as Record<string, unknown>)[key]);
};

const lookupMapOrRecordString = (
  source: ReadonlyMap<string, string> | Record<string, string> | undefined,
  key: string,
): string | undefined => {
  if (!source || !key) return undefined;
  if (typeof (source as ReadonlyMap<string, string>).get === 'function') {
    const val = (source as ReadonlyMap<string, string>).get(key);
    return typeof val === 'string' && val.trim() ? val.trim().toUpperCase() : undefined;
  }
  const val = (source as Record<string, unknown>)[key];
  return typeof val === 'string' && val.trim() ? val.trim().toUpperCase() : undefined;
};

export const extractPositionBaseAsset = (
  position: any,
  baseCurrenciesBySymbol?: ReadonlyMap<string, string> | Record<string, string>,
  instrumentsBySymbol?: ReadonlyMap<string, InstrumentCatalogEntry>,
): string | null => {
  const directBase = position?.base_currency ?? position?.baseCurrency;
  if (typeof directBase === 'string' && directBase.trim()) {
    return directBase.trim().toUpperCase();
  }

  const rawSymbol = String(position?.symbol ?? '').trim().toUpperCase();
  if (!rawSymbol) return null;

  const catalogBase =
    lookupMapOrRecordString(baseCurrenciesBySymbol, rawSymbol) ??
    instrumentsBySymbol?.get(rawSymbol)?.base_currency?.trim().toUpperCase() ??
    instrumentsBySymbol?.get(rawSymbol)?.baseCurrency?.trim().toUpperCase();
  if (catalogBase) {
    return catalogBase;
  }

  const cleaned = rawSymbol.replace(/[._/-].*$/, '');
  if (/^[A-Z]{6}/.test(cleaned)) {
    return cleaned.slice(0, 3);
  }
  if (/^[A-Z0-9]{3,10}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
};

export const resolveExplicitContractSize = (
  position: any,
  contractSizesBySymbol?: ReadonlyMap<string, number> | Record<string, number>,
  instrumentsBySymbol?: ReadonlyMap<string, InstrumentCatalogEntry>,
): number | null => {
  const direct = readBackendNumber(position?.contractSize ?? position?.contract_size);
  if (direct !== undefined && direct > 0) {
    return direct;
  }

  const symbolKey = String(position?.symbol ?? '').trim().toUpperCase();
  if (!symbolKey) return null;

  const fromMap = lookupMapOrRecordNumber(contractSizesBySymbol, symbolKey);
  if (fromMap !== undefined && fromMap > 0) {
    return fromMap;
  }

  const instrument = instrumentsBySymbol?.get(symbolKey);
  if (instrument) {
    const fromInstrument = readBackendNumber(instrument.contractSize ?? instrument.contract_size);
    if (fromInstrument !== undefined && fromInstrument > 0) {
      return fromInstrument;
    }
  }

  // White-label rule: NEVER guess or fallback to 100,000 or symbol heuristics.
  return null;
};

export const calculateAccountExposure = ({
  positions,
  account,
  contractSizesBySymbol,
  baseCurrenciesBySymbol,
  instruments,
}: CalculateAccountExposureInput): AccountExposureSummary => {
  const instrumentsBySymbol = new Map<string, InstrumentCatalogEntry>();
  if (Array.isArray(instruments)) {
    for (const inst of instruments) {
      const sym = String(inst?.symbol ?? '').trim().toUpperCase();
      if (sym) {
        instrumentsBySymbol.set(sym, inst);
      }
    }
  }

  const accountMetrics = resolveTradeAccountMetrics(account);
  const rawLeverage = readBackendNumber(account?.leverage);
  const accountLeverage = rawLeverage !== undefined && rawLeverage > 0 ? rawLeverage : null;

  const freeMargin = accountMetrics.freeMargin ?? 0;
  const equity = accountMetrics.equity ?? 0;
  const balance = accountMetrics.balance ?? 0;
  const accountEquity = equity > 0 ? equity : balance > 0 ? balance : 0;
  const cashBasis =
    freeMargin > 0
      ? freeMargin
      : equity > 0
        ? equity
        : balance > 0
          ? balance
          : 0;

  const assetMap = new Map<
    string,
    {
      asset: string;
      volume: number;
      signedUnits: number;
      signedNotional: number;
      marginValue: number;
      isCash: boolean;
    }
  >();

  if (Array.isArray(positions)) {
    for (const position of positions) {
      const contractSize = resolveExplicitContractSize(
        position,
        contractSizesBySymbol,
        instrumentsBySymbol,
      );
      if (contractSize === null) {
        // Skip position rather than guessing contract size
        continue;
      }

      const baseAsset = extractPositionBaseAsset(
        position,
        baseCurrenciesBySymbol,
        instrumentsBySymbol,
      );
      if (!baseAsset) continue;

      const volume = readBackendNumber(
        position?.volume ?? position?.volume_lots ?? position?.quantity,
      );
      const currentPrice = readBackendNumber(
        position?.currentPrice ??
          position?.current_price ??
          position?.price_current ??
          position?.openPrice ??
          position?.open_price ??
          position?.price_open,
      );
      if (volume === undefined || volume <= 0 || currentPrice === undefined || currentPrice <= 0) {
        continue;
      }

      const rawSide = String(position?.side ?? '').trim().toUpperCase();
      const direction =
        rawSide === 'SELL' || rawSide === 'SHORT' || Number(position?.action) === 1 ? -1 : 1;

      const signedUnits = direction * volume * contractSize;
      const signedNotional = signedUnits * currentPrice;
      const rawPositionMargin =
        accountLeverage !== null
          ? (volume * contractSize * currentPrice) / accountLeverage
          : (readBackendNumber(position?.margin ?? position?.used_margin) ?? 0);
      const signedPositionMargin = direction * rawPositionMargin;

      const existing = assetMap.get(baseAsset);
      if (existing) {
        existing.volume += direction * volume;
        existing.signedUnits += signedUnits;
        existing.signedNotional += signedNotional;
        existing.marginValue += signedPositionMargin;
      } else {
        assetMap.set(baseAsset, {
          asset: baseAsset,
          volume: direction * volume,
          signedUnits,
          signedNotional,
          marginValue: signedPositionMargin,
          isCash: false,
        });
      }
    }
  }

  let cashRow: ExposureAssetRow | null = null;
  const accountCurrency = resolveAccountCurrency(account);
  if (accountCurrency) {
    const netExposurePercent = accountEquity > 0 ? (Math.abs(cashBasis) / accountEquity) * 100 : 0;
    cashRow = {
      asset: accountCurrency,
      volume: cashBasis,
      signedUnits: cashBasis,
      signedNotional: cashBasis,
      marginValue: cashBasis,
      netExposurePercent,
      side: cashBasis > 0 ? 'LONG' : 'FLAT',
      isCash: true,
    };
  }

  const rows: ExposureAssetRow[] = [];
  let longValue = 0;
  let shortValue = 0;

  for (const entry of assetMap.values()) {
    const netExposurePercent =
      accountEquity > 0 ? (Math.abs(entry.marginValue) / accountEquity) * 100 : 0;
    const side: 'LONG' | 'SHORT' | 'FLAT' =
      entry.signedNotional > 0 ? 'LONG' : entry.signedNotional < 0 ? 'SHORT' : 'FLAT';

    if (entry.marginValue > 0) {
      longValue += entry.marginValue;
    } else if (entry.marginValue < 0) {
      shortValue += Math.abs(entry.marginValue);
    }

    rows.push({
      asset: entry.asset,
      volume: entry.volume,
      signedUnits: entry.signedUnits,
      signedNotional: entry.signedNotional,
      marginValue: entry.marginValue,
      netExposurePercent,
      side,
      isCash: false,
    });
  }

  if (cashRow) {
    rows.push(cashRow);
  }

  const totalAbsExposure = longValue + shortValue;
  const longPercent = totalAbsExposure > 0 ? (longValue / totalAbsExposure) * 100 : 0;
  const shortPercent = totalAbsExposure > 0 ? (shortValue / totalAbsExposure) * 100 : 0;

  return {
    rows,
    cashRow,
    cashBasis,
    longValue,
    shortValue,
    longPercent,
    shortPercent,
    totalAbsExposure,
  };
};
