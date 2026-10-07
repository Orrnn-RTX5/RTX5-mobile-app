import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  HELP_CATEGORY_FILTERS,
  HELP_FAQ_ITEMS,
  HELP_HEADER,
  HELP_SUPPORT_EMAIL,
  buildHelpMailto,
  buildHelpSummary,
  filterHelpFaqItems,
  getHelpCategoryCounts,
  selectHelpFaqItems,
} from './helpViewModel';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('help content is a focused FAQ surface', () => {
  assert.equal(HELP_SUPPORT_EMAIL, 'support@orrnn.com');
  assert.equal(HELP_HEADER.title, 'FAQ');
  assert.equal(HELP_HEADER.label, 'Help Center');
  assert.deepEqual(HELP_CATEGORY_FILTERS, ['All', 'Account', 'Trading', 'Charts', 'Safety']);
  assert.ok(HELP_FAQ_ITEMS.length >= 8);
  assert.ok(HELP_FAQ_ITEMS.every((item) => item.question.length > 0));
  assert.ok(HELP_FAQ_ITEMS.every((item) => item.answer.length > 0));
  const faqCategories = HELP_CATEGORY_FILTERS.filter((category) => category !== 'All');
  assert.ok(HELP_FAQ_ITEMS.every((item) => faqCategories.includes(item.category)));

  const tradingFaqs = filterHelpFaqItems(undefined, 'Trading');
  assert.ok(tradingFaqs.length > 0);
  assert.ok(tradingFaqs.every((item) => item.category === 'Trading'));

  const categoryCounts = getHelpCategoryCounts();
  assert.equal(categoryCounts.All, HELP_FAQ_ITEMS.length);
  assert.equal(categoryCounts.Trading, tradingFaqs.length);

  const searchedFaqs = selectHelpFaqItems({ category: 'All', query: 'one-click' });
  assert.deepEqual(searchedFaqs.map((item) => item.id), ['one-click']);

  const categorySearch = selectHelpFaqItems({ category: 'Safety', query: 'password' });
  assert.deepEqual(categorySearch.map((item) => item.id), ['private-details']);

  const summary = buildHelpSummary();
  assert.equal(summary.faqCount, HELP_FAQ_ITEMS.length);
  assert.equal(summary.categoryCount, HELP_CATEGORY_FILTERS.length - 1);
});

test('support email mailto helper keeps app context for the settings support row', () => {
  const mailto = buildHelpMailto({
    appName: 'RTX5',
    appVersion: '1.0.0',
    platform: 'ios',
  });
  const decoded = decodeURIComponent(mailto);

  assert.match(mailto, /^mailto:support@orrnn\.com\?/);
  assert.match(decoded, /subject=RTX5 help request/);
  assert.match(decoded, /App: RTX5/);
  assert.match(decoded, /Version: 1.0.0/);
  assert.match(decoded, /Platform: ios/);
  assert.match(decoded, /Account login:/);
  assert.match(decoded, /Broker server:/);
});

test('help screen and route are wired as a real settings destination', () => {
  const screenSource = readSource('src/features/settings/HelpScreen.tsx');
  const routeSource = readSource('app/settings/help.tsx');
  const layoutSource = readSource('app/_layout.tsx');
  const legalLinksSource = readSource('src/config/legalLinks.ts');

  assert.match(legalLinksSource, /supportEmail: 'support@orrnn\.com'/);
  assert.match(legalLinksSource, /getConfiguredSupportEmail/);
  assert.match(routeSource, /import \{ HelpScreen \} from '\.\.\/\.\.\/src\/features\/settings\/HelpScreen'/);
  assert.match(routeSource, /return <HelpScreen \/>/);
  assert.doesNotMatch(routeSource, /DeferredRouteModule|SettingsRouteLaunchPreview|loadHelpScreenRoute/);
  assert.match(layoutSource, /<Stack\.Screen name='settings\/help'/);
  assert.match(screenSource, /HELP_CATEGORY_FILTERS/);
  assert.match(screenSource, /getHelpCategoryCounts/);
  assert.match(screenSource, /selectHelpFaqItems/);
  assert.match(screenSource, /placeholder=\{t\('Search FAQ'\)\}/);
  assert.match(screenSource, /latencyLabel="help\.search\.clear"/);
  assert.match(screenSource, /categoryCounts\[category\]/);
  assert.match(screenSource, /expandedFaqId/);
  assert.match(screenSource, /<HelpQuestionForm/);
  assert.match(screenSource, /latencyLabel="help\.question\.open"/);
  assert.match(screenSource, /latencyLabel=\{`help\.faq\.\$\{item\.id\}`\}/);
  assert.match(screenSource, /openSidebarDrawerImmediately\(\)/);
  assert.match(screenSource, /scheduleAfterSidebarOpenVisual\(hideActionSheet\)/);
  assert.match(screenSource, /latencyLabel="help\.menu"/);
  assert.match(screenSource, /<AppMenuIcon color=\{menuIconColor\}/);
  assert.match(screenSource, /accessibilityState=\{\{ expanded \}\}/);
  assert.doesNotMatch(screenSource, /<SidebarDrawer \/>/);
  assert.doesNotMatch(screenSource, /latencyLabel="help\.back"/);
  assert.doesNotMatch(screenSource, /name="arrow-back"/);
  assert.doesNotMatch(screenSource, /safeRouterBack/);
  assert.doesNotMatch(screenSource, /getConfiguredSupportEmail\(\)/);
  assert.doesNotMatch(screenSource, /buildHelpMailto\(\{/);
  assert.doesNotMatch(screenSource, /Linking\.openURL/);
  assert.doesNotMatch(screenSource, /latencyLabel="help\.email"/);
  assert.doesNotMatch(screenSource, /FAQ & Documentation|FAQs & Documentation|Documentation/);
  assert.match(screenSource, /keyboardShouldPersistTaps="always"/);
  assert.match(screenSource, /canCancelContentTouches=\{Platform\.OS === 'ios'\}/);
});
