import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('objects screen opens price alerts prefilled from price-level drawings', () => {
  const objectsSource = readSource('src/features/chart/ObjectsScreen/ObjectsScreen.tsx');
  const actionsSource = readSource('src/features/chart/ObjectsScreen/drawingObjectActions.ts');
  const priceAlertsSource = readSource('src/features/chart/PriceAlertsScreen/PriceAlertsScreen.tsx');

  assert.match(actionsSource, /PRICE_ALERT_DRAWING_KINDS[\s\S]*'horizontalLine'[\s\S]*'horizontalRay'[\s\S]*'textLevel'/);
  assert.match(actionsSource, /export function getDrawingObjectPriceAlertDraft/);
  assert.match(objectsSource, /getDrawingObjectPriceAlertDraft\(selectedDrawingRecord, chartSymbol\)/);
  assert.match(objectsSource, /label:\s*t\('Create price alert'\)/);
  assert.match(objectsSource, /pathname:\s*'\/chart\/alerts'/);
  assert.match(objectsSource, /price:\s*selectedDrawingPriceAlertDraft\.price/);
  assert.match(objectsSource, /symbol:\s*selectedDrawingPriceAlertDraft\.symbol/);
  assert.match(priceAlertsSource, /useLocalSearchParams<PriceAlertRouteParams>/);
  assert.match(priceAlertsSource, /const routePrefillPrice = useMemo\(\(\) => normalizeRoutePrice\(routeParams\.price\)/);
  assert.match(priceAlertsSource, /const \[price, setPrice\] = useState\(routePrefillPrice\)/);
  assert.match(priceAlertsSource, /const \[message, setMessage\] = useState\(routePrefillMessage\)/);
});
