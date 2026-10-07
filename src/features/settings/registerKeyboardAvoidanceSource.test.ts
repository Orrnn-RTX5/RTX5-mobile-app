import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('register demo form scrolls the focused lower fields above the keyboard', () => {
  const source = readSource('app/register.tsx');

  assert.match(source, /type RegisterFieldKey =/);
  assert.match(source, /const REGISTER_FIELD_SCROLL_OFFSET_Y = Platform\.OS === 'android' \? 232 : 176/);
  assert.match(source, /const REGISTER_FIELD_FOCUS_DELAY_MS = Platform\.OS === 'android' \? 260 : 80/);
  assert.match(source, /const REGISTER_KEYBOARD_BOTTOM_PADDING = Platform\.OS === 'android' \? 220 : 120/);
  assert.match(source, /const scrollViewRef = React\.useRef<React\.ElementRef<typeof ScrollView> \| null>\(null\)/);
  assert.match(source, /const fieldYPositionsRef = React\.useRef<Partial<Record<RegisterFieldKey, number>>>\(\{\}\)/);
  assert.match(source, /const fieldFocusTimerRef = React\.useRef<ReturnType<typeof setTimeout> \| null>\(null\)/);
  assert.match(source, /behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
  assert.match(source, /ref=\{scrollViewRef\}/);
  assert.match(source, /keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
  assert.match(source, /paddingBottom: REGISTER_KEYBOARD_BOTTOM_PADDING/);
  assert.match(source, /scrollViewRef\.current\?\.scrollTo\(\{\s*y: Math\.max\(0, fieldY - REGISTER_FIELD_SCROLL_OFFSET_Y\),\s*animated: true,\s*\}\)/);
  assert.match(source, /fieldFocusTimerRef\.current = setTimeout\(\(\) => \{\s*scrollFieldAboveKeyboard\(field\);\s*\}, REGISTER_FIELD_FOCUS_DELAY_MS\)/);

  for (const field of [
    'phone',
    'password',
    'initialBalance',
  ]) {
    assert.match(
      source,
      new RegExp(
        `<View style=\\{styles\\.inputRow\\} onLayout=\\{handleFieldLayout\\('${field}'\\)\\}>[\\s\\S]*onFocus=\\{\\(\\) => handleFieldFocus\\('${field}'\\)\\}`,
      ),
    );
  }

  assert.doesNotMatch(source, /investorPassword|handleOpenCountryPicker|handleOpenOriginBrokerPicker/);
});

test('register demo form keeps last name optional and formats phone with selected dial code', () => {
  const source = readSource('app/register.tsx');

  assert.match(source, /type DemoCountryCode = \(typeof DEMO_COUNTRY_OPTIONS\)\[number\]\['code'\]/);
  assert.match(source, /const \[phoneCountryCode, setPhoneCountryCode\] = useState<DemoCountryCode>\(DEFAULT_DEMO_COUNTRY\.code\)/);
  assert.match(source, /const formatDemoPhoneForSubmission = \(dialCode: string, phoneNumber: string\) => \{/);
  assert.match(source, /return trimmedPhone\.startsWith\('\+'\) \? trimmedPhone : `\$\{dialCode\}\$\{trimmedPhone\}`/);
  assert.match(source, /const submissionPhone = formatDemoPhoneForSubmission\(selectedPhoneCountry\.dialCode, trimmedPhone\)/);
  assert.match(source, /phone: submissionPhone/);
  assert.match(source, /placeholder=\{t\('Enter first name'\)\}/);
  assert.match(source, /placeholder=\{t\('Enter last name'\)\}/);
  assert.match(source, /placeholder=\{t\('Enter email address'\)\}/);
  assert.match(source, /placeholderTextColor=\{fieldPlaceholderColor\}/);
  assert.match(source, /last_name: trimmedLastName \|\| undefined/);
  assert.match(source, /\{t\('Last name'\)\} <Text style=\{styles\.inputOptionalLabel\}>\(\{t\('optional'\)\}\)<\/Text>/);
  assert.doesNotMatch(source, /!trimmedFirstName \|\| !trimmedLastName \|\| !trimmedEmail/);
  assert.match(source, /if \(!trimmedFirstName \|\| !trimmedEmail \|\| !password\)/);
  assert.match(source, /visible=\{phoneCountryPickerOpen\}/);
  assert.match(source, /actions=\{phoneCountryPickerActions\}/);
  assert.match(source, /searchPlaceholder=\{t\('Search country codes\.\.\.'\)\}/);
});

test('register demo form preflights the broker route and keeps contract metadata read-only', () => {
  const source = readSource('app/register.tsx');

  assert.match(source, /import \{ useBrokerServers \} from '\.\.\/src\/query\/broker'/);
  assert.match(source, /invalidateSessionQueryRoots/);
  assert.doesNotMatch(source, /BROKER_CONFIG_KEY/);
  assert.match(source, /useBrokerServers\(registerDataActive\)/);
  assert.match(source, /resolveOrrnnDemoBrokerAuthRoute\(ORRNN_DEMO_BROKER_ID, brokerServers\)/);
  assert.match(source, /refetchBrokerServers\(\)/);
  assert.match(source, /const trimmedOriginBroker = ORRNN_DEMO_ORIGIN_BROKER\.trim\(\)/);
  assert.match(source, /origin_broker: trimmedOriginBroker/);
  assert.doesNotMatch(source, /originBrokerPickerOpen|DEMO_ORIGIN_BROKER_OPTIONS/);
  assert.doesNotMatch(source, /DEMO_LEVERAGE_OPTIONS|handleOpenLeveragePicker|leveragePickerOpen/);

  assert.match(source, /const selectedCurrency = selectedDemoGroup\?\.currency \|\| 'USD'/);
  assert.match(source, /<Text style=\{styles\.selectValue\} numberOfLines=\{1\}>\{selectedCurrency\}<\/Text>/);
  assert.match(source, /const selectedLeverage = selectedDemoGroup\?\.leverage/);
  assert.doesNotMatch(source, /currencyPickerOpen/);
  assert.doesNotMatch(source, /currencyPickerActions/);
  assert.doesNotMatch(source, /handleOpenCurrencyPicker/);
});

test('register demo form and handoff preview use the same compact Demo Account heading without a card', () => {
  const source = readSource('app/register.tsx');
  const previewSource = readSource('src/features/settings/RegisterHandoffPreview.tsx');

  for (const headingSource of [source, previewSource]) {
    assert.match(headingSource, /<Text style=\{styles\.headerTitle\} numberOfLines=\{1\}>Demo Account<\/Text>/);
    assert.doesNotMatch(headingSource, /heroSection|stats-chart-outline|Open Demo Account/);
    assert.match(headingSource, /headerBackButton:\s*\{[\s\S]*?width: 40,[\s\S]*?height: 40,[\s\S]*?alignItems: 'center'/);
    assert.doesNotMatch(headingSource, /headerBackButton:\s*\{[^}]*?(?:backgroundColor|borderColor|borderRadius|borderWidth)/);
  }

  assert.match(source, /inputLabel:\s*\{[\s\S]*fontSize: 14,[\s\S]*fontWeight: '600'/);
  assert.match(source, /input:\s*\{[\s\S]*fontSize: 16,[\s\S]*fontWeight: '500'/);
  assert.match(source, /registerBtnText:\s*\{[\s\S]*fontSize: 16,[\s\S]*fontWeight: '600'/);
});

test('register demo searchable action sheets use Android resize keyboard avoidance', () => {
  const source = readSource('app/register.tsx');
  const actionSheets = [...source.matchAll(/<ActionSheet\b[\s\S]*?\/>/g)].map((match) => match[0]);
  const searchableSheets = actionSheets.filter((sheet) =>
    /searchable/.test(sheet),
  );

  assert.equal(searchableSheets.length, 2);

  for (const sheet of searchableSheets) {
    assert.match(sheet, /detent="large"/);
    assert.match(sheet, /runActionAfterClose=\{false\}/);
    assert.match(sheet, /androidKeyboardAvoidance="resize"/);
  }
});
