export type ImmediateChartTradeDispatchOptions<TTrade> = Readonly<{
  trade: TTrade;
  emitPending: (trade: TTrade) => void;
  dispatch: (trade: TTrade) => void;
}>;

/**
 * Makes an accepted chart trade visible and dispatches it in the same call.
 * There is deliberately no queue, concurrency limit, timer, or prior-result
 * dependency here: every invocation owns an independent broker request.
 */
export function dispatchChartTradeImmediately<TTrade>({
  trade,
  emitPending,
  dispatch,
}: ImmediateChartTradeDispatchOptions<TTrade>): void {
  try {
    emitPending(trade);
  } catch {
    // Receipt presentation is secondary; it must never block broker transport.
  }
  dispatch(trade);
}
