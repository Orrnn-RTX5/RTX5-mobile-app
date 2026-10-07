import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Chart Feature UI: IndicatorLevelScreen
 *
 * MT5-style horizontal-level editor — value, description, color, style, width.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { useIsDarkTheme } from '../../state/themeMode';
import { useTranslation } from '../../i18n/useTranslation';
import { useTheme } from '../../ui/theme/useTheme';
import { safeRouterBack } from '../../utils/navigation';
import { OVERLAY_MODAL_PROPS } from '../../ui/overlayModalProps';
import {
  Card,
  LinePreview,
  MT5_COLOR_PALETTE,
  Row,
  SectionHeader,
  Separator,
} from './components/IndicatorConfigPrimitives';
import { useIndicatorEditState } from './indicatorEditState';
import { LINE_STYLE_OPTIONS, LineStyle } from './indicatorRegistry';

const WIDTHS = [1, 2, 3, 4, 5];

export function IndicatorLevelScreen() {
  const { levelId } = useLocalSearchParams<{ levelId: string }>();
  const { t } = useTranslation();
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();

  const level = useIndicatorEditState((s) => s.levels.find((l) => l.id === levelId));
  const updateLevel = useIndicatorEditState((s) => s.updateLevel);
  const removeLevel = useIndicatorEditState((s) => s.removeLevel);

  const [edit, setEdit] = useState<{ field: 'value' | 'description'; value: string } | null>(null);

  const bgColor = T.bg;
  const styles = useMemo(() => makeStyles(bgColor, isDark, T.text), [bgColor, isDark, T.text]);

  if (!level || !levelId) {
    return (
      <Screen style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <Pressable
            onPress={() => safeRouterBack(router, '/chart/indicators')}
            activateOnPressIn
            hitSlop={16}
            style={styles.headerBackBtn}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle}>{t('Level')}</Text>
          </View>
          <View style={styles.headerBackBtn} />
        </View>
      </Screen>
    );
  }

  const commitEdit = () => {
    if (!edit) return;
    if (edit.field === 'value') {
      const parsed = Number(edit.value);
      if (Number.isFinite(parsed)) updateLevel(levelId, { value: parsed });
    } else {
      updateLevel(levelId, { description: edit.value });
    }
    setEdit(null);
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <Pressable
            onPress={() => safeRouterBack(router, '/chart/indicators')}
            activateOnPressIn
            hitSlop={16}
            style={styles.headerBackBtn}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle}>{t('Level')}</Text>
          </View>
          <Pressable
            onPress={() => {
              removeLevel(levelId);
              safeRouterBack(router, '/chart/indicators');
            }}
            hitSlop={16}
            style={styles.headerBackBtn}
          >
            <Ionicons name="trash-outline" size={22} color={T.trading.sell.primary} />
          </Pressable>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <SectionHeader title={t('Level')} isDark={isDark} />
          <Card isDark={isDark}>
            <Row
              label={t('Value')}
              rightText={String(level.value)}
              onPress={() => setEdit({ field: 'value', value: String(level.value) })}
              T={T}
              isDark={isDark}
            />
            <Separator isDark={isDark} />
            <Row
              label={t('Description')}
              rightText={level.description || '—'}
              onPress={() => setEdit({ field: 'description', value: level.description })}
              T={T}
              isDark={isDark}
            />
          </Card>

          <SectionHeader title={t('Preview')} isDark={isDark} />
          <Card isDark={isDark}>
            <View style={styles.previewRow}>
              <LinePreview
                color={level.color}
                style={level.style}
                width={level.width}
                previewWidth={180}
              />
            </View>
          </Card>

          <SectionHeader title={t('Color')} isDark={isDark} />
          <Card isDark={isDark}>
            <View style={styles.colorGrid}>
              {MT5_COLOR_PALETTE.map((c) => {
                const selected = c.toLowerCase() === level.color.toLowerCase();
                return (
                  <Pressable
                    key={c}
                    onPress={() => updateLevel(levelId, { color: c })}
                    style={[
                      styles.colorCell,
                      { backgroundColor: c },
                      selected && styles.colorCellSelected,
                    ]}
                  >
                    {selected && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={isLight(c) ? '#000' : '#FFF'}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <SectionHeader title={t('Style')} isDark={isDark} />
          <Card isDark={isDark}>
            {LINE_STYLE_OPTIONS.map((opt, idx) => (
              <View key={opt.value}>
                <Row
                  label={t(opt.label)}
                  rightNode={
                    <>
                      <LinePreview color={level.color} style={opt.value as LineStyle} width={level.width} />
                      {level.style === opt.value && (
                        <Ionicons name="checkmark" size={18} color={T.trading.buy.primary} />
                      )}
                    </>
                  }
                  onPress={() => updateLevel(levelId, { style: opt.value as LineStyle })}
                  T={T}
                  isDark={isDark}
                  showChevron={false}
                />
                {idx < LINE_STYLE_OPTIONS.length - 1 && <Separator isDark={isDark} />}
              </View>
            ))}
          </Card>

          <SectionHeader title={t('Width')} isDark={isDark} />
          <Card isDark={isDark}>
            {WIDTHS.map((w, idx) => (
              <View key={w}>
                <Row
                  label={`${w} pt`}
                  rightNode={
                    <>
                      <LinePreview color={level.color} style={level.style} width={w} />
                      {level.width === w && (
                        <Ionicons name="checkmark" size={18} color={T.trading.buy.primary} />
                      )}
                    </>
                  }
                  onPress={() => updateLevel(levelId, { width: w })}
                  T={T}
                  isDark={isDark}
                  showChevron={false}
                />
                {idx < WIDTHS.length - 1 && <Separator isDark={isDark} />}
              </View>
            ))}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={edit !== null}
        transparent
        animationType="fade"
        {...OVERLAY_MODAL_PROPS}
        onRequestClose={() => setEdit(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEdit(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {edit?.field === 'value' ? t('Value') : t('Description')}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={edit?.value ?? ''}
              onChangeText={(text) =>
                setEdit((prev) => (prev ? { ...prev, value: text } : prev))
              }
              keyboardType={edit?.field === 'value' ? 'numbers-and-punctuation' : 'default'}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={commitEdit}
              returnKeyType="done"
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setEdit(null)}>
                <Text style={styles.modalBtnText}>{t('Cancel')}</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={commitEdit}>
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>{t('OK')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function isLight(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 186;
}

function makeStyles(bgColor: string, isDark: boolean, textColor: string) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: bgColor,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E3E8F0',
      backgroundColor: bgColor,
    },
    headerBackBtn: {
      width: 40,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: textColor,
      fontSize: 17,
      fontWeight: '500',
    },
    previewRow: {
      alignItems: 'center',
      paddingVertical: 18,
    },
    colorGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 12,
    },
    colorCell: {
      width: 40,
      height: 40,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorCellSelected: {
      borderWidth: 2,
      borderColor: '#3B82F6',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderRadius: 14,
      padding: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#EEF2F7',
    },
    modalTitle: {
      color: textColor,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 14,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E3E8F0',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: textColor,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 16,
    },
    modalBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    modalBtnPrimary: {
      backgroundColor: '#3B82F6',
    },
    modalBtnText: {
      color: textColor,
      fontSize: 14,
      fontWeight: '600',
    },
    modalBtnTextPrimary: {
      color: '#FFFFFF',
    },
  });
}
