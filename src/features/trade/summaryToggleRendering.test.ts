import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { fmt } from '../../utils/format';
import { formatMarginLevel } from '../../api/accountsMapper';

type Element = { type: string; props: Record<string, any>; children: any[] };
const React = {
  memo: (render: unknown) => render,
  createElement: (type: string | ((props: any) => Element), props: Record<string, any> | null, ...children: any[]): Element =>
    typeof type === 'function'
      ? type({ ...props, children })
      : { type, props: props ?? {}, children },
};

// Execute the actual JSX with native hosts stubbed, so a conditional that removes
// a label, value, or currency is caught in the rendered output.
function expression(path: string, name: string, scope: Record<string, unknown>): any {
  const file = ts.createSourceFile(path, readFileSync(resolve(process.cwd(), path), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(initializer, `missing ${name}`);
  const code = ts.transpileModule(`exports.value = ${initializer.getText(file)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(code, { exports, React, View: 'View', Text: 'Text', FastPressable: 'Button',
    useTranslation: () => ({ t: (value: string) => value }), fmt, ...scope });
  return exports.value;
}
function text(node: any): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return (Array.isArray(node) ? node : node.children ?? []).map(text).join('');
}
function button(node: Element): Element | undefined {
  if (node.type === 'Button') return node;
  for (const child of node.children.flat()) {
    if (child && typeof child === 'object') {
      const result = button(child);
      if (result) return result;
    }
  }
  return undefined;
}

function tradeStyles(source: string, isDark: boolean): Record<string, any> {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === 'react-native') return { StyleSheet: { create: (styles: unknown) => styles } };
    if (name === '../../../ui/theme/index') return { spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } };
    throw new Error(`Unexpected styles dependency: ${name}`);
  } });
  return exports.makeTradeScreenStyles({}, isDark);
}

function flattenStyle(style: any): Record<string, any> {
  return Array.isArray(style) ? Object.assign({}, ...style.map(flattenStyle)) : style || {};
}

test('Trade details display the backend margin level and show zero for an unavailable value', () => {
  for (const [marginLevel, expected] of [[87952.5, '87,952.50%'], [0, '0%'], [undefined, '0%'], [NaN, '0%']] as const) {
    const render = expression('src/features/trade/TradeScreen/SummaryHeader.tsx', 'TradeSummaryDetailsHeader', {
      React: { ...React, useContext: () => ({ marginLevel, currency: 'USD' }) },
      TradeAccountSummaryContext: {},
      useMemo: (compute: () => unknown) => compute(),
      useUserPreferences: (select: (state: any) => unknown) => select({ tradeSummaryDetailsVisible: true }),
      formatMarginLevel,
      SummaryMetricRow: ({ label, value }: any) => React.createElement('Text', {}, label, ': ', value, ';'),
    });
    const node = render({ positions: [], s: {}, T: {}, isDark: false, totalVolume: 0, onBulkPress: () => {} });
    assert.ok(text(node).includes(`Margin Level: ${expected};`));
  }
});

test('Trade collapse never unsets an active native border edge on the headline', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/trade/TradeScreen/styles.ts'), 'utf8');
  const render = expression('src/features/trade/TradeScreen/SummaryHeader.tsx', 'LiveUnrealizedPnLHeader', {});
  const checkTransitions = (stylesSource: string) => {
    for (const isDark of [false, true]) {
      const s = tradeStyles(stylesSource, isDark);
      let visible = true;
      let previous: Record<string, any>[] | undefined;
      for (let press = 0; press < 3; press++) {
        const node: Element = render({ account: { floating: 35.42, currency: 'USD' }, s, T: {},
          isDark, detailsVisible: visible, hasOpenPositions: true,
          onToggleDetails: () => { visible = !visible; } });
        const toggle = button(node);
        assert.ok(toggle);
        const current = [flattenStyle(node.props.style), flattenStyle(toggle.props.style)];
        current.forEach((style, index) => {
          // Android represents removal of a previously set edge as NaN. Its
          // rounded overflow clip then hides children despite valid JSX/text.
          for (const edge of Object.keys(previous?.[index] ?? {}).filter((key) => /^border.+Width$/.test(key))) {
            assert.ok(Number.isFinite(style[edge]), `${index === 0 ? 'card' : 'toggle'} ${edge} became unset`);
          }
        });
        previous = current;
        toggle.props.onPress();
      }
    }
  };
  checkTransitions(source);

  // Prove this catches the original styles without changing the working tree.
  const original = ts.createSourceFile('styles.ts', source, ts.ScriptTarget.Latest, true);
  const transformed = ts.transform(original, [(context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isPropertyAssignment(node) && /^(summaryBlock|summaryTop)$/.test(node.name.getText(original)) && ts.isObjectLiteralExpression(node.initializer)) {
        return context.factory.updatePropertyAssignment(node, node.name,
          context.factory.updateObjectLiteralExpression(node.initializer,
            node.initializer.properties.filter((property) => property.name?.getText(original) !== 'borderBottomWidth')));
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (file) => ts.visitNode(file, visit) as ts.SourceFile;
  }]);
  const oldSource = ts.createPrinter().printFile(transformed.transformed[0]);
  transformed.dispose();
  assert.throws(() => checkTransitions(oldSource), /card borderBottomWidth became unset/);
});

test('Trade Hide/Show keeps the live P/L label, signed value, currency, and toggle', () => {
  const render = expression('src/features/trade/TradeScreen/SummaryHeader.tsx', 'LiveUnrealizedPnLHeader', {});
  for (const isDark of [false, true]) {
    let visible = true;
    for (const floating of [35.42, -12.5, 0]) {
      // Show -> Hide -> Show; changing P/L while hidden must also stay visible.
      for (let press = 0; press < 3; press++) {
        const node: Element = render({ account: { floating, currency: 'EUR' }, s: {},
          T: { up: 'positive', down: 'negative' }, isDark, detailsVisible: visible,
          hasOpenPositions: true, onToggleDetails: () => { visible = !visible; } });
        assert.equal(text(node), `Floating Profit/Loss${fmt.pnlPrecise(floating)} EUR`);
        const toggle = button(node);
        assert.ok(toggle);
        assert.equal(toggle.props.accessibilityState.expanded, visible);
        toggle.props.onPress();
      }
    }
  }
});

test('History Hide/Show keeps the balance label, cents, currency, and toggle', () => {
  for (const balance of [1234.56, 0, undefined]) {
    let visible = true;
    for (let press = 0; press < 3; press++) {
      const node = expression('src/features/history/HistoryScreen.tsx', 'historySummaryHeader', {
        styles: {}, T: {}, t: (value: string) => value, balance, currency: 'EUR',
        historySummaryDetailsVisible: visible,
        toggleHistorySummaryDetails: () => { visible = !visible; },
      });
      assert.equal(text(node), `Account SummaryBalance${balance === undefined ? '--' : fmt.decimal(balance)}EUR`);
      const toggle = button(node);
      assert.ok(toggle);
      assert.equal(toggle.props.accessibilityState.expanded, visible);
      toggle.props.onPress();
    }
  }
});

test('Trade header tap collapses only details and keeps live updates in pinned and scrolling layouts', () => {
  const path = 'src/features/trade/TradeScreen/SummaryHeader.tsx';
  for (const scrollSummary of [false, true]) {
    let visible = true;
    let bulkPresses = 0;
    const account = { floating: 35.42, currency: 'USD', balance: 1000, equity: 1035.42,
      margin: 10, freeMargin: 1025.42, marginLevel: 10354.2, credit: 0 };
    const scope = {
      React: { ...React, useContext: () => account },
      TradeAccountSummaryContext: {},
      useCallback: (callback: unknown) => callback,
      useMemo: (compute: () => unknown) => compute(),
      useUserPreferences: (select: (state: any) => unknown) => select({
        tradeSummaryDetailsVisible: visible,
        setTradeSummaryDetailsVisible: (value: boolean) => { visible = value; },
      }),
      formatMarginLevel: (value: number) => `${value}%`,
      LiveUnrealizedPnLHeader: expression(path, 'LiveUnrealizedPnLHeader', {}),
    };
    const floatingHeader = expression(path, 'TradeFloatingSummaryHeader', scope);
    const detailsHeader = expression(path, 'TradeSummaryDetailsHeader', {
      ...scope,
      TradeFloatingSummaryHeader: floatingHeader,
      SummaryMetricRow: ({ label, currency, value }: any) => React.createElement('Text', {}, label, currency, value),
    });
    const props = { positions: [{ symbol: 'XAUUSD', swap: 0 }], s: {}, T: {},
      isDark: true, totalVolume: 0.01, scrollSummary,
      onBulkPress: () => { bulkPresses++; } };
    const render = () => React.createElement('View', {},
      scrollSummary ? null : floatingHeader(props), detailsHeader(props));

    const expanded = render();
    assert.match(text(expanded), /Floating Profit\/Loss\+35\.42 USD/);
    assert.match(text(expanded), /BalanceUSD1,000\.00/);
    assert.match(text(expanded), /Equity/);
    const toggle = button(expanded);
    assert.ok(toggle);
    toggle.props.onPress();
    assert.equal(visible, false);

    // A new live account snapshot must update the collapsed headline.
    account.floating = -7.25;
    const collapsed = render();
    assert.match(text(collapsed), /Floating Profit\/Loss-7\.25 USD/);
    assert.doesNotMatch(text(collapsed), /Balance|Equity|Margin|Swap/);
    assert.match(text(collapsed), /Positions1 open/);
    assert.match(text(collapsed), /0\.01 lots/);
    const findBulk = (node: Element): Element | undefined => {
      if (node.props.latencyLabel === 'trade.bulk.open') return node;
      for (const child of node.children.flat()) {
        if (child && typeof child === 'object') {
          const found = findBulk(child);
          if (found) return found;
        }
      }
    };
    const bulk = findBulk(collapsed);
    assert.ok(bulk);
    bulk.props.onPress();
    assert.equal(bulkPresses, 1);

    const collapsedToggle = button(collapsed);
    assert.ok(collapsedToggle);
    assert.equal(collapsedToggle.props.accessibilityState.expanded, false);
    collapsedToggle.props.onPress();
    assert.equal(visible, true);
    const restored = render();
    assert.match(text(restored), /Floating Profit\/Loss-7\.25 USD/);
    assert.match(text(restored), /BalanceUSD1,000\.00/);
    assert.match(text(restored), /Equity/);
  }
});
