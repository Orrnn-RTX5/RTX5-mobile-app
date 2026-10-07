import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('trade row keeps an iOS responder fallback for swipe actions inside FlatList', () => {
  const rowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');
  const tradeSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');

  assert.match(rowSource, /import \{[^}]*PanResponder[^}]*\} from 'react-native'/);
  assert.match(rowSource, /\.enabled\(Platform\.OS !== 'ios'\)/);
  assert.match(rowSource, /const iosSwipePanResponder = useMemo\([\s\S]*PanResponder\.create\(\{/);
  assert.match(rowSource, /onMoveShouldSetPanResponderCapture: \(_event, gestureState\) => \{/);
  assert.match(rowSource, /horizontalDistance > verticalDistance \* TRADE_ROW_IOS_SWIPE_VERTICAL_RATIO/);
  assert.match(rowSource, /return isHorizontalSwipe && \(gestureState\.dx < 0 \|\| overlayIsVisible\)/);
  assert.match(rowSource, /onPanResponderTerminationRequest: \(\) => false/);
  assert.match(rowSource, /const iosSwipePanHandlers = Platform\.OS === 'ios' \? iosSwipePanResponder\.panHandlers : \{\}/);
  assert.match(rowSource, /<Animated\.View[\s\S]*\{\.\.\.iosSwipePanHandlers\}/);
  assert.match(tradeSource, /<FlatList[\s\S]*keyboardShouldPersistTaps="always"[\s\S]*canCancelContentTouches=\{Platform\.OS === 'ios'\}/);
});
