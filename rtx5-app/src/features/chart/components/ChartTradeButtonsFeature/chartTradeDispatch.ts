export type ImmediateChartTradeDispatchOptions<TTrade> = Readonly<{
  trade: TTrade;
  emitPending: (trade: TTrade) => void;
  /** False means the request already settled synchronously. */
  dispatch: (trade: TTrade) => void | boolean;
}>;

/**
 * Starts transport before receipt rendering, all in the same tap call.
 * There is deliberately no queue, concurrency limit, timer, or prior-result
 * dependency here: every invocation owns an independent broker request.
 */
export function dispatchChartTradeImmediately<TTrade>({
  trade,
  emitPending,
  dispatch,
}: ImmediateChartTradeDispatchOptions<TTrade>): void {
  if (dispatch(trade) === false) return;
  try {
    emitPending(trade);
  } catch {
    // Receipt presentation is secondary; it must never block broker transport.
  }
}
