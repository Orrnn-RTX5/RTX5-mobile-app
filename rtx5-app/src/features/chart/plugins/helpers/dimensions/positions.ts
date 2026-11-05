/**
 * Lightweight-Charts Plugin Helper: Positions
 * 
 * Mathematical utilities ensuring sharp sub-pixel rendering. Computes crisp 
 * device-pixel boundaries for continuous vector shapes (lines/boxes) to avoid 
 * blurry anti-aliased artifacts on high-DPI (Retina) mobile screens.
 */

import { BitmapPositionLength } from './common';

function centreOffset(lineBitmapWidth: number): number {
	return Math.floor(lineBitmapWidth * 0.5);
}

export function positionsLine(
	positionMedia: number,
	pixelRatio: number,
	desiredWidthMedia: number = 1,
	widthIsBitmap?: boolean
): BitmapPositionLength {
	const scaledPosition = Math.round(pixelRatio * positionMedia);
	const lineBitmapWidth = widthIsBitmap
		? desiredWidthMedia
		: Math.round(desiredWidthMedia * pixelRatio);
	const offset = centreOffset(lineBitmapWidth);
	const position = scaledPosition - offset;
	return { position, length: lineBitmapWidth };
}

export function positionsBox(
	position1Media: number,
	position2Media: number,
	pixelRatio: number
): BitmapPositionLength {
	const scaledPosition1 = Math.round(pixelRatio * position1Media);
	const scaledPosition2 = Math.round(pixelRatio * position2Media);
	return {
		position: Math.min(scaledPosition1, scaledPosition2),
		length: Math.abs(scaledPosition2 - scaledPosition1) + 1,
	};
}
