import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('add symbol category rows use professional monochrome market logos', () => {
  const source = readSource('src/features/quotes/QuotesScreen.tsx');

  assert.match(source, /type AddSymbolFolderLogoMeta = \{/);
  assert.match(source, /const ADD_SYMBOL_FOLDER_LOGO_META: Record<AddSymbolFolderKey, AddSymbolFolderLogoMeta> = \{/);
  assert.match(source, /commodities: \{[\s\S]*icon: 'flame'/);
  assert.match(source, /cryptocurrenciesMtt: \{[\s\S]*icon: 'logo-bitcoin'/);
  assert.match(source, /forexMarket: \{[\s\S]*icon: 'earth'/);
  assert.match(source, /indices: \{[\s\S]*icon: 'bar-chart'/);
  assert.match(source, /metalsMtt: \{[\s\S]*icon: 'diamond'/);
  assert.match(source, /function AddSymbolFolderLogo\(\{ folderKey, isDark \}: \{ folderKey: AddSymbolFolderKey; isDark: boolean \}\)/);
  assert.match(source, /backgroundColor: isDark \? 'rgba\(148,163,184,0\.12\)' : '#F8FAFC'/);
  assert.match(source, /<Ionicons name=\{meta\.icon\} size=\{meta\.iconSize \?\? 23\} color=\{isDark \? '#E5E7EB' : '#111827'\} \/>/);
  assert.match(source, /<AddSymbolFolderLogo folderKey=\{item\.key\} isDark=\{isDark\} \/>/);
  assert.doesNotMatch(source, /<Ionicons name="folder-open"/);
  assert.doesNotMatch(source, /folderLogoCodePill/);
  assert.doesNotMatch(source, /folderLogoHighlight/);
  assert.doesNotMatch(source, /code: 'BTC'/);
});

test('add symbol tree never drops an unclassified broker symbol', () => {
  const source = readSource('src/features/quotes/QuotesScreen.tsx');

  // The shared domain crypto classifier backs the local one (33-coin set,
  // same as the chart header badge).
  assert.match(source, /import \{ isCryptoSymbol, normalizeQuoteSymbolKey, normalizeSymbol \} from '\.\.\/\.\.\/domain\/symbols'/);
  assert.match(source, /if \(isCryptoSymbol\(symbol\)\) \{\s*\n\s*return 'crypto';/);

  // Every symbol lands in exactly one bucket; 'other' is the catch-all.
  assert.match(source, /type AddSymbolLeafCategory = [^;]*'other';/);
  assert.match(source, /else if \(kind === 'index'\) groups\.indices\.push\(symbol\);\s*\n\s*else groups\.other\.push\(symbol\);/);

  // The Other folder stays hidden while empty so the stock layout is unchanged.
  assert.match(source, /\{ key: 'other', label: 'Other' \}/);
  assert.match(source, /entry\.key !== 'other' \|\| groupedSymbols\.other\.length > 0/);
  assert.match(source, /other: \{[\s\S]*?icon: 'apps'/);
});

test('add symbol navigation and count chips use restrained badge colors', () => {
  const source = readSource('src/features/quotes/QuotesScreen.tsx');

  assert.match(source, /chipBg: 'rgba\(30,41,59,0\.86\)'/);
  assert.match(source, /chipBorder: 'rgba\(148,163,184,0\.24\)'/);
  assert.match(source, /chipText: '#8AB4F8'/);
  assert.match(source, /actionBg: 'rgba\(30,41,59,0\.86\)'/);
  assert.match(source, /actionText: '#8AB4F8'/);
  assert.match(source, /headerCountText, \{ color: addPalette\.chipText \}/);
  assert.match(source, /breadcrumbText,[\s\S]*item === folder \? addPalette\.chipText : addPalette\.mutedText/);
  assert.match(source, /folderCount, \{ color: addPalette\.chipText \}/);
  assert.match(source, /color=\{alreadyAdded \? T\.trading\.profit : addPalette\.actionText\}/);
  assert.match(source, /borderColor: alreadyAdded \? T\.trading\.profit : addPalette\.chipBorder/);
  assert.doesNotMatch(source, /chipBg: 'rgba\(169,112,255,0\.16\)'/);
  assert.doesNotMatch(source, /chipBorder: QUOTES_DARK_ACCENT_BORDER/);
  assert.doesNotMatch(source, /actionBg: QUOTES_DARK_ACCENT_SOFT/);
});
