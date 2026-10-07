import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const settings = readFileSync(
  resolve(process.cwd(), 'src/features/settings/SettingsScreen/SettingsScreen.tsx'),
  'utf8',
);
const toggle = readFileSync(
  resolve(process.cwd(), 'src/ui/components/AnimatedSlideToggle.tsx'),
  'utf8',
);

test('theme rows use the animated slide toggle instead of the platform Switch', () => {
  assert.match(
    settings,
    /import \{ AnimatedSlideToggle \} from '\.\.\/\.\.\/\.\.\/ui\/components\/AnimatedSlideToggle';/,
  );
  assert.equal(
    settings.match(/<AnimatedSlideToggle/g)?.length,
    2,
    'both Theme rows (search result and Preferences) must use the animated toggle',
  );
  // The platform Switch survives only for the One-Click preference, whose
  // wiring the one-click confirmation contract pins.
  assert.equal(settings.match(/<Switch/g)?.length, 1);
  assert.match(settings, /onValueChange=\{handleOneClickPreferenceChange\}/);
  // The dark off-track used to equal the card background, which made the
  // control read as a bare floating knob.
  assert.match(
    settings,
    /const settingsSwitchOffTrack = themeMode === 'dark' \? 'rgba\(255, 255, 255, 0\.18\)' : T\.borderMedium;/,
  );
});

test('theme rows keep release-press activation per the theme-paint latency contract', () => {
  // appActionLatencyContract pins that the Settings theme toggle must NOT fire
  // on the touch frame: the theme flip paints drawer chrome and retained
  // scenes, and competing with the touch frame is what made toggles feel late.
  // Perceived speed comes from the native-driver thumb slide instead.
  assert.doesNotMatch(settings, /activateOnPressIn=\{isThemeItem\}/);
  assert.doesNotMatch(settings, /title=\{t\('Theme'\)\}[\s\S]*onPress=\{toggleThemeMode\}[\s\S]*activateOnPressIn/);
  assert.match(settings, /onPress=\{toggleThemeMode\}/);
});

test('the slide toggle animates the thumb on the native driver with instant colours', () => {
  // A JS-driven colour tween janked while the app re-themed on the JS thread,
  // which read as a late toggle. Only translateX is animated, natively.
  assert.match(
    toggle,
    /Animated\.timing\(slide, \{[\s\S]*duration: TOGGLE_DURATION_MS,[\s\S]*easing: Easing\.out\(Easing\.cubic\),[\s\S]*useNativeDriver: true,/,
  );
  assert.match(
    toggle,
    /const thumbTranslate = slide\.interpolate\(\{[\s\S]*outputRange: \[0, THUMB_TRAVEL\],/,
  );
  assert.match(toggle, /backgroundColor: value \? onTrackColor : offTrackColor,/);
  assert.match(toggle, /backgroundColor: value \? onThumbColor : offThumbColor,/);
  assert.match(toggle, /accessibilityRole="switch"/);
  assert.match(toggle, /accessibilityState=\{\{ checked: value \}\}/);
});
