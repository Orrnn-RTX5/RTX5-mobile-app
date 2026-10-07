import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('quotes dark palette keeps approved surfaces and improves interactive contrast', () => {
  const source = readSource('src/features/quotes/QuotesScreen.tsx');

  assert.match(source, /const QUOTES_DARK_BACKGROUND = '#121212'/);
  assert.match(source, /const QUOTES_DARK_SURFACE = '#1E1E1E'/);
  assert.match(source, /const QUOTES_DARK_INTERACTIVE_BORDER = 'rgba\(255,255,255,0\.20\)'/);
  assert.match(source, /const QUOTES_DARK_PLACEHOLDER_TEXT = 'rgba\(235,235,245,0\.52\)'/);
  assert.match(source, /searchBorder: QUOTES_DARK_INTERACTIVE_BORDER/);
  assert.match(source, /searchPlaceholder: QUOTES_DARK_PLACEHOLDER_TEXT/);
  assert.match(source, /actionBorder: QUOTES_DARK_INTERACTIVE_BORDER/);
  assert.match(source, /placeholderTextColor=\{isDark \? QUOTES_DARK_PLACEHOLDER_TEXT : '#B8B8B8'\}/);
});
