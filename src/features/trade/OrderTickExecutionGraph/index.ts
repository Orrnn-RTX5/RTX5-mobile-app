/**
 * Public entry for the order tick-execution graph. Split for the 500-line ceiling:
 *   - `types.ts`                       — shared types & layout constants
 *   - `tickHelpers.ts`                 — pure tick-shape helpers
 *   - `useOrderExecutionTicks.ts`      — observed broker-tick subscription hook
 *   - `OrderTickExecutionGraph.tsx`    — SVG renderer + Live wrapper
 */
export {
  OrderTickExecutionGraph,
  LiveOrderTickExecutionGraph,
} from './OrderTickExecutionGraph';
export type {
  TickPoint,
  OrderTickExecutionGraphProps,
  LiveOrderTickExecutionGraphProps,
} from './types';
