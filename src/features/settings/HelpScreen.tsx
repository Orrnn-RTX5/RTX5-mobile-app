/**
 * Settings Feature UI: HelpScreen
 *
 * Professional FAQ-only help surface for RTX5 settings.
 */

import { Ionicons } from '@expo/vector-icons';
import { AppMenuIcon } from '../../ui/components/AppMenuIcon';
import { useIsFocused } from '@react-navigation/native';
import { memo, useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUIState } from '../../state/uiState';
import { FastPressable } from '../../ui/components/FastPressable';
import { useRetainedRouteContentReady } from '../../ui/components/DeferredRouteMount';
import { Screen } from '../../ui/components/Screen';
import { openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual } from '../../ui/components/sidebarDrawerController';
import { useTheme } from '../../ui/theme/useTheme';
import { useNextFrameValue } from '../../hooks/useNextFrameValue';
import { useTranslation } from '../../i18n/useTranslation';
import { makeHelpStyles, type HelpStyles } from './HelpScreen.styles';
import { HelpQuestionForm } from './HelpQuestionForm';
import {
  HELP_CATEGORY_FILTERS,
  HELP_HEADER,
  getHelpCategoryCounts,
  selectHelpFaqItems,
  type HelpFaqCategory,
  type HelpFaqItem,
} from './helpViewModel';

// Mount Help's static FAQ body in the retained host before it is selected so
// the first sidebar reveal is complete.
const HELP_BODY_PREWARM_DELAY_MS = 0;

/**
 * Provides support resources, FAQs, and contact methods for users needing assistance.
 */
export const HelpScreenInner = memo(function HelpScreenInner({ isScreenFocused }: { isScreenFocused: boolean }) {
  const insets = useSafeAreaInsets();
  const isDark = useIsDarkTheme();
  const T = useTheme();
  const { t } = useTranslation();
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const styles = useMemo(() => makeHelpStyles(T, isDark), [T, isDark]);
  const [selectedCategory, setSelectedCategory] = useState<HelpFaqCategory>('All');
  const [faqQuery, setFaqQuery] = useState('');
  const [expandedFaqId, setExpandedFaqId] = useState<string>('connect-account');
  const [questionFormOpen, setQuestionFormOpen] = useState(false);
  const routeBodyReady = useRetainedRouteContentReady(
    isScreenFocused, HELP_BODY_PREWARM_DELAY_MS,
  );
  const categoryCounts = useMemo(() => getHelpCategoryCounts(), []);
  const visibleFaqItems = useMemo(
    () => selectHelpFaqItems({ category: selectedCategory, query: faqQuery }),
    [faqQuery, selectedCategory],
  );
  const normalizedQuery = faqQuery.trim();
  const menuIconColor = isDark ? T.text : '#050505';
  const accentColor = isDark ? T.accent : '#0A6EEB';

  /**
   * Opens the sidebar navigation drawer.
   */
  const handleOpenMenu = useCallback(() => {
    openSidebarDrawerImmediately();
    scheduleAfterSidebarOpenVisual(hideActionSheet);
  }, [hideActionSheet]);

  const updateVisibleSelection = useCallback((category: HelpFaqCategory, query: string) => {
    setExpandedFaqId(selectHelpFaqItems({ category, query })[0]?.id ?? '');
  }, []);

  /**
   * Filters the visible FAQ items based on the selected support category (e.g., Accounts, Trading, Security).
   */
  const handleSelectCategory = useCallback((category: HelpFaqCategory) => {
    setSelectedCategory(category);
    updateVisibleSelection(category, faqQuery);
  }, [faqQuery, updateVisibleSelection]);

  /**
   * Updates the search term state, actively filtering the FAQ list as the user types.
   */
  const handleChangeQuery = useCallback((query: string) => {
    setFaqQuery(query);
    updateVisibleSelection(selectedCategory, query);
  }, [selectedCategory, updateVisibleSelection]);

  /**
   * Clears the current search term, resetting the FAQ list to show all items.
   */
  const handleClearQuery = useCallback(() => {
    setFaqQuery('');
    updateVisibleSelection(selectedCategory, '');
  }, [selectedCategory, updateVisibleSelection]);

  return (
    <Screen noBottomInset style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 8 }]}>
        <FastPressable
          onPress={handleOpenMenu}
          activateOnTouchStart
          latencyLabel="help.menu"
          hitSlop={12}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <AppMenuIcon color={menuIconColor} />
        </FastPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{t('Help')}</Text>
      </View>

      {routeBodyReady ? <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryPanel}>
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryIcon}>
              <Ionicons name="help-buoy-outline" size={20} color={accentColor} />
            </View>
            <View style={styles.summaryTitleWrap}>
              <Text style={styles.summaryLabel}>{t(HELP_HEADER.label)}</Text>
              <Text style={styles.summaryTitle}>{t(HELP_HEADER.title)}</Text>
            </View>
          </View>
          <Text style={styles.summaryBody}>{t(HELP_HEADER.body)}</Text>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={accentColor} />
            <TextInput
              value={faqQuery}
              onChangeText={handleChangeQuery}
              placeholder={t('Search FAQ')}
              placeholderTextColor={isDark ? T.textMuted : '#98A2B3'}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {faqQuery ? (
              <FastPressable
                onPress={handleClearQuery}
                latencyLabel="help.search.clear"
                hitSlop={8}
                style={styles.searchClear}
                accessibilityRole="button"
                accessibilityLabel="Clear FAQ search"
              >
                <Ionicons name="close-circle" size={16} color={isDark ? T.textMuted : '#667085'} />
              </FastPressable>
            ) : null}
          </View>
        </View>

        <FastPressable
          style={styles.questionOption}
          onPress={() => setQuestionFormOpen(true)}
          latencyLabel="help.question.open"
          accessibilityRole="button"
          accessibilityLabel={t('Ask a question')}
        >
          <View style={styles.summaryIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={accentColor} />
          </View>
          <View style={styles.summaryTitleWrap}>
            <Text style={styles.questionOptionTitle}>{t('Ask a question')}</Text>
            <Text style={styles.questionOptionBody}>{t("Can't find an answer in the FAQ?")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={accentColor} />
        </FastPressable>

        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRail}
        >
          {HELP_CATEGORY_FILTERS.map((category) => {
            const selected = category === selectedCategory;
            return (
              <FastPressable
                key={category}
                style={[styles.filterChip, selected && styles.filterChipActive]}
                onPress={() => handleSelectCategory(category)}
                latencyLabel={`help.filter.${category}`}
                accessibilityRole="button"
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                  {t(category)}
                </Text>
                <Text style={[styles.filterChipCount, selected && styles.filterChipCountActive]}>
                  {categoryCounts[category]}
                </Text>
              </FastPressable>
            );
          })}
        </ScrollView>

        <View style={styles.listHeader}>
          <View style={styles.listHeaderCopy}>
            <Text style={styles.listEyebrow}>
              {selectedCategory === 'All' ? t('FAQ Library') : `${t(selectedCategory)} ${t('FAQ')}`}
            </Text>
            <Text style={styles.listTitle}>
              {normalizedQuery ? t('Search results') : t('Frequently asked questions')}
            </Text>
          </View>
          <View style={styles.resultPill}>
            <Text style={styles.resultPillText}>
              {visibleFaqItems.length}
            </Text>
          </View>
        </View>

        <View style={styles.faqList}>
          {visibleFaqItems.length > 0 ? visibleFaqItems.map((item) => (
            <FaqRow
              key={item.id}
              item={item}
              expanded={item.id === expandedFaqId}
              styles={styles}
              iconColor={accentColor}
              onToggle={() => setExpandedFaqId((current) => (current === item.id ? '' : item.id))}
            />
          )) : (
            <View style={styles.emptyPanel}>
              <View style={styles.emptyIcon}>
                <Ionicons name="search-outline" size={22} color={accentColor} />
              </View>
              <Text style={styles.emptyTitle}>{t('No FAQ found')}</Text>
              <Text style={styles.emptyBody}>{t('Change the keyword or topic filter.')}</Text>
            </View>
          )}
        </View>
      </ScrollView> : <View style={styles.scroll} />}

      <HelpQuestionForm
        visible={questionFormOpen && isScreenFocused}
        onClose={() => setQuestionFormOpen(false)}
      />

    </Screen>
  );
});

export function HelpScreen() {
  const isScreenFocused = useIsFocused();
  const deferredScreenFocused = useNextFrameValue(isScreenFocused);
  return <HelpScreenInner isScreenFocused={deferredScreenFocused} />;
}

/**
 * A collapsible UI component representing a single Frequently Asked Question and its detailed answer.
 */
function FaqRow({
  item,
  expanded,
  styles,
  iconColor,
  onToggle,
}: {
  item: HelpFaqItem;
  expanded: boolean;
  styles: HelpStyles;
  iconColor: string;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <FastPressable
      style={[styles.faqRow, expanded && styles.faqRowExpanded]}
      onPress={onToggle}
      latencyLabel={`help.faq.${item.id}`}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
    >
      <View style={styles.faqQuestionRow}>
        <View style={styles.faqIcon}>
          <Ionicons name={item.icon} size={18} color={iconColor} />
        </View>
        <View style={styles.faqQuestionContent}>
          <Text style={styles.faqCategory}>{t(item.category)}</Text>
          <Text style={styles.faqQuestion}>{item.question}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={iconColor} />
      </View>
      {expanded ? (
        <View style={styles.answerPanel}>
          <Text style={styles.answerText}>{item.answer}</Text>
        </View>
      ) : null}
    </FastPressable>
  );
}
