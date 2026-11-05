import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  ABOUT_ACTIONS,
  ABOUT_CONTACT_CATEGORIES,
  ABOUT_EXTERNAL_LINKS,
  buildDeveloperMailto,
  formatAboutPlatform,
  getAboutStoreTarget,
  isValidDeveloperContactEmail,
  resolveAboutBuildLabel,
} from './aboutViewModel';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('about actions match the reference screen order and labels', () => {
  assert.deepEqual(ABOUT_ACTIONS.map((action) => [action.id, action.title]), [
    ['rate-experience', 'Rate your experience'],
    ['user-guide', 'User guide'],
    ['privacy-policy', 'Privacy Policy'],
    ['account-deletion', 'Request Account Deletion'],
    ['contact-developer', 'Report a Bug'],
  ]);
  assert.equal(new Set(ABOUT_ACTIONS.map((action) => action.id)).size, ABOUT_ACTIONS.length);
});

test('about contact categories cover supportable app areas with deterministic ids', () => {
  const ids = ABOUT_CONTACT_CATEGORIES.map((category) => category.id);

  assert.deepEqual(ids, [
    'bug-report',
    'feature-request',
    'trading-account-problem',
    'account-deletion',
    'other',
  ]);
  assert.equal(new Set(ids).size, ids.length);
});

test('about store targets route android and ios to native store first with browser fallback', () => {
  const android = getAboutStoreTarget('android');
  const ios = getAboutStoreTarget('ios');
  const iosExact = getAboutStoreTarget('ios', {
    ...ABOUT_EXTERNAL_LINKS,
    iosAppStoreId: '1234567890',
  });

  assert.equal(android.storeLabel, 'Google Play');
  assert.equal(android.primaryUrl, `market://details?id=${ABOUT_EXTERNAL_LINKS.androidPackageName}`);
  assert.match(android.fallbackUrl, /play\.google\.com\/store\/apps\/details/);

  assert.equal(ios.storeLabel, 'App Store');
  assert.match(ios.primaryUrl, /^itms-apps:\/\/itunes\.apple\.com\/search/);
  assert.match(ios.fallbackUrl, /^https:\/\/apps\.apple\.com\/us\/search/);

  assert.equal(iosExact.primaryUrl, 'itms-apps://itunes.apple.com/app/id1234567890');
  assert.equal(iosExact.fallbackUrl, 'https://apps.apple.com/app/id1234567890');
});

test('about version label shows the OTA display version instead of native build numbers', () => {
  assert.equal(resolveAboutBuildLabel({ appVersion: '1.1.2' }), 'Version 1.1.2');
  assert.equal(resolveAboutBuildLabel({ appVersion: '1.1.9', appBuildVersion: '29' }), 'Version 1.1.9');
  assert.equal(resolveAboutBuildLabel({ appVersion: '1.1' }), 'Version 1.1');
  assert.equal(resolveAboutBuildLabel({ appVersion: '' }), 'Version Local');
});

test('about developer mailto includes selected category and device context', () => {
  const category = ABOUT_CONTACT_CATEGORIES.find((item) => item.id === 'bug-report');
  assert.ok(category);

  const mailto = buildDeveloperMailto({
    appName: 'RTX5',
    appVersion: '2.4.1',
    platform: 'Android',
    category,
    requesterName: 'Alex',
    requesterEmail: 'alex@example.com',
    title: 'Chart issue',
    message: 'Chart freezes after symbol change.',
  });
  const decoded = decodeURIComponent(mailto);

  assert.match(mailto, /^mailto:support@rtx5\.app\?/);
  assert.match(decoded, /subject=Chart issue/);
  assert.match(decoded, /App: RTX5/);
  assert.match(decoded, /Version: 2.4.1/);
  assert.match(decoded, /Platform: Android/);
  assert.match(decoded, /Category: Bug Report/);
  assert.match(decoded, /Name: Alex/);
  assert.match(decoded, /Email: alex@example.com/);
  assert.match(decoded, /Chart freezes after symbol change\./);
});

test('about developer contact email validation accepts only valid email addresses', () => {
  assert.equal(isValidDeveloperContactEmail('alex@example.com'), true);
  assert.equal(isValidDeveloperContactEmail(' alex.support+rtx5@example.co.uk '), true);
  assert.equal(isValidDeveloperContactEmail('alex'), false);
  assert.equal(isValidDeveloperContactEmail('alex@example'), false);
  assert.equal(isValidDeveloperContactEmail('alex@'), false);
  assert.equal(isValidDeveloperContactEmail('@example.com'), false);
  assert.equal(isValidDeveloperContactEmail('alex example@example.com'), false);
});

test('about account deletion request is available as an in-app contact category', () => {
  const category = ABOUT_CONTACT_CATEGORIES.find((item) => item.id === 'account-deletion');
  assert.ok(category);
  assert.equal(category.label, 'Account Deletion');

  const screenSource = readSource('src/features/settings/AboutScreen.tsx');
  const accountDeletionRouteSource = readSource('app/settings/account-deletion.tsx');
  const contactDeveloperRouteSource = readSource('app/settings/contact-developer.tsx');
  const layoutSource = readSource('app/_layout.tsx');

  assert.match(screenSource, /case 'account-deletion':/);
  assert.match(screenSource, /showAboutDetailDestination\('account-deletion'\)/);
  assert.match(screenSource, /case 'contact-developer':/);
  assert.match(screenSource, /showAboutDetailDestination\('contact-developer'\)/);
  assert.match(screenSource, /showSidebarDestination\('user-guide'/);
  assert.match(screenSource, /showAboutDetailDestination\('privacy-policy'\)/);
  assert.match(accountDeletionRouteSource, /<DeveloperContactRequestScreen mode="account-deletion" \/>/);
  assert.match(contactDeveloperRouteSource, /<DeveloperContactRequestScreen mode="contact-developer" \/>/);
  assert.match(layoutSource, /<Stack\.Screen name='settings\/account-deletion'/);
  assert.match(layoutSource, /<Stack\.Screen name='settings\/contact-developer'/);
  assert.match(layoutSource, /AboutDetailDestinationHost/);
  assert.match(screenSource, /setContactTitle\(\(current\) => \(current\.trim\(\)\.length > 0 \? current : 'Account deletion request'\)\)/);
  assert.match(screenSource, /buildAccountDeletionRequestMessage\(\{/);
  assert.match(screenSource, /categoryLocked=\{isAccountDeletion\}/);
  assert.match(screenSource, /getConfiguredPrivacyPolicyUrl\(\)/);
});

test('about platform labels are presentation safe', () => {
  assert.equal(formatAboutPlatform('ios'), 'iOS');
  assert.equal(formatAboutPlatform('android'), 'Android');
  assert.equal(formatAboutPlatform('web'), 'Web preview');
  assert.equal(formatAboutPlatform('native'), 'NATIVE');
});

test('about screen follows the active app theme and owns its drawer', () => {
  const screenSource = readSource('src/features/settings/AboutScreen.tsx');
  const stylesSource = readSource('src/features/settings/AboutScreen.styles.ts');

  assert.match(screenSource, /const isDark = useIsDarkTheme\(\)/);
  assert.match(screenSource, /makeAboutStyles\(isDark\)/);
  assert.doesNotMatch(screenSource, /<SidebarDrawer \/>/);
  assert.match(screenSource, /latencyLabel="about\.menu"/);
  assert.match(screenSource, /const handleOpenMenu = useCallback\(\(\) => \{[\s\S]*openSidebarDrawerImmediately\(\);[\s\S]*scheduleAfterSidebarOpenVisual\(hideActionSheet\);/);
  assert.match(screenSource, /onPress=\{handleOpenMenu\}/);
  assert.doesNotMatch(screenSource, /onPressIn=\{\(\) => setSidebarOpen\(true\)\}/);
  assert.doesNotMatch(screenSource, /ABOUT_BOTTOM_TABS|about\.bottomNav|styles\.bottomNav/);
  assert.doesNotMatch(stylesSource, /bottomNav|bottomTab|bottomIconWrap|bottomLabel/);
  assert.match(stylesSource, /export const makeAboutStyles = \(isDark = false\)/);
  assert.match(stylesSource, /import \{ GDark, GLight \} from '\.\.\/\.\.\/ui\/theme\/glass'/);
  assert.match(stylesSource, /screen: isDark \? GDark\.bg : GLight\.bg/);
  assert.match(stylesSource, /surface: isDark \? GDark\.glass2 : '#FFFFFF'/);
  assert.match(stylesSource, /text: isDark \? GDark\.text : '#050505'/);
  assert.match(stylesSource, /border: isDark \? GDark\.border : '#E4E7EC'/);
  assert.match(screenSource, /const menuIconColor = isDark \? GDark\.text : '#050505'/);
});

test('about contact details input remains usable above the android keyboard', () => {
  const screenSource = readSource('src/features/settings/AboutScreen.tsx');
  const stylesSource = readSource('src/features/settings/AboutScreen.styles.ts');

  assert.match(screenSource, /<KeyboardAvoidingView[\s\S]*style=\{styles\.contactKeyboardAvoider\}[\s\S]*behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
  assert.match(screenSource, /const contactScrollRef = useRef<ScrollView>\(null\)/);
  assert.match(screenSource, /const contactScrollViewportRef = useRef<View>\(null\)/);
  assert.match(screenSource, /const detailsFieldRef = useRef<View>\(null\)/);
  assert.match(screenSource, /Keyboard\.addListener\('keyboardDidShow', handleKeyboardShow\)/);
  assert.match(screenSource, /Keyboard\.addListener\('keyboardDidHide', handleKeyboardHide\)/);
  assert.match(screenSource, /measureInWindow[\s\S]*Math\.min\(scrollViewportBottom, keyboardTop\)/);
  assert.match(screenSource, /scrollTo\(\{ y: Math\.max\(0, contactScrollYRef\.current \+ overlap\), animated \}\)/);
  assert.match(screenSource, /contentContainerStyle=\{\[[\s\S]*styles\.contactFormContent,[\s\S]*keyboardInset > 0[\s\S]*paddingBottom: CONTACT_FORM_BASE_BOTTOM_PADDING \+ keyboardInset \+ Math\.max\(insetsBottom, 0\)/);
  assert.match(screenSource, /<View ref=\{contactScrollViewportRef\} style=\{styles\.contactPageBody\}>[\s\S]*<ScrollView[\s\S]*ref=\{contactScrollRef\}[\s\S]*keyboardShouldPersistTaps="always"[\s\S]*onLayout=\{handleContactScrollLayout\}[\s\S]*onScroll=\{handleContactScroll\}/);
  assert.match(screenSource, /<View ref=\{detailsFieldRef\} style=\{styles\.formField\} onLayout=\{handleDetailsLayout\}>[\s\S]*<TextInput[\s\S]*style=\{styles\.problemInput\}[\s\S]*multiline[\s\S]*scrollEnabled[\s\S]*blurOnSubmit=\{false\}[\s\S]*onFocus=\{handleDetailsFocus\}[\s\S]*onBlur=\{handleDetailsBlur\}/);
  assert.match(stylesSource, /contactKeyboardAvoider: \{\s*flex: 1,/);
  assert.match(stylesSource, /problemInput: \{[\s\S]*height: 136,/);
});

test('about contact developer requires a valid email before sending', () => {
  const screenSource = readSource('src/features/settings/AboutScreen.tsx');
  const stylesSource = readSource('src/features/settings/AboutScreen.styles.ts');

  assert.match(screenSource, /if \(!isValidDeveloperContactEmail\(contactEmail\)\) \{[\s\S]*Please enter a valid email address before sending\./);
  assert.match(screenSource, /const isEmailValid = isValidDeveloperContactEmail\(email\)/);
  assert.match(screenSource, /const emailError =[\s\S]*Enter a valid email address\./);
  assert.match(screenSource, /const canSend =[\s\S]*isEmailValid[\s\S]*selectedCategory !== null/);
  assert.match(screenSource, /label="Your Email"[\s\S]*keyboardType="email-address"[\s\S]*error=\{emailError\}/);
  assert.match(screenSource, /styles\.textFieldCard,\s*hasError && styles\.textFieldCardError/);
  assert.match(screenSource, /autoCorrect=\{keyboardType === 'email-address' \? false : undefined\}/);
  assert.match(stylesSource, /textFieldCardError: \{[\s\S]*borderColor: '#EF4444'/);
  assert.match(stylesSource, /formFieldError: \{[\s\S]*color: '#DC2626'/);
});

test('about action rows open via retained hosts on the immediate press path', () => {
  const screenSource = readSource('src/features/settings/AboutScreen.tsx');
  const hostSource = readSource('src/features/settings/AboutDetailDestinationHost.tsx');
  const controllerSource = readSource('src/features/settings/aboutDetailDestinationController.ts');
  const rootSource = readSource('app/_layout.tsx');

  assert.match(
    screenSource,
    /const handleAboutAction = useCallback\(\(action: AboutAction\) => \{[\s\S]*runImmediateAction\(`about\.\$\{action\.id\}\.open`/,
  );
  assert.match(
    screenSource,
    /activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*unstable_pressDelay=\{0\}[\s\S]*latencyLabel=\{`about\.\$\{action\.id\}`\}/,
  );
  assert.match(hostSource, /AboutDetailDestinationHost/);
  assert.match(hostSource, /privacy-policy|account-deletion|contact-developer/);
  assert.match(hostSource, /setNativeProps/);
  assert.match(controllerSource, /export function showAboutDetailDestination/);
  assert.match(controllerSource, /visualApplier\?\.\(destination\)/);
  assert.match(rootSource, /import \{ AboutDetailDestinationHost \} from/);
  assert.match(
    rootSource,
    /<SidebarDestinationHost \/>[\s\S]*<AboutDetailDestinationHost \/>/,
  );
});
