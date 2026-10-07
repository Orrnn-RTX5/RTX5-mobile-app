import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const sourceBetween = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
};

test('broker detail uses native iOS focus insets while preserving Android resize scrolling', () => {
  const source = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const appConfig = JSON.parse(readSource('app.json'));
  const manualScrollSource = sourceBetween(
    source,
    'const scrollLoginActionsAboveKeyboard',
    'const handleLoginInputFocus',
  );
  const focusSource = sourceBetween(
    source,
    'const handleLoginInputFocus',
    'const handleLoginInputBlur',
  );
  const layoutSource = sourceBetween(
    source,
    'const handleLoginScrollLayout',
    'useEffect(() => {',
  );
  const keyboardEffectStart = source.indexOf('useEffect(() => {', source.indexOf('const handleLoginScrollLayout'));
  assert.notEqual(keyboardEffectStart, -1, 'Missing keyboard subscription effect');
  const keyboardEffectEnd = source.indexOf('useEffect(() => {', keyboardEffectStart + 1);
  assert.notEqual(keyboardEffectEnd, -1, 'Missing effect after keyboard subscription');
  const keyboardEffectSource = source.slice(keyboardEffectStart, keyboardEffectEnd);

  assert.match(source, /const scrollRef = useRef<ScrollView>\(null\)/);
  assert.match(source, /const passwordInputRef = useRef<TextInput>\(null\)/);
  assert.match(source, /const loginInputFocusedRef = useRef\(false\)/);
  assert.match(manualScrollSource, /useCallback\(\(delayMs = 220\)/);
  assert.match(manualScrollSource, /if \(Platform\.OS === 'ios'\) \{\s*return;\s*\}/);
  assert.match(manualScrollSource, /scrollRef\.current\?\.scrollToEnd\(\{ animated: true \}\)/);
  assert.match(focusSource, /loginInputFocusedRef\.current = true;\s*scrollLoginActionsAboveKeyboard\(\);/);
  assert.match(layoutSource, /loginInputFocusedRef\.current[\s\S]*scrollLoginActionsAboveKeyboard\(0\);/);
  assert.doesNotMatch(source, /loginPanelYRef|loginPanelYRef\.current/);
  assert.match(keyboardEffectSource, /if \(Platform\.OS === 'ios'\) \{\s*return undefined;\s*\}/);
  assert.match(keyboardEffectSource, /Keyboard\.addListener\(\s*'keyboardDidShow'/);
  assert.match(
    keyboardEffectSource,
    /loginInputFocusedRef\.current[\s\S]*scrollLoginActionsAboveKeyboard\(40\);/,
  );
  assert.match(source, /enabled=\{Platform\.OS !== 'ios'\}/);
  assert.match(source, /behavior=\{Platform\.OS === 'ios' \? undefined : 'height'\}/);
  assert.doesNotMatch(source, /behavior=\{Platform\.OS === 'ios' \? 'padding'/);
  assert.match(source, /keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
  assert.match(source, /automaticallyAdjustKeyboardInsets=\{Platform\.OS === 'ios'\}/);
  assert.match(source, /ref=\{scrollRef\}[\s\S]*style=\{styles\.scrollViewport\}[\s\S]*onLayout=\{handleLoginScrollLayout\}/);
  assert.match(source, /scrollViewport: \{ flex: 1 \}/);
  assert.match(source, /scrollContent: \{[\s\S]*flexGrow: 1,[\s\S]*paddingBottom: 48/);
  assert.match(source, /onFocus=\{handleLoginInputFocus\}/);
  assert.match(source, /onBlur=\{handleLoginInputBlur\}/);
  assert.match(source, /onSubmitEditing=\{\(\) => passwordInputRef\.current\?\.focus\(\)\}/);
  assert.match(source, /ref=\{passwordInputRef\}/);
  assert.match(source, /onSubmitEditing=\{submitLogin\}/);
  assert.equal(appConfig.expo.android.softwareKeyboardLayoutMode, 'resize');
});
