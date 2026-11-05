export type TradingSession = 'Asian' | 'London' | 'New York' | 'Overlap' | 'Out of Session';
export type MarketType = 'Forex' | 'Gold/Metals' | 'Crypto' | 'Indices' | 'Stocks';
export type TradeDirection = 'Buy' | 'Sell';
export type StrategyType = 'Breakout' | 'Retest' | 'Reversal' | 'Continuation' | 'Support/Resistance' | 'Supply/Demand' | 'News' | 'Scalping' | 'Custom';
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1';
export type TrendDirection = 'Bullish' | 'Bearish' | 'Ranging';
export type SetupType = 'Breakout' | 'Retest' | 'Reversal' | 'Continuation';
export type TradeCloseType = 'TP Hit' | 'SL Hit' | 'Manual Close' | 'Partial Close' | 'Breakeven';
export type RuleFollowing = 'Yes' | 'No' | 'Partial';
export type Emotion = 'Calm' | 'Fear' | 'Greed' | 'FOMO' | 'Revenge' | 'Overconfident' | 'Hesitation' | 'Neutral';
export type TradeResult = 'Win' | 'Loss' | 'Breakeven' | 'Open';

export interface TradeJournalEntry {
  id: string;
  createdAt: string; 
  
  // 1. Basic Details
  date: string; 
  session: TradingSession;
  market: MarketType;
  symbol: string;
  tradeType: TradeDirection;
  strategy: StrategyType;
  timeframe?: Timeframe;
  
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  exitPrice?: number;
  lotSize?: number;
  riskAmount?: number;
  
  riskPercentage?: number;
  rewardToRiskRatio?: number;
  pnlMoney?: number;
  pnlPips?: number;
  finalRMultiple?: number;
  result?: TradeResult;
  accountBalanceBefore?: number;
  accountBalanceAfter?: number;

  // 2. Setup
  entryReason?: string;
  marketStructure?: string;
  trendDirection?: TrendDirection;
  supportResistanceLevel?: string;
  setupType?: SetupType;
  confirmationUsed?: string;
  newsImpact?: string;

  // 3. Management
  slMoved?: boolean;
  partialProfitTaken?: boolean;
  closeType?: TradeCloseType;
  followedPlan?: RuleFollowing;
  maxDrawdownDuringTrade?: number;
  maxProfitDuringTrade?: number;

  // 4. Psychology & Discipline
  emotionBefore?: Emotion;
  emotionDuring?: Emotion;
  emotionAfter?: Emotion;
  brokeRule?: boolean;
  disciplineScore?: number; 

  // 5. Media & Reflection
  screenshotBefore?: string;
  screenshotDuring?: string;
  screenshotAfter?: string;
  screenshotNotes?: string;
  didRight?: string;
  didWrong?: string;
  improveNextTime?: string;
  mainLesson?: string;
}
