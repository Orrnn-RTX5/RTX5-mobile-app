import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  GUIDE_FOOTER_NOTE,
  GUIDE_MANUAL_INTRO,
  GUIDE_MANUAL_SECTIONS,
  buildGuideSummary,
} from './userGuideViewModel';

test('user guide intro is RTX5-specific and does not mention MetaTrader', () => {
  const intro = `${GUIDE_MANUAL_INTRO.title} ${GUIDE_MANUAL_INTRO.subtitle} ${GUIDE_MANUAL_INTRO.body}`;

  assert.match(intro, /RTX5 Mobile App/i);
  assert.doesNotMatch(intro, /MetaTrader/i);
});

test('user guide sections cover actual RTX5 mobile app surfaces in order', () => {
  assert.deepEqual(GUIDE_MANUAL_SECTIONS.map((section) => section.id), [
    'quotes',
    'charts',
    'trade',
    'history',
    'calendar-journal',
    'accounts',
    'settings',
    'safety',
  ]);
  assert.equal(new Set(GUIDE_MANUAL_SECTIONS.map((section) => section.id)).size, GUIDE_MANUAL_SECTIONS.length);
  assert.equal(GUIDE_MANUAL_SECTIONS.every((section) => section.bullets.length >= 3), true);
});

test('user guide summary derives manual section counts', () => {
  const summary = buildGuideSummary(GUIDE_MANUAL_SECTIONS);

  assert.equal(summary.sectionCount, 8);
  assert.equal(summary.bulletCount, 24);
  assert.equal(summary.localStateLabel, 'Device local');
});

test('user guide copy reinforces local persistence and release boundaries', () => {
  const copy = GUIDE_MANUAL_SECTIONS
    .flatMap((section) => [section.title, section.summary, ...section.bullets])
    .join(' ');

  assert.match(copy, /watchlist/i);
  assert.match(copy, /persist locally/i);
  assert.match(copy, /One-click trading/i);
  assert.match(copy, /EAS Update channels/i);
  assert.match(GUIDE_FOOTER_NOTE, /not trading advice/i);
});

test('user guide screen uses the simple about-flow mobile manual layout', () => {
  const screenSource = readFileSync(resolve(process.cwd(), 'src/features/settings/UserGuideScreen.tsx'), 'utf8');
  const styleSource = readFileSync(resolve(process.cwd(), 'src/features/settings/UserGuideScreen.styles.ts'), 'utf8');

  assert.match(screenSource, /GUIDE_MANUAL_SECTIONS/);
  assert.match(screenSource, /AppNameTitle/);
  assert.doesNotMatch(screenSource, /SettingsEnterpriseHeader/);
  assert.match(styleSource, /indexRail:/);
  assert.match(styleSource, /heroTitle:/);
  assert.match(screenSource, /useIsDarkTheme/);
  assert.match(screenSource, /const isDark = useIsDarkTheme\(\)/);
  assert.match(screenSource, /makeUserGuideStyles\(isDark\)/);
  assert.match(styleSource, /makeUserGuideStyles = \(isDark = false\)/);
  assert.match(styleSource, /screen: isDark \? '#121212' : '#F2F4F8'/);
});
