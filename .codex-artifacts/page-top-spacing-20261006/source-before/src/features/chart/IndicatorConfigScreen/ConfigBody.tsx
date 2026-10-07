import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Inner body of IndicatorConfigScreen — renders parameter rows, style lines,
 * levels, and visualization controls. Extracted from the screen wrapper so
 * the screen file stays under the 500-line ceiling.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import type { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet } from '../../../ui/components/ActionSheet';
import { Screen } from '../../../ui/components/Screen';
import { OVERLAY_MODAL_PROPS } from '../../../ui/overlayModalProps';
import {
  Card,
  LinePreview,
  Row,
  SectionHeader,
  Separator,
} from '../components/IndicatorConfigPrimitives';
import { useIndicatorEditState } from '../indicatorEditState';
import { runImmediateAction } from '../../../utils/actionLatency';
import {
  APPLY_TO_OPTIONS,
  getIndicatorMeta,
  IndicatorParam,
  MA_METHOD_OPTIONS,
} from '../indicatorRegistry';
import type { useTheme } from '../../../ui/theme/useTheme';
import type { IndicatorConfigStyles } from './styles';

export function ConfigBody({
  metaId,
  styles,
  isDark,
  insets,
  T,
  onDone,
}: {
  metaId: string;
  styles: IndicatorConfigStyles;
  isDark: boolean;
  insets: ReturnType<typeof useSafeAreaInsets>;
  T: ReturnType<typeof useTheme>;
  onDone: () => void;
}) {
  const meta = useIndicatorEditState((s) => s.meta);
  const values = useIndicatorEditState((s) => s.values);
  const styleLines = useIndicatorEditState((s) => s.styleLines);
  const levels = useIndicatorEditState((s) => s.levels);
  const viz = useIndicatorEditState((s) => s.visualization);
  const setValue = useIndicatorEditState((s) => s.setValue);
  const addLevel = useIndicatorEditState((s) => s.addLevel);
  const setVisualization = useIndicatorEditState((s) => s.setVisualization);

  const [numberEdit, setNumberEdit] = useState<{
    key: string;
    label: string;
    value: string;
    decimals?: number;
    target: 'param' | 'fixedMin' | 'fixedMax';
  } | null>(null);

  const [selectSheet, setSelectSheet] = useState<{
    title: string;
    options: Array<{ value: string; label: string }>;
    onPick: (v: string) => void;
  } | null>(null);

  const commitNumber = () => {
    if (!numberEdit) return;
    const parsed = Number(numberEdit.value);
    if (Number.isFinite(parsed)) {
      if (numberEdit.target === 'param') {
        setValue(numberEdit.key, parsed);
      } else if (numberEdit.target === 'fixedMin') {
        setVisualization({ fixedMin: parsed });
      } else if (numberEdit.target === 'fixedMax') {
        setVisualization({ fixedMax: parsed });
      }
    }
    setNumberEdit(null);
  };

  // Guard: before initialize fires, meta in store may be null. Fall back to registry meta.
  const fallbackMeta = !meta || meta.id !== metaId ? getIndicatorMeta(metaId) : meta;
  if (!fallbackMeta) return null;

  // Use store data when ready; otherwise render nothing to avoid flicker.
  const usingStore = meta && meta.id === metaId;
  const displayLines = usingStore ? styleLines : fallbackMeta.styles;
  const displayLevels = usingStore ? levels : [];
  const displayValues = usingStore ? values : (() => {
    const v: Record<string, number | string | boolean> = {};
    for (const p of fallbackMeta.parameters) v[p.key] = p.default;
    return v;
  })();

  const renderParamRow = (param: IndicatorParam) => {
    const current = displayValues[param.key];
    switch (param.kind) {
      case 'number': {
        const display =
          typeof current === 'number'
            ? param.decimals !== undefined
              ? current.toFixed(param.decimals)
              : String(current)
            : String(current);
        return (
          <Row
            label={param.label}
            rightText={display}
            onPress={() =>
              setNumberEdit({
                key: param.key,
                label: param.label,
                value: display,
                decimals: param.decimals,
                target: 'param',
              })
            }
            T={T}
            isDark={isDark}
          />
        );
      }
      case 'applyTo':
      case 'maMethod':
      case 'select': {
        const options =
          param.kind === 'applyTo'
            ? APPLY_TO_OPTIONS
            : param.kind === 'maMethod'
              ? MA_METHOD_OPTIONS
              : param.options;
        const currentOption = options.find((o) => o.value === current);
        return (
          <Row
            label={param.label}
            rightText={currentOption?.label ?? String(current)}
            onPress={() =>
              runImmediateAction('chart.indicatorConfig.selectSheet.open', () =>
                setSelectSheet({
                  title: param.label,
                  options,
                  onPick: (v) => setValue(param.key, v),
                }),
              )
            }
            T={T}
            isDark={isDark}
          />
        );
      }
      case 'boolean': {
        return (
          <View style={styles.rowWrap}>
            <Row
              label={param.label}
              rightNode={
                <Switch
                  value={!!current}
                  onValueChange={(v) => setValue(param.key, v)}
                  trackColor={{ false: isDark ? '#3F4B5C' : '#D1D5DB', true: T.trading.buy.primary }}
                  thumbColor="#FFFFFF"
                />
              }
              T={T}
              isDark={isDark}
              showChevron={false}
            />
          </View>
        );
      }
    }
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <Pressable
            onPress={() => { onDone(); }}
            activateOnPressIn
            hitSlop={16}
            style={styles.headerBackBtn}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1}>{fallbackMeta.name}</Text>
          </View>
          <Pressable onPress={onDone} hitSlop={16} style={styles.headerDoneBtn}>
            <Text style={styles.headerDoneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView
          canCancelContentTouches={Platform.OS === 'ios'}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          {fallbackMeta.parameters.length > 0 && (
            <>
              <SectionHeader title="Parameters" isDark={isDark} />
              <Card isDark={isDark}>
                {fallbackMeta.parameters.map((param, idx) => (
                  <View key={param.key}>
                    {renderParamRow(param)}
                    {idx < fallbackMeta.parameters.length - 1 && <Separator isDark={isDark} />}
                  </View>
                ))}
              </Card>
            </>
          )}

          <SectionHeader title="Style" isDark={isDark} />
          <Card isDark={isDark}>
            {displayLines.map((line, idx) => (
              <View key={line.key}>
                <Row
                  label={line.name}
                  rightNode={<LinePreview color={line.color} style={line.style} width={line.width} />}
                  onPress={() =>
                    router.push({
                      pathname: '/chart/indicator-line-style',
                      params: { lineKey: line.key },
                    })
                  }
                  T={T}
                  isDark={isDark}
                />
                {idx < displayLines.length - 1 && <Separator isDark={isDark} />}
              </View>
            ))}
          </Card>

          {fallbackMeta.levelsEnabled && (
            <>
              <SectionHeader title="Levels" isDark={isDark} />
              <Card isDark={isDark}>
                {displayLevels.map((lvl, idx) => (
                  <View key={lvl.id}>
                    <Row
                      label={String(lvl.value)}
                      rightNode={<LinePreview color={lvl.color} style={lvl.style} width={lvl.width} />}
                      onPress={() =>
                        router.push({
                          pathname: '/chart/indicator-level',
                          params: { levelId: lvl.id },
                        })
                      }
                      T={T}
                      isDark={isDark}
                    />
                    {idx < displayLevels.length - 1 && <Separator isDark={isDark} />}
                  </View>
                ))}
                {displayLevels.length > 0 && <Separator isDark={isDark} />}
                <Pressable
                  style={({ pressed }) => [
                    styles.addRow,
                    pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' },
                  ]}
                  onPress={() => {
                    const id = addLevel();
                    router.push({
                      pathname: '/chart/indicator-level',
                      params: { levelId: id },
                    });
                  }}
                >
                  <Ionicons name="add" size={20} color={T.trading.buy.primary} />
                  <Text style={[styles.addRowText, { color: T.trading.buy.primary }]}>Add level</Text>
                </Pressable>
              </Card>
            </>
          )}

          <SectionHeader title="Visualization" isDark={isDark} />
          <Card isDark={isDark}>
            <Row
              label="Show in data window"
              rightNode={
                <Switch
                  value={viz.showInDataWindow}
                  onValueChange={(v) => setVisualization({ showInDataWindow: v })}
                  trackColor={{ false: isDark ? '#3F4B5C' : '#D1D5DB', true: T.trading.buy.primary }}
                  thumbColor="#FFFFFF"
                />
              }
              T={T}
              isDark={isDark}
              showChevron={false}
            />
            <Separator isDark={isDark} />
            <Row
              label="All timeframes"
              rightNode={
                <Switch
                  value={viz.allTimeframes}
                  onValueChange={(v) => setVisualization({ allTimeframes: v })}
                  trackColor={{ false: isDark ? '#3F4B5C' : '#D1D5DB', true: T.trading.buy.primary }}
                  thumbColor="#FFFFFF"
                />
              }
              T={T}
              isDark={isDark}
              showChevron={false}
            />
            {fallbackMeta.levelsEnabled && (
              <>
                <Separator isDark={isDark} />
                <Row
                  label="Fixed minimum"
                  rightNode={
                    <Switch
                      value={viz.fixedMinEnabled}
                      onValueChange={(v) => setVisualization({ fixedMinEnabled: v })}
                      trackColor={{ false: isDark ? '#3F4B5C' : '#D1D5DB', true: T.trading.buy.primary }}
                      thumbColor="#FFFFFF"
                    />
                  }
                  T={T}
                  isDark={isDark}
                  showChevron={false}
                />
                {viz.fixedMinEnabled && (
                  <>
                    <Separator isDark={isDark} />
                    <Row
                      label="Minimum"
                      rightText={String(viz.fixedMin)}
                      onPress={() =>
                        setNumberEdit({
                          key: 'fixedMin',
                          label: 'Minimum',
                          value: String(viz.fixedMin),
                          target: 'fixedMin',
                        })
                      }
                      T={T}
                      isDark={isDark}
                    />
                  </>
                )}
                <Separator isDark={isDark} />
                <Row
                  label="Fixed maximum"
                  rightNode={
                    <Switch
                      value={viz.fixedMaxEnabled}
                      onValueChange={(v) => setVisualization({ fixedMaxEnabled: v })}
                      trackColor={{ false: isDark ? '#3F4B5C' : '#D1D5DB', true: T.trading.buy.primary }}
                      thumbColor="#FFFFFF"
                    />
                  }
                  T={T}
                  isDark={isDark}
                  showChevron={false}
                />
                {viz.fixedMaxEnabled && (
                  <>
                    <Separator isDark={isDark} />
                    <Row
                      label="Maximum"
                      rightText={String(viz.fixedMax)}
                      onPress={() =>
                        setNumberEdit({
                          key: 'fixedMax',
                          label: 'Maximum',
                          value: String(viz.fixedMax),
                          target: 'fixedMax',
                        })
                      }
                      T={T}
                      isDark={isDark}
                    />
                  </>
                )}
              </>
            )}
          </Card>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={numberEdit !== null}
        transparent
        animationType="fade"
        {...OVERLAY_MODAL_PROPS}
        onRequestClose={() => setNumberEdit(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setNumberEdit(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{numberEdit?.label}</Text>
            <TextInput
              style={styles.modalInput}
              value={numberEdit?.value ?? ''}
              onChangeText={(text) =>
                setNumberEdit((prev) => (prev ? { ...prev, value: text } : prev))
              }
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
              onSubmitEditing={commitNumber}
              returnKeyType="done"
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setNumberEdit(null)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={commitNumber}>
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>OK</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ActionSheet
        visible={selectSheet !== null}
        title={selectSheet?.title}
        onClose={() => setSelectSheet(null)}
        detent="adaptive"
        instantOpen
        actions={(selectSheet?.options ?? []).map((opt) => ({
          label: opt.label,
          onPress: () => {
            selectSheet?.onPick(opt.value);
            setSelectSheet(null);
          },
        }))}
      />
    </Screen>
  );
}
