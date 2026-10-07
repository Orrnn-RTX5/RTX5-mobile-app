import type { Deal } from '../../api/deals';
import type { ClosedPosition } from '../../api/positions';

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
