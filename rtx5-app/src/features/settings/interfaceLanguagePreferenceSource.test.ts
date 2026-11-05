import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/settings/InterfaceScreen.tsx'),
  'utf8',
);
const commitSource = readFileSync(
  resolve(process.cwd(), 'src/i18n/languageCommit.ts'),
  'utf8',
);

test('language preference paints the tick before the app-wide language commit', () => {
  assert.match(source, /const \[visualLanguage, setVisualLanguage\] = useState<LanguageCode>\(language\)/);
  assert.match(
    source,
    /const handleLanguagePress = useCallback\(\(nextLanguage: LanguageCode\) => \{[\s\S]*setVisualLanguage\(nextLanguage\)[\s\S]*scheduleLanguagePreferenceCommit/,
  );
  // Global preference must be deferred so dozens of useTranslation() surfaces
  // do not re-render on the same press frame as the checkmark.
  assert.match(source, /scheduleLanguagePreferenceCommit\(nextLanguage/);
  assert.match(commitSource, /export function scheduleLanguagePreferenceCommit/);
  assert.match(commitSource, /requestAnimationFrame/);
  assert.match(commitSource, /setTimeout\(runCommit, 0\)/);
  assert.match(source, /selected=\{item\.code === visualLanguage\}/);
  assert.match(source, /onPress=\{\(\) => onSelect\(code\)\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/);
  assert.match(source, /const LanguageRow = memo\(function LanguageRow/);
  // Local section title follows optimistic language without useTranslation churn.
  assert.match(source, /translate\('Select language', visualLanguage\)/);
});

test('language preference list mounts immediately without a deferred blank body', () => {
  assert.doesNotMatch(source, /useDeferredRouteContentReady|hostBodyReady/);
  assert.match(source, /SUPPORTED_LANGUAGES\.map\(/);
  assert.match(source, /<ScrollView[\s\S]*SUPPORTED_LANGUAGES\.map/);
  assert.doesNotMatch(source, /from 'react-native'[\s\S]*FlatList|FlatList[\s\S]*data=\{SUPPORTED_LANGUAGES\}/);
});
