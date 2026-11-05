/**
 * Lightweight-Charts Plugin Helper: Dimension Common
 * 
 * Defines standard interfaces for translating logical layout metrics into 
 * exact physical device pixels for the internal rendering scope.
 */

export interface BitmapPositionLength {
	/** coordinate for use with a bitmap rendering scope */
	position: number;
	/** length for use with a bitmap rendering scope */
	length: number;
}
