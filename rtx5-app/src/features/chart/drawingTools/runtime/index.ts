import type { EnhancedDrawingToolRuntime } from '../types';
import { arrowMarkerEnhancedDrawingToolRuntime } from './arrowMarkerRuntime';
import { crosshairEnhancedDrawingToolRuntime } from './crosshairRuntime';
import { ellipseEnhancedDrawingToolRuntime } from './ellipseRuntime';
import { elliottWaveEnhancedDrawingToolRuntime } from './elliottWaveRuntime';
import { extendedLineEnhancedDrawingToolRuntime } from './extendedLineRuntime';
import { fibExtensionEnhancedDrawingToolRuntime } from './fibExtensionRuntime';
import { fibZoneEnhancedDrawingToolRuntime } from './fibZoneRuntime';
import { freehandBrushEnhancedDrawingToolRuntime } from './freehandBrushRuntime';
import { gannFanEnhancedDrawingToolRuntime } from './gannFanRuntime';
import { highlightBoxEnhancedDrawingToolRuntime } from './highlightBoxRuntime';
import { horizontalLineEnhancedDrawingToolRuntime } from './horizontalLineRuntime';
import { horizontalRayEnhancedDrawingToolRuntime } from './horizontalRayRuntime';
import { longPositionEnhancedDrawingToolRuntime } from './longPositionRuntime';
import { measureRangeEnhancedDrawingToolRuntime } from './measureRangeRuntime';
import { parallelChannelEnhancedDrawingToolRuntime } from './parallelChannelRuntime';
import { patternPathEnhancedDrawingToolRuntime } from './patternPathRuntime';
import { pitchforkEnhancedDrawingToolRuntime } from './pitchforkRuntime';
import { rayEnhancedDrawingToolRuntime } from './rayRuntime';
import { rectangleEnhancedDrawingToolRuntime } from './rectangleRuntime';
import { regressionChannelEnhancedDrawingToolRuntime } from './regressionChannelRuntime';
import { shortPositionEnhancedDrawingToolRuntime } from './shortPositionRuntime';
import { stickerEnhancedDrawingToolRuntime } from './stickerRuntime';
import { textLabelEnhancedDrawingToolRuntime } from './textLabelRuntime';
import { textLevelEnhancedDrawingToolRuntime } from './textLevelRuntime';
import { trendLineEnhancedDrawingToolRuntime } from './trendLineRuntime';
import { verticalLineEnhancedDrawingToolRuntime } from './verticalLineRuntime';
import { xabcdEnhancedDrawingToolRuntime } from './xabcdRuntime';

export { arrowMarkerEnhancedDrawingToolRuntime } from './arrowMarkerRuntime';
export { crosshairEnhancedDrawingToolRuntime } from './crosshairRuntime';
export { ellipseEnhancedDrawingToolRuntime } from './ellipseRuntime';
export { elliottWaveEnhancedDrawingToolRuntime } from './elliottWaveRuntime';
export { extendedLineEnhancedDrawingToolRuntime } from './extendedLineRuntime';
export { fibExtensionEnhancedDrawingToolRuntime } from './fibExtensionRuntime';
export { fibZoneEnhancedDrawingToolRuntime } from './fibZoneRuntime';
export { freehandBrushEnhancedDrawingToolRuntime } from './freehandBrushRuntime';
export { gannFanEnhancedDrawingToolRuntime } from './gannFanRuntime';
export { highlightBoxEnhancedDrawingToolRuntime } from './highlightBoxRuntime';
export { horizontalLineEnhancedDrawingToolRuntime } from './horizontalLineRuntime';
export { horizontalRayEnhancedDrawingToolRuntime } from './horizontalRayRuntime';
export { longPositionEnhancedDrawingToolRuntime } from './longPositionRuntime';
export { measureRangeEnhancedDrawingToolRuntime } from './measureRangeRuntime';
export { parallelChannelEnhancedDrawingToolRuntime } from './parallelChannelRuntime';
export { patternPathEnhancedDrawingToolRuntime } from './patternPathRuntime';
export { pitchforkEnhancedDrawingToolRuntime } from './pitchforkRuntime';
export { rayEnhancedDrawingToolRuntime } from './rayRuntime';
export { rectangleEnhancedDrawingToolRuntime } from './rectangleRuntime';
export { regressionChannelEnhancedDrawingToolRuntime } from './regressionChannelRuntime';
export { shortPositionEnhancedDrawingToolRuntime } from './shortPositionRuntime';
export { stickerEnhancedDrawingToolRuntime } from './stickerRuntime';
export { textLabelEnhancedDrawingToolRuntime } from './textLabelRuntime';
export { textLevelEnhancedDrawingToolRuntime } from './textLevelRuntime';
export { trendLineEnhancedDrawingToolRuntime } from './trendLineRuntime';
export { verticalLineEnhancedDrawingToolRuntime } from './verticalLineRuntime';
export { xabcdEnhancedDrawingToolRuntime } from './xabcdRuntime';

export const ENHANCED_DRAWING_TOOL_RUNTIMES: EnhancedDrawingToolRuntime[] = [
  crosshairEnhancedDrawingToolRuntime,
  trendLineEnhancedDrawingToolRuntime,
  arrowMarkerEnhancedDrawingToolRuntime,
  horizontalLineEnhancedDrawingToolRuntime,
  horizontalRayEnhancedDrawingToolRuntime,
  verticalLineEnhancedDrawingToolRuntime,
  rayEnhancedDrawingToolRuntime,
  extendedLineEnhancedDrawingToolRuntime,
  fibZoneEnhancedDrawingToolRuntime,
  fibExtensionEnhancedDrawingToolRuntime,
  highlightBoxEnhancedDrawingToolRuntime,
  rectangleEnhancedDrawingToolRuntime,
  ellipseEnhancedDrawingToolRuntime,
  freehandBrushEnhancedDrawingToolRuntime,
  textLabelEnhancedDrawingToolRuntime,
  textLevelEnhancedDrawingToolRuntime,
  patternPathEnhancedDrawingToolRuntime,
  parallelChannelEnhancedDrawingToolRuntime,
  longPositionEnhancedDrawingToolRuntime,
  shortPositionEnhancedDrawingToolRuntime,
  pitchforkEnhancedDrawingToolRuntime,
  gannFanEnhancedDrawingToolRuntime,
  regressionChannelEnhancedDrawingToolRuntime,
  elliottWaveEnhancedDrawingToolRuntime,
  xabcdEnhancedDrawingToolRuntime,
  stickerEnhancedDrawingToolRuntime,
  measureRangeEnhancedDrawingToolRuntime,
];

export const ENHANCED_DRAWING_TOOLS_RUNTIME_JS = ENHANCED_DRAWING_TOOL_RUNTIMES
  .map((runtime) => runtime.script)
  .filter((script) => script.trim().length > 0)
  .join('\n');
