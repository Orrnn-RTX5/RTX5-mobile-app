/**
 * Lightweight-Charts Plugin Helper: Assertions
 * 
 * TypeScript type-guard utilities strictly enforcing variable definitions 
 * during complex charting object lifecycle moments (e.g. throwing if 
 * a Coordinate is null when a draw call is requested).
 */

export function ensureDefined(value: undefined): never;
export function ensureDefined<T>(value: T | undefined): T;
export function ensureDefined<T>(value: T | undefined): T {
	if (value === undefined) {
		throw new Error('Value is undefined');
	}
	return value;
}

export function ensureNotNull(value: null): never;
export function ensureNotNull<T>(value: T | null): T;
export function ensureNotNull<T>(value: T | null): T {
	if (value === null) {
		throw new Error('Value is null');
	}
	return value;
}
