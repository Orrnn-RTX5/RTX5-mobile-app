import type { Deal } from '../../api/deals';
import type { ClosedPosition } from '../../api/positions';
import {
  normalizeBalanceLedgerOperation,
  type BalanceLedgerOperation,
} from '../../api/transactions';
import {
  formatAccountAmount,
  METRIC_UNAVAILABLE,
  readBackendNumber,
  resolveAccountCurrencyDigits,
} from '../../utils/accountCurrency';
import { resolveTradeAccountMetrics } from '../../utils/accountMetrics';

type JsonRecord = Record<string, unknown>;

const NET_PROFIT_KEYS = ['netPnl', 'net_pnl', 'net_profit'];
const PROFIT_KEYS = ['profit', 'pnl', 'pl', 'close_profit', 'closed_profit'];
const SWAP_KEYS = ['swap', 'swaps'];
const COMMISSION_KEYS = ['commission', 'commissions'];
const FEE_KEYS = ['fee', 'fees'];
const BALANCE_OPERATION_TEXT_KEYS = [
  'action',
  'entry',
  'type',
  'deal_type',
  'dealType',
  'operation',
  'category',
  'reason',
];
const BALANCE_OPERATION_AMOUNT_KEYS = [
  'amount',
  'balance_change',
  'balanceChange',
  'change',
  'profit',
  'value',
  'money',
];
const BALANCE_OPERATION_PATTERN = /\b(balance|deposit|withdraw|withdrawal|fund|funding|cash)\b/;
const WITHDRAWAL_PATTERN = /\b(withdraw|withdrawal)\b/;

export type HistoryMoneySummary = {
  closedSwap: number;
  closedCommission: number;
  totalClosedPnl: number;
  deposit: number;
  depositSource: 'balance-operations' | 'balance-minus-closed-pnl';
};

export type DealBalanceOperation = {
  amount: number;
  kind: 'deposit' | 'withdrawal' | 'balance';
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function pickFiniteNumber(source: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = toFiniteNumber(source[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function pickText(source: JsonRecord, keys: string[]): string {
  return keys
    .map((key) => source[key])
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function resolveClosedPositionMoney(position: ClosedPosition): {
  netProfit: number;
  swap: number;
  commission: number;
} {
  const source = position as unknown as JsonRecord;
  const netProfit = pickFiniteNumber(source, NET_PROFIT_KEYS);
  if (netProfit !== undefined) {
    return {
      netProfit,
      swap: pickFiniteNumber(source, SWAP_KEYS) ?? 0,
      commission: pickFiniteNumber(source, COMMISSION_KEYS) ?? 0,
    };
  }

  const profit = pickFiniteNumber(source, PROFIT_KEYS) ?? 0;
  const swap = pickFiniteNumber(source, SWAP_KEYS) ?? 0;
  const commission = pickFiniteNumber(source, COMMISSION_KEYS) ?? 0;
  const fee = pickFiniteNumber(source, FEE_KEYS) ?? 0;

  // Closed-trade net P/L is the broker profit plus all settled charges.
  // Swap, commission, and fee are real account costs, so include each once.
  return {
    netProfit: profit + swap + commission + fee,
    swap,
    commission,
  };
}

export function resolveClosedPositionNetProfit(position: ClosedPosition): number {
  return resolveClosedPositionMoney(position).netProfit;
}

export function resolveDealBalanceOperation(deal: unknown): DealBalanceOperation | null {
  if (!isRecord(deal)) {
    return null;
  }

  // Deposits and withdrawals are account-ledger operations, not buy/sell
  // trade executions. Only classify rows with explicit balance-operation
  // markers so ordinary closed trades are never counted as deposits.
  const operationText = pickText(deal, BALANCE_OPERATION_TEXT_KEYS);
  const isBalanceOperation =
    BALANCE_OPERATION_PATTERN.test(operationText) ||
    operationText.includes('deal_balance');

  if (!isBalanceOperation) {
    return null;
  }

  const amount = pickFiniteNumber(deal, BALANCE_OPERATION_AMOUNT_KEYS);

  if (amount === undefined) {
    return null;
  }

  if (WITHDRAWAL_PATTERN.test(operationText) && amount > 0) {
    return {
      amount: -amount,
      kind: 'withdrawal',
    };
  }

  return {
    amount,
    kind: amount > 0 ? 'deposit' : amount < 0 ? 'withdrawal' : 'balance',
  };
}

function calculateDepositFromBalanceOperations(deals: Deal[]): number | null {
  let sawBalanceOperation = false;
  let depositTotal = 0;

  deals.forEach((deal) => {
    const operation = resolveDealBalanceOperation(deal);
    if (operation === null) {
      return;
    }

    sawBalanceOperation = true;
    if (operation.amount > 0) {
      depositTotal += operation.amount;
    }
  });

  return sawBalanceOperation ? depositTotal : null;
}

export function calculateHistoryMoneySummary({
  closedPositions,
  deals,
  balance,
}: {
  closedPositions: ClosedPosition[];
  deals: Deal[];
  balance: number;
}): HistoryMoneySummary {
  let closedSwap = 0;
  let closedCommission = 0;
  let totalClosedPnl = 0;

  closedPositions.forEach((position) => {
    const money = resolveClosedPositionMoney(position);
    closedSwap += money.swap;
    closedCommission += money.commission;
    totalClosedPnl += money.netProfit;
  });

  const depositFromDeals = calculateDepositFromBalanceOperations(deals);

  if (depositFromDeals !== null) {
    return {
      closedSwap,
      closedCommission,
      totalClosedPnl,
      deposit: depositFromDeals,
      depositSource: 'balance-operations',
    };
  }

  // Fallback for broker payloads that omit balance-operation rows. This keeps
  // the old display behavior. It is only an estimate because withdrawals or
  // history-range filters can make balance - closed P/L differ from deposits.
  return {
    closedSwap,
    closedCommission,
    totalClosedPnl,
    deposit: (Number.isFinite(balance) ? balance : 0) - totalClosedPnl,
    depositSource: 'balance-minus-closed-pnl',
  };
}

export interface HistoryFinancialSummary {
  profit: number | null;
  grossProfit: number | null;
  commission: number | null;
  swap: number | null;
  fee: number | null;
  credit: number | null;
  deposit: number | null;
  withdrawal: number | null;
}

const CASH_OR_CANCELED_DEAL_TYPES = new Set([
  'balance',
  'deal_balance',
  'credit',
  'deposit',
  'withdrawal',
  'bonus',
  'charge',
  'correction',
  'canceled',
  'cancelled',
]);

const VALID_DEAL_TYPES = new Set([
  'buy',
  'sell',
  'deal_buy',
  'deal_sell',
  '0',
  '1',
]);

const isTradingDealRecord = (deal: any): boolean => {
  if (!deal || typeof deal !== 'object') return false;
  if (deal.historySource === 'order' || deal.historySource === 'closed-position') {
    return false;
  }
  if (deal.canceled === true || deal.cancelled === true) {
    return false;
  }

  const rawType = deal.type ?? deal.action;
  const normalizedType = String(rawType ?? '')
    .trim()
    .toLowerCase();
  const normalizedEntry = String(deal.entry ?? '')
    .trim()
    .toLowerCase();
  const normalizedStatus = String(deal.status ?? deal.state ?? '')
    .trim()
    .toLowerCase();

  if (
    CASH_OR_CANCELED_DEAL_TYPES.has(normalizedType) ||
    CASH_OR_CANCELED_DEAL_TYPES.has(normalizedEntry) ||
    CASH_OR_CANCELED_DEAL_TYPES.has(normalizedStatus)
  ) {
    return false;
  }

  if (rawType !== undefined && rawType !== null && normalizedType !== '') {
    return VALID_DEAL_TYPES.has(normalizedType);
  }

  return (
    readBackendNumber(deal.profit) !== undefined ||
    readBackendNumber(deal.commission) !== undefined ||
    readBackendNumber(deal.swap) !== undefined ||
    readBackendNumber(deal.fee) !== undefined
  );
};

export function calculateHistoryFinancialSummary(
  deals: readonly any[] | null | undefined,
  balanceOperations?: readonly (BalanceLedgerOperation | Record<string, unknown>)[] | null,
): HistoryFinancialSummary {
  let profit: number | null = null;
  let grossProfit: number | null = null;
  let commission: number | null = null;
  let swap: number | null = null;
  let fee: number | null = null;

  if (Array.isArray(deals)) {
    profit = 0;
    grossProfit = 0;
    commission = 0;
    swap = 0;
    fee = 0;

    for (const deal of deals) {
      if (!isTradingDealRecord(deal)) continue;
      const dealProfit = readBackendNumber(deal.profit) ?? 0;
      const dealCommission = readBackendNumber(deal.commission) ?? 0;
      const dealSwap = readBackendNumber(deal.swap ?? deal.storage) ?? 0;
      const dealFee = readBackendNumber(deal.fee) ?? 0;

      grossProfit += dealProfit;
      commission += dealCommission;
      swap += dealSwap;
      fee += dealFee;
      profit += dealProfit + dealCommission + dealSwap + dealFee;
    }
  }

  let credit: number | null = null;
  let deposit: number | null = null;
  let withdrawal: number | null = null;

  if (Array.isArray(balanceOperations)) {
    credit = 0;
    deposit = 0;
    withdrawal = 0;

    for (const rawOp of balanceOperations) {
      const op = normalizeBalanceLedgerOperation(rawOp);
      if (!op) continue;
      if (op.type === 'credit') {
        credit += op.amount;
      } else if (op.type === 'deposit') {
        deposit += op.amount;
      } else if (op.type === 'withdrawal') {
        withdrawal += -Math.abs(op.amount);
      }
    }
  }

  return {
    profit,
    grossProfit,
    commission,
    swap,
    fee,
    credit,
    deposit,
    withdrawal,
  };
}

const normalizeRecordTimestampMs = (record: any): number | null => {
  const raw = record?.timestamp ?? record?.time ?? record?.created_at ?? record?.time_close;
  const num = readBackendNumber(raw);
  if (num !== undefined && num > 0) {
    return num < 1e11 ? num * 1000 : num;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw.trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
};

export function filterHistoryByPeriodAndSymbol<
  TDeal extends Record<string, any>,
  TBalanceOp extends Record<string, any>,
>(input: {
  deals: readonly TDeal[];
  balanceOperations: readonly TBalanceOp[];
  fromMs?: number | null;
  toMs?: number | null;
  symbol?: string | null;
}): {
  deals: TDeal[];
  balanceOperations: TBalanceOp[];
} {
  const normalizedSymbol =
    typeof input.symbol === 'string' &&
    input.symbol.trim() !== '' &&
    input.symbol.trim().toUpperCase() !== 'ALL' &&
    input.symbol.trim().toUpperCase() !== 'ALL SYMBOLS'
      ? input.symbol.trim().toUpperCase()
      : null;

  const isWithinPeriod = (record: any): boolean => {
    if (input.fromMs == null && input.toMs == null) return true;
    const tsMs = normalizeRecordTimestampMs(record);
    if (tsMs === null) return false;
    if (typeof input.fromMs === 'number' && Number.isFinite(input.fromMs) && tsMs < input.fromMs) {
      return false;
    }
    if (typeof input.toMs === 'number' && Number.isFinite(input.toMs) && tsMs > input.toMs) {
      return false;
    }
    return true;
  };

  // Date/Period filter filters BOTH deals and balanceOperations.
  // Symbol filter filters ONLY deals (never balanceOperations).
  const filteredDeals = input.deals.filter((deal) => {
    if (!isWithinPeriod(deal)) return false;
    if (normalizedSymbol !== null) {
      const dealSym = String(deal?.symbol ?? '')
        .trim()
        .toUpperCase();
      if (dealSym !== normalizedSymbol) return false;
    }
    return true;
  });

  const filteredBalanceOperations = input.balanceOperations.filter((op) => isWithinPeriod(op));

  return {
    deals: filteredDeals,
    balanceOperations: filteredBalanceOperations,
  };
}

export function formatHistoryBalanceMetric(account: unknown): string {
  const metrics = resolveTradeAccountMetrics(account);
  if (metrics.balance === null) {
    return METRIC_UNAVAILABLE;
  }
  const currencyDigits = resolveAccountCurrencyDigits(account);
  return formatAccountAmount(metrics.balance, currencyDigits);
}
