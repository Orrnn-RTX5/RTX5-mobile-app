export type FormattedChartTradePriceParts = Readonly<{
  leading: string;
  trailing: string;
}>;

/**
 * Split only fractional digits from an already-authoritative fixed price.
 * MT5 emphasizes at most the final two decimals; zero- and one-decimal
 * instruments remain valid and placeholders are left untouched.
 */
export function splitFormattedChartTradePrice(
  formattedPrice: string,
): FormattedChartTradePriceParts {
  const decimalIndex = formattedPrice.lastIndexOf('.');
  const fractionalDigitCount = decimalIndex >= 0
    ? formattedPrice.length - decimalIndex - 1
    : 0;
  const trailingDigitCount = Math.min(2, Math.max(0, fractionalDigitCount));

  if (trailingDigitCount === 0) {
    return { leading: formattedPrice, trailing: '' };
  }

  return {
    leading: formattedPrice.slice(0, -trailingDigitCount),
    trailing: formattedPrice.slice(-trailingDigitCount),
  };
}
