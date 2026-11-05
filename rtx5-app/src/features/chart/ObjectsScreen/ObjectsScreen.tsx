import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Chart Feature UI: ObjectsScreen
 *
 * MetaTrader-style chart objects manager backed by persisted drawing records.
 */
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/shallow';
import { ActionSheet } from '../../../ui/components/ActionSheet';
import { useTranslation } from '../../../i18n/useTranslation';
import { Screen } from '../../../ui/components/Screen';
import { useThemeMode } from '../../../state/themeMode';
import { useUserPreferences } from '../../../state/userPreferences';
import { useUIState } from '../../../state/uiState';
import { useTheme } from '../../../ui/theme/useTheme';
import { safeRouterBack } from '../../../utils/navigation';
import { runImmediateAction } from '../../../utils/actionLatency';
import { scheduleChartActionLaunchCovered } from '../chartActionLaunchController';
import { TvText, TvTrendLine } from '../components/ChartToolbarIcons';
import {
  type ChartDrawingKind,
  getChartDrawingBucketKey,
} from '../drawingPersistence';
import {
  ADD_OBJECT_TOOLS,
  DRAWING_TOOL_META,
  buildLegacyDrawingDescription,
  type DisplayDrawing,
} from './drawingMeta';
import {
  cloneDrawingObjectRecord,
  getDrawingObjectPriceAlertDraft,
  renameDrawingObjectRecord,
  sanitizeDrawingObjectLabel,
  toggleDrawingObjectLock,
} from './drawingObjectActions';
import {
  DRAWING_STYLE_COLOR_SWATCHES,
  DRAWING_STYLE_EXTEND_MODE_OPTIONS,
  DRAWING_STYLE_LINE_STYLE_OPTIONS,
  applyDrawingStylePatch,
  drawingSupportsStyleEditor,
  getDrawingStyleEditorValues,
  type DrawingStyleExtendMode,
  type DrawingStyleLineStyle,
  type DrawingStylePatch,
} from './drawingStyleEditor';
import {
  ELLIOTT_WAVE_PRESETS,
  applyElliottWavePatch,
  applyElliottWavePreset,
  describeElliottWavePivot,
  drawingSupportsElliottWaveEditor,
  getActiveElliottWavePresetId,
  getElliottWaveEditorWaves,
  resetElliottWaves,
  type ElliottWavePresetId,
} from './elliottWaveEditor';
import {
  addFibLevel,
  applyFibLevelPatch,
  drawingSupportsFibLevelEditor,
  formatFibLevelPercent,
  formatFibLevelValue,
  getFibLevelEditorLevels,
  parseFibLevelValue,
  removeFibLevel,
  resetFibLevels,
} from './fibLevelEditor';
import {
  applyPositionPlanPatch,
  drawingSupportsPositionPlanEditor,
  formatPositionPlanNumber,
  formatPositionPlanRiskReward,
  getPositionPlanEditorValues,
  parsePositionPlanNumber,
  parsePositionPlanRiskPercent,
  resetPositionPlan,
} from './positionPlanEditor';
import { ActionRow, ToggleRow } from './rows';
import { makeObjectsScreenStyles, type ObjectsScreenStyles } from './styles';
import {
  XABCD_PRESETS,
  XABCD_RATIO_LEGS,
  applyXabcdRatioPatch,
  applyXabcdRatioPreset,
  drawingSupportsXabcdRatioEditor,
  formatXabcdTargetValue,
  getActiveXabcdPresetId,
  getXabcdRatioEditorRatios,
  parseXabcdTargetValue,
  resetXabcdRatios,
  type XabcdPresetId,
} from './xabcdRatioEditor';

const STYLE_OPACITY_STEP = 0.1;

function formatOpacity(value: number) {
  return `${Math.round(value * 100)}%`;
}

function StyleSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  styles,
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
  styles: ObjectsScreenStyles;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.segmentedControl}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {t(option.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StyleStepper({
  label,
  value,
  onDecrease,
  onIncrease,
  styles,
}: {
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  styles: ObjectsScreenStyles;
}) {
  return (
    <View style={styles.styleStepperRow}>
      <Text style={styles.styleControlLabel}>{label}</Text>
      <View style={styles.stepperControl}>
        <Pressable style={styles.stepperButton} onPress={onDecrease} hitSlop={8}>
          <Ionicons name="remove" size={18} color="#2563EB" />
        </Pressable>
        <Text style={styles.stepperValue} numberOfLines={1}>{value}</Text>
        <Pressable style={styles.stepperButton} onPress={onIncrease} hitSlop={8}>
          <Ionicons name="add" size={18} color="#2563EB" />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Screen displaying a list of all active drawing objects (trendlines, fibonacci, etc.) on the current chart symbol.
 */
export function ObjectsScreen() {
  const {
    launchRevision,
    chartWindowPaneId,
    chartWindowSplit,
  } = useLocalSearchParams<{
    launchRevision?: string;
    chartWindowPaneId?: string;
    chartWindowSplit?: string;
  }>();
  const {
    chartSymbol,
    chartLockAll,
    chartHideAll,
    chartDrawings: legacyChartDrawings,
    chartDrawingRecordsBySymbol,
    setChartLockAll,
    setChartHideAll,
    addChartDrawing,
    removeChartDrawing,
    setChartDrawingRecordsForSymbol: setAllChartDrawingRecordsForSymbol,
    removeChartDrawingRecordForSymbol,
  } = useUserPreferences(
    useShallow((state) => ({
      chartSymbol: state.chartSymbol,
      chartLockAll: state.chartLockAll,
      chartHideAll: state.chartHideAll,
      chartDrawings: state.chartDrawings,
      chartDrawingRecordsBySymbol: state.chartDrawingRecordsBySymbol,
      setChartLockAll: state.setChartLockAll,
      setChartHideAll: state.setChartHideAll,
      addChartDrawing: state.addChartDrawing,
      removeChartDrawing: state.removeChartDrawing,
      setChartDrawingRecordsForSymbol: state.setChartDrawingRecordsForSymbol,
      removeChartDrawingRecordForSymbol: state.removeChartDrawingRecordForSymbol,
    })),
  );
  const { t } = useTranslation();
  const queueChartDrawingTool = useUIState((state) => state.queueChartDrawingTool);
  const clearPendingChartDrawingTool = useUIState((state) => state.clearPendingChartDrawingTool);
  const T = useTheme();
  const themeMode = useThemeMode();
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeObjectsScreenStyles(T, isDark), [T, isDark]);
  const isScreenFocused = useIsFocused();
  const parsedLaunchRevision = Number(launchRevision);
  const resolvedLaunchRevision = Number.isFinite(parsedLaunchRevision)
    ? parsedLaunchRevision
    : undefined;
  const launchBodyLaidOutRef = useRef(false);
  const scheduledCoverageRevisionRef = useRef<number | null>(null);
  const scheduleLaunchCoverageIfReady = useCallback(() => {
    if (
      !isScreenFocused
      || resolvedLaunchRevision === undefined
      || !launchBodyLaidOutRef.current
      || scheduledCoverageRevisionRef.current === resolvedLaunchRevision
    ) {
      return;
    }
    scheduledCoverageRevisionRef.current = resolvedLaunchRevision;
    scheduleChartActionLaunchCovered('objects', resolvedLaunchRevision);
  }, [isScreenFocused, resolvedLaunchRevision]);
  const handleLaunchBodyLayout = useCallback(() => {
    launchBodyLaidOutRef.current = true;
    scheduleLaunchCoverageIfReady();
  }, [scheduleLaunchCoverageIfReady]);
  useEffect(() => {
    scheduleLaunchCoverageIfReady();
  }, [scheduleLaunchCoverageIfReady]);
  const [showAddObjectSheet, setShowAddObjectSheet] = useState(false);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [styleEditorDrawingId, setStyleEditorDrawingId] = useState<string | null>(null);
  const [fibEditorDrawingId, setFibEditorDrawingId] = useState<string | null>(null);
  const [selectedFibLevelId, setSelectedFibLevelId] = useState<string | null>(null);
  const [fibLevelValueDraft, setFibLevelValueDraft] = useState('');
  const [fibLevelLabelDraft, setFibLevelLabelDraft] = useState('');
  const [elliottEditorDrawingId, setElliottEditorDrawingId] = useState<string | null>(null);
  const [selectedElliottWaveId, setSelectedElliottWaveId] = useState<string | null>(null);
  const [elliottWaveLabelDraft, setElliottWaveLabelDraft] = useState('');
  const [xabcdEditorDrawingId, setXabcdEditorDrawingId] = useState<string | null>(null);
  const [selectedXabcdRatioId, setSelectedXabcdRatioId] = useState<string | null>(null);
  const [xabcdTargetDraft, setXabcdTargetDraft] = useState('');
  const [positionEditorDrawingId, setPositionEditorDrawingId] = useState<string | null>(null);
  const [positionEntryDraft, setPositionEntryDraft] = useState('');
  const [positionTargetDraft, setPositionTargetDraft] = useState('');
  const [positionStopDraft, setPositionStopDraft] = useState('');
  const [positionAccountDraft, setPositionAccountDraft] = useState('');
  const [positionRiskPercentDraft, setPositionRiskPercentDraft] = useState('');
  const [renameDrawingId, setRenameDrawingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const allChartDrawings = chartDrawingRecordsBySymbol[getChartDrawingBucketKey(chartSymbol)] ?? [];
  const chartWindowScoped = chartWindowSplit === 'true' && Boolean(chartWindowPaneId);
  const chartDrawings = useMemo(
    () => (chartWindowScoped
      ? allChartDrawings.filter(
        (drawing) => drawing.chartWindowPaneId === chartWindowPaneId,
      )
      : allChartDrawings),
    [allChartDrawings, chartWindowPaneId, chartWindowScoped],
  );
  const setChartDrawingRecordsForSymbol = useCallback((
    symbol: string,
    nextPaneDrawings: typeof chartDrawings,
  ) => {
    if (!chartWindowScoped || !chartWindowPaneId) {
      setAllChartDrawingRecordsForSymbol(symbol, nextPaneDrawings);
      return;
    }
    const currentBucket = useUserPreferences.getState()
      .chartDrawingRecordsBySymbol[getChartDrawingBucketKey(symbol)] ?? [];
    const retained = currentBucket.filter(
      (drawing) => drawing.chartWindowPaneId !== chartWindowPaneId,
    );
    const scopedNext = nextPaneDrawings.map((drawing) => ({
      ...drawing,
      chartWindowPaneId,
    }));
    setAllChartDrawingRecordsForSymbol(symbol, [...retained, ...scopedNext]);
  }, [chartWindowPaneId, chartWindowScoped, setAllChartDrawingRecordsForSymbol]);

  const displayDrawings = useMemo<DisplayDrawing[]>(() => {
    if (chartDrawings.length > 0) {
      return chartDrawings.map((drawing) => {
        const meta = DRAWING_TOOL_META[drawing.kind];
        const extraText = (drawing.kind === 'text' || drawing.kind === 'textLevel') && drawing.text ? ` | ${drawing.text}` : '';
        return {
          id: drawing.id,
          label: drawing.label,
          description: `${t(meta.description)}${extraText}`,
          hidden: drawing.hidden,
          locked: Boolean(drawing.locked),
          kind: drawing.kind,
          text: drawing.text,
          supportsVisibility: true,
        };
      });
    }

    return (chartWindowScoped ? [] : legacyChartDrawings).map((label) => ({
      id: label,
      label,
      description: t(buildLegacyDrawingDescription(label)),
      hidden: false,
      locked: false,
      kind: null,
      supportsVisibility: false,
    }));
  }, [chartDrawings, chartWindowScoped, legacyChartDrawings, t]);

  const selectedDrawing = useMemo(
    () => displayDrawings.find((drawing) => drawing.id === selectedDrawingId) ?? null,
    [displayDrawings, selectedDrawingId],
  );
  const styleEditorDrawing = useMemo(
    () => chartDrawings.find((drawing) => drawing.id === styleEditorDrawingId) ?? null,
    [chartDrawings, styleEditorDrawingId],
  );
  const fibEditorDrawing = useMemo(
    () => chartDrawings.find((drawing) =>
      drawing.id === fibEditorDrawingId && drawingSupportsFibLevelEditor(drawing.kind),
    ) ?? null,
    [chartDrawings, fibEditorDrawingId],
  );
  const fibEditorLevels = useMemo(
    () => getFibLevelEditorLevels(fibEditorDrawing),
    [fibEditorDrawing],
  );
  const selectedFibLevel = useMemo(
    () => fibEditorLevels.find((level) => level.id === selectedFibLevelId) ?? fibEditorLevels[0] ?? null,
    [fibEditorLevels, selectedFibLevelId],
  );
  const elliottEditorDrawing = useMemo(
    () => chartDrawings.find((drawing) =>
      drawing.id === elliottEditorDrawingId && drawingSupportsElliottWaveEditor(drawing.kind),
    ) ?? null,
    [chartDrawings, elliottEditorDrawingId],
  );
  const elliottEditorWaves = useMemo(
    () => getElliottWaveEditorWaves(elliottEditorDrawing),
    [elliottEditorDrawing],
  );
  const selectedElliottWave = useMemo(
    () => elliottEditorWaves.find((wave) => wave.id === selectedElliottWaveId) ?? elliottEditorWaves[0] ?? null,
    [elliottEditorWaves, selectedElliottWaveId],
  );
  const activeElliottPresetId = useMemo(
    () => getActiveElliottWavePresetId(elliottEditorWaves),
    [elliottEditorWaves],
  );
  const xabcdEditorDrawing = useMemo(
    () => chartDrawings.find((drawing) =>
      drawing.id === xabcdEditorDrawingId && drawingSupportsXabcdRatioEditor(drawing.kind),
    ) ?? null,
    [chartDrawings, xabcdEditorDrawingId],
  );
  const xabcdEditorRatios = useMemo(
    () => getXabcdRatioEditorRatios(xabcdEditorDrawing),
    [xabcdEditorDrawing],
  );
  const selectedXabcdRatio = useMemo(
    () => xabcdEditorRatios.find((ratio) => ratio.id === selectedXabcdRatioId) ?? xabcdEditorRatios[0] ?? null,
    [selectedXabcdRatioId, xabcdEditorRatios],
  );
  const activeXabcdPresetId = useMemo(
    () => getActiveXabcdPresetId(xabcdEditorRatios),
    [xabcdEditorRatios],
  );
  const positionEditorDrawing = useMemo(
    () => chartDrawings.find((drawing) =>
      drawing.id === positionEditorDrawingId && drawingSupportsPositionPlanEditor(drawing.kind),
    ) ?? null,
    [chartDrawings, positionEditorDrawingId],
  );
  const positionPlanValues = useMemo(
    () => getPositionPlanEditorValues(positionEditorDrawing),
    [positionEditorDrawing],
  );
  const renameDrawing = useMemo(
    () => chartDrawings.find((drawing) => drawing.id === renameDrawingId) ?? null,
    [chartDrawings, renameDrawingId],
  );
  const selectedDrawingRecord = useMemo(
    () => selectedDrawing?.supportsVisibility
      ? chartDrawings.find((drawing) => drawing.id === selectedDrawing.id) ?? null
      : null,
    [chartDrawings, selectedDrawing],
  );
  const selectedDrawingPriceAlertDraft = useMemo(
    () => selectedDrawingRecord ? getDrawingObjectPriceAlertDraft(selectedDrawingRecord, chartSymbol) : null,
    [chartSymbol, selectedDrawingRecord],
  );
  const styleEditorValues = useMemo(
    () => styleEditorDrawing ? getDrawingStyleEditorValues(styleEditorDrawing) : null,
    [styleEditorDrawing],
  );

  useEffect(() => {
    if (styleEditorDrawingId && !styleEditorDrawing) {
      setStyleEditorDrawingId(null);
    }
  }, [styleEditorDrawing, styleEditorDrawingId]);

  useEffect(() => {
    if (fibEditorDrawingId && !fibEditorDrawing) {
      setFibEditorDrawingId(null);
      setSelectedFibLevelId(null);
      setFibLevelValueDraft('');
      setFibLevelLabelDraft('');
    }
  }, [fibEditorDrawing, fibEditorDrawingId]);

  useEffect(() => {
    if (!fibEditorDrawing) {
      return;
    }
    if (!selectedFibLevel && fibEditorLevels[0]) {
      setSelectedFibLevelId(fibEditorLevels[0].id);
      return;
    }
    if (selectedFibLevel && selectedFibLevel.id !== selectedFibLevelId) {
      setSelectedFibLevelId(selectedFibLevel.id);
    }
  }, [fibEditorDrawing, fibEditorLevels, selectedFibLevel, selectedFibLevelId]);

  useEffect(() => {
    if (!selectedFibLevel) {
      setFibLevelValueDraft('');
      setFibLevelLabelDraft('');
      return;
    }

    setFibLevelValueDraft(formatFibLevelValue(selectedFibLevel.value));
    setFibLevelLabelDraft(selectedFibLevel.label);
  }, [selectedFibLevel]);

  useEffect(() => {
    if (elliottEditorDrawingId && !elliottEditorDrawing) {
      setElliottEditorDrawingId(null);
      setSelectedElliottWaveId(null);
      setElliottWaveLabelDraft('');
    }
  }, [elliottEditorDrawing, elliottEditorDrawingId]);

  useEffect(() => {
    if (!elliottEditorDrawing) {
      return;
    }
    if (!selectedElliottWave && elliottEditorWaves[0]) {
      setSelectedElliottWaveId(elliottEditorWaves[0].id);
      return;
    }
    if (selectedElliottWave && selectedElliottWave.id !== selectedElliottWaveId) {
      setSelectedElliottWaveId(selectedElliottWave.id);
    }
  }, [elliottEditorDrawing, elliottEditorWaves, selectedElliottWave, selectedElliottWaveId]);

  useEffect(() => {
    setElliottWaveLabelDraft(selectedElliottWave ? selectedElliottWave.label : '');
  }, [selectedElliottWave]);

  useEffect(() => {
    if (xabcdEditorDrawingId && !xabcdEditorDrawing) {
      setXabcdEditorDrawingId(null);
      setSelectedXabcdRatioId(null);
      setXabcdTargetDraft('');
    }
  }, [xabcdEditorDrawing, xabcdEditorDrawingId]);

  useEffect(() => {
    if (!xabcdEditorDrawing) {
      return;
    }
    if (!selectedXabcdRatio && xabcdEditorRatios[0]) {
      setSelectedXabcdRatioId(xabcdEditorRatios[0].id);
      return;
    }
    if (selectedXabcdRatio && selectedXabcdRatio.id !== selectedXabcdRatioId) {
      setSelectedXabcdRatioId(selectedXabcdRatio.id);
    }
  }, [selectedXabcdRatio, selectedXabcdRatioId, xabcdEditorDrawing, xabcdEditorRatios]);

  useEffect(() => {
    setXabcdTargetDraft(selectedXabcdRatio ? formatXabcdTargetValue(selectedXabcdRatio.target) : '');
  }, [selectedXabcdRatio]);

  useEffect(() => {
    if (positionEditorDrawingId && !positionEditorDrawing) {
      setPositionEditorDrawingId(null);
    }
  }, [positionEditorDrawing, positionEditorDrawingId]);

  useEffect(() => {
    if (!positionPlanValues) {
      setPositionEntryDraft('');
      setPositionTargetDraft('');
      setPositionStopDraft('');
      setPositionAccountDraft('');
      setPositionRiskPercentDraft('');
      return;
    }

    setPositionEntryDraft(formatPositionPlanNumber(positionPlanValues.entryPrice));
    setPositionTargetDraft(formatPositionPlanNumber(positionPlanValues.targetPrice));
    setPositionStopDraft(positionPlanValues.stopIsCustom ? formatPositionPlanNumber(positionPlanValues.stopPrice) : '');
    setPositionAccountDraft(formatPositionPlanNumber(positionPlanValues.accountSize, 2));
    setPositionRiskPercentDraft(positionPlanValues.accountSize !== null || positionPlanValues.riskPercent !== 1
      ? formatPositionPlanNumber(positionPlanValues.riskPercent, 2)
      : '');
  }, [positionPlanValues]);

  useEffect(() => {
    if (renameDrawingId && !renameDrawing) {
      setRenameDrawingId(null);
      setRenameDraft('');
    }
  }, [renameDrawing, renameDrawingId]);

  /**
   * Opens a bottom sheet action menu allowing the user to select a new drawing tool to add to the chart.
   */
  const handleOpenAddObjectSheet = useCallback(() => {
    runImmediateAction('chart.objects.addObjectSheet.open', () => setShowAddObjectSheet(true));
  }, []);

  const handleCloseStyleEditor = useCallback(() => {
    setStyleEditorDrawingId(null);
  }, []);

  const handleCloseFibLevelEditor = useCallback(() => {
    setFibEditorDrawingId(null);
    setSelectedFibLevelId(null);
    setFibLevelValueDraft('');
    setFibLevelLabelDraft('');
  }, []);

  const handleCloseElliottWaveEditor = useCallback(() => {
    setElliottEditorDrawingId(null);
    setSelectedElliottWaveId(null);
    setElliottWaveLabelDraft('');
  }, []);

  const handleCloseXabcdRatioEditor = useCallback(() => {
    setXabcdEditorDrawingId(null);
    setSelectedXabcdRatioId(null);
    setXabcdTargetDraft('');
  }, []);

  const handleClosePositionPlanEditor = useCallback(() => {
    setPositionEditorDrawingId(null);
  }, []);

  const handleCloseRenameDialog = useCallback(() => {
    setRenameDrawingId(null);
    setRenameDraft('');
  }, []);

  /**
   * Fired when the user selects a specific drawing tool from the 'Add Object' bottom sheet, activating the tool on the chart.
   */
  const handleSelectTool = useCallback((tool: ChartDrawingKind) => {
    setShowAddObjectSheet(false);
    clearPendingChartDrawingTool();

    if (Platform.OS === 'web') {
      const selectedTool = DRAWING_TOOL_META[tool];
      addChartDrawing(`${selectedTool.label} ${legacyChartDrawings.length + 1}`);
      return;
    }

    if (chartLockAll) {
      setChartLockAll(false);
    }
    if (chartHideAll) {
      setChartHideAll(false);
    }

    queueChartDrawingTool(tool);
    safeRouterBack(router, '/(tabs)/chart');
  }, [
    addChartDrawing,
    chartHideAll,
    chartLockAll,
    clearPendingChartDrawingTool,
    legacyChartDrawings.length,
    queueChartDrawingTool,
    setChartHideAll,
    setChartLockAll,
  ]);

  /**
   * Deletes the selected drawing object from the chart permanently.
   */
  const handleRemoveDrawing = useCallback((drawing: DisplayDrawing) => {
    if (chartDrawings.length > 0 && drawing.supportsVisibility) {
      removeChartDrawingRecordForSymbol(chartSymbol, drawing.id);
      return;
    }

    removeChartDrawing(drawing.label);
  }, [chartDrawings.length, chartSymbol, removeChartDrawing, removeChartDrawingRecordForSymbol]);

  /**
   * Temporarily hides or shows a specific drawing object without deleting it.
   */
  const handleToggleDrawingVisibility = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.supportsVisibility) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === drawing.id
        ? { ...record, hidden: !record.hidden }
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, setChartDrawingRecordsForSymbol]);

  const handleToggleDrawingLock = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.supportsVisibility) {
      return;
    }

    setSelectedDrawingId(null);
    setChartDrawingRecordsForSymbol(
      chartSymbol,
      toggleDrawingObjectLock(chartDrawings, drawing.id),
    );
  }, [chartDrawings, chartSymbol, setChartDrawingRecordsForSymbol]);

  const handleOpenRenameDialog = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.supportsVisibility) {
      return;
    }

    setSelectedDrawingId(null);
    setRenameDrawingId(drawing.id);
    setRenameDraft(drawing.label);
  }, []);

  const handleSubmitRename = useCallback(() => {
    if (!renameDrawing) {
      handleCloseRenameDialog();
      return;
    }

    setChartDrawingRecordsForSymbol(
      chartSymbol,
      renameDrawingObjectRecord(chartDrawings, renameDrawing.id, renameDraft),
    );
    handleCloseRenameDialog();
  }, [
    chartDrawings,
    chartSymbol,
    handleCloseRenameDialog,
    renameDraft,
    renameDrawing,
    setChartDrawingRecordsForSymbol,
  ]);

  const handleCloneDrawing = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.supportsVisibility) {
      return;
    }

    setSelectedDrawingId(null);
    setChartDrawingRecordsForSymbol(
      chartSymbol,
      cloneDrawingObjectRecord(chartDrawings, drawing.id),
    );
  }, [chartDrawings, chartSymbol, setChartDrawingRecordsForSymbol]);

  const handleOpenStyleEditor = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.kind || !drawingSupportsStyleEditor(drawing.kind)) {
      return;
    }

    setSelectedDrawingId(null);
    setFibEditorDrawingId(null);
    setElliottEditorDrawingId(null);
    setXabcdEditorDrawingId(null);
    setPositionEditorDrawingId(null);
    setStyleEditorDrawingId(drawing.id);
  }, []);

  const handleOpenFibLevelEditor = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.kind || !drawingSupportsFibLevelEditor(drawing.kind)) {
      return;
    }

    setSelectedDrawingId(null);
    setStyleEditorDrawingId(null);
    setElliottEditorDrawingId(null);
    setXabcdEditorDrawingId(null);
    setPositionEditorDrawingId(null);
    setFibEditorDrawingId(drawing.id);
  }, []);

  const handleOpenElliottWaveEditor = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.kind || !drawingSupportsElliottWaveEditor(drawing.kind)) {
      return;
    }

    setSelectedDrawingId(null);
    setStyleEditorDrawingId(null);
    setFibEditorDrawingId(null);
    setXabcdEditorDrawingId(null);
    setPositionEditorDrawingId(null);
    setElliottEditorDrawingId(drawing.id);
  }, []);

  const handleOpenXabcdRatioEditor = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.kind || !drawingSupportsXabcdRatioEditor(drawing.kind)) {
      return;
    }

    setSelectedDrawingId(null);
    setStyleEditorDrawingId(null);
    setFibEditorDrawingId(null);
    setElliottEditorDrawingId(null);
    setPositionEditorDrawingId(null);
    setXabcdEditorDrawingId(drawing.id);
  }, []);

  const handleOpenPositionPlanEditor = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.kind || !drawingSupportsPositionPlanEditor(drawing.kind)) {
      return;
    }

    setSelectedDrawingId(null);
    setStyleEditorDrawingId(null);
    setFibEditorDrawingId(null);
    setElliottEditorDrawingId(null);
    setXabcdEditorDrawingId(null);
    setPositionEditorDrawingId(drawing.id);
  }, []);

  const handleOpenPriceAlertFromDrawing = useCallback(() => {
    if (!selectedDrawingPriceAlertDraft) {
      return;
    }

    setSelectedDrawingId(null);
    router.push({
      pathname: '/chart/alerts',
      params: {
        condition: selectedDrawingPriceAlertDraft.condition,
        drawingId: selectedDrawingPriceAlertDraft.drawingId,
        drawingKind: selectedDrawingPriceAlertDraft.drawingKind,
        message: selectedDrawingPriceAlertDraft.message,
        price: selectedDrawingPriceAlertDraft.price,
        symbol: selectedDrawingPriceAlertDraft.symbol,
      },
    });
  }, [selectedDrawingPriceAlertDraft]);

  const handleUpdateDrawingStyle = useCallback((patch: DrawingStylePatch) => {
    if (!styleEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === styleEditorDrawing.id
        ? applyDrawingStylePatch(record, patch)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, setChartDrawingRecordsForSymbol, styleEditorDrawing]);

  const handleUpdateFibLevel = useCallback((levelId: string, patch: Parameters<typeof applyFibLevelPatch>[2]) => {
    if (!fibEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === fibEditorDrawing.id
        ? applyFibLevelPatch(record, levelId, patch)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, fibEditorDrawing, setChartDrawingRecordsForSymbol]);

  const handleAddFibLevel = useCallback(() => {
    if (!fibEditorDrawing) {
      return;
    }

    const currentIds = new Set(fibEditorLevels.map((level) => level.id));
    let nextSelectedLevelId = selectedFibLevelId;
    const nextDrawings = chartDrawings.map((record) => {
      if (record.id !== fibEditorDrawing.id) {
        return record;
      }
      const next = addFibLevel(record);
      const addedLevel = getFibLevelEditorLevels(next).find((level) => !currentIds.has(level.id));
      nextSelectedLevelId = addedLevel?.id ?? nextSelectedLevelId;
      return next;
    });
    setSelectedFibLevelId(nextSelectedLevelId);
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [
    chartDrawings,
    chartSymbol,
    fibEditorDrawing,
    fibEditorLevels,
    selectedFibLevelId,
    setChartDrawingRecordsForSymbol,
  ]);

  const handleRemoveSelectedFibLevel = useCallback(() => {
    if (!fibEditorDrawing || !selectedFibLevel) {
      return;
    }

    let nextSelectedLevelId: string | null = null;
    const nextDrawings = chartDrawings.map((record) => {
      if (record.id !== fibEditorDrawing.id) {
        return record;
      }
      const next = removeFibLevel(record, selectedFibLevel.id);
      nextSelectedLevelId = getFibLevelEditorLevels(next)[0]?.id ?? null;
      return next;
    });
    setSelectedFibLevelId(nextSelectedLevelId);
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [
    chartDrawings,
    chartSymbol,
    fibEditorDrawing,
    selectedFibLevel,
    setChartDrawingRecordsForSymbol,
  ]);

  const handleResetFibLevels = useCallback(() => {
    if (!fibEditorDrawing) {
      return;
    }

    let nextSelectedLevelId: string | null = null;
    const nextDrawings = chartDrawings.map((record) => {
      if (record.id !== fibEditorDrawing.id) {
        return record;
      }
      const next = resetFibLevels(record);
      nextSelectedLevelId = getFibLevelEditorLevels(next)[0]?.id ?? null;
      return next;
    });
    setSelectedFibLevelId(nextSelectedLevelId);
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, fibEditorDrawing, setChartDrawingRecordsForSymbol]);

  const handleCommitFibLevelValue = useCallback(() => {
    if (!selectedFibLevel) {
      return;
    }

    const nextValue = parseFibLevelValue(fibLevelValueDraft);
    if (nextValue === null) {
      setFibLevelValueDraft(formatFibLevelValue(selectedFibLevel.value));
      return;
    }
    handleUpdateFibLevel(selectedFibLevel.id, { value: nextValue });
  }, [fibLevelValueDraft, handleUpdateFibLevel, selectedFibLevel]);

  const handleCommitFibLevelLabel = useCallback(() => {
    if (!selectedFibLevel) {
      return;
    }

    const nextLabel = fibLevelLabelDraft.trim() || formatFibLevelValue(selectedFibLevel.value);
    setFibLevelLabelDraft(nextLabel);
    handleUpdateFibLevel(selectedFibLevel.id, { label: nextLabel });
  }, [fibLevelLabelDraft, handleUpdateFibLevel, selectedFibLevel]);

  const handleUpdateElliottWave = useCallback((waveId: string, patch: Parameters<typeof applyElliottWavePatch>[2]) => {
    if (!elliottEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === elliottEditorDrawing.id
        ? applyElliottWavePatch(record, waveId, patch)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, elliottEditorDrawing, setChartDrawingRecordsForSymbol]);

  const handleApplyElliottWavePreset = useCallback((presetId: ElliottWavePresetId) => {
    if (!elliottEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === elliottEditorDrawing.id
        ? applyElliottWavePreset(record, presetId)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, elliottEditorDrawing, setChartDrawingRecordsForSymbol]);

  const handleResetElliottWaves = useCallback(() => {
    if (!elliottEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === elliottEditorDrawing.id
        ? resetElliottWaves(record)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, elliottEditorDrawing, setChartDrawingRecordsForSymbol]);

  const handleCommitElliottWaveLabel = useCallback(() => {
    if (!selectedElliottWave) {
      return;
    }

    handleUpdateElliottWave(selectedElliottWave.id, { label: elliottWaveLabelDraft });
  }, [elliottWaveLabelDraft, handleUpdateElliottWave, selectedElliottWave]);

  const handleUpdateXabcdRatio = useCallback((ratioId: string, patch: Parameters<typeof applyXabcdRatioPatch>[2]) => {
    if (!xabcdEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === xabcdEditorDrawing.id
        ? applyXabcdRatioPatch(record, ratioId, patch)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, setChartDrawingRecordsForSymbol, xabcdEditorDrawing]);

  const handleApplyXabcdPreset = useCallback((presetId: XabcdPresetId) => {
    if (!xabcdEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === xabcdEditorDrawing.id
        ? applyXabcdRatioPreset(record, presetId)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, setChartDrawingRecordsForSymbol, xabcdEditorDrawing]);

  const handleResetXabcdRatios = useCallback(() => {
    if (!xabcdEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === xabcdEditorDrawing.id
        ? resetXabcdRatios(record)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, setChartDrawingRecordsForSymbol, xabcdEditorDrawing]);

  const handleCommitXabcdTarget = useCallback(() => {
    if (!selectedXabcdRatio) {
      return;
    }

    if (xabcdTargetDraft.trim().length === 0) {
      handleUpdateXabcdRatio(selectedXabcdRatio.id, { target: null });
      return;
    }

    const nextTarget = parseXabcdTargetValue(xabcdTargetDraft);
    if (nextTarget === null) {
      setXabcdTargetDraft(formatXabcdTargetValue(selectedXabcdRatio.target));
      return;
    }
    handleUpdateXabcdRatio(selectedXabcdRatio.id, { target: nextTarget });
  }, [handleUpdateXabcdRatio, selectedXabcdRatio, xabcdTargetDraft]);

  const handleUpdatePositionPlan = useCallback((patch: Parameters<typeof applyPositionPlanPatch>[1]) => {
    if (!positionEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === positionEditorDrawing.id
        ? applyPositionPlanPatch(record, patch)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, positionEditorDrawing, setChartDrawingRecordsForSymbol]);

  const handleResetPositionPlan = useCallback(() => {
    if (!positionEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === positionEditorDrawing.id
        ? resetPositionPlan(record)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, positionEditorDrawing, setChartDrawingRecordsForSymbol]);

  const handleCommitPositionEntry = useCallback(() => {
    if (!positionPlanValues) {
      return;
    }

    const nextEntry = parsePositionPlanNumber(positionEntryDraft);
    if (nextEntry === null) {
      setPositionEntryDraft(formatPositionPlanNumber(positionPlanValues.entryPrice));
      return;
    }
    handleUpdatePositionPlan({ entryPrice: nextEntry });
  }, [handleUpdatePositionPlan, positionEntryDraft, positionPlanValues]);

  const handleCommitPositionTarget = useCallback(() => {
    if (!positionPlanValues) {
      return;
    }

    const nextTarget = parsePositionPlanNumber(positionTargetDraft);
    if (nextTarget === null) {
      setPositionTargetDraft(formatPositionPlanNumber(positionPlanValues.targetPrice));
      return;
    }
    handleUpdatePositionPlan({ targetPrice: nextTarget });
  }, [handleUpdatePositionPlan, positionPlanValues, positionTargetDraft]);

  const handleCommitPositionStop = useCallback(() => {
    if (!positionPlanValues) {
      return;
    }

    if (positionStopDraft.trim().length === 0) {
      handleUpdatePositionPlan({ stopPrice: null });
      return;
    }

    const nextStop = parsePositionPlanNumber(positionStopDraft);
    if (nextStop === null) {
      setPositionStopDraft(positionPlanValues.stopIsCustom ? formatPositionPlanNumber(positionPlanValues.stopPrice) : '');
      return;
    }
    handleUpdatePositionPlan({ stopPrice: nextStop });
  }, [handleUpdatePositionPlan, positionPlanValues, positionStopDraft]);

  const handleCommitPositionAccount = useCallback(() => {
    if (!positionPlanValues) {
      return;
    }

    if (positionAccountDraft.trim().length === 0) {
      handleUpdatePositionPlan({ accountSize: null });
      return;
    }

    const nextAccount = parsePositionPlanNumber(positionAccountDraft);
    if (nextAccount === null) {
      setPositionAccountDraft(formatPositionPlanNumber(positionPlanValues.accountSize, 2));
      return;
    }
    handleUpdatePositionPlan({ accountSize: nextAccount });
  }, [handleUpdatePositionPlan, positionAccountDraft, positionPlanValues]);

  const handleCommitPositionRiskPercent = useCallback(() => {
    if (!positionPlanValues) {
      return;
    }

    if (positionRiskPercentDraft.trim().length === 0) {
      handleUpdatePositionPlan({ riskPercent: null });
      return;
    }

    const nextRiskPercent = parsePositionPlanRiskPercent(positionRiskPercentDraft);
    if (nextRiskPercent === null) {
      setPositionRiskPercentDraft(formatPositionPlanNumber(positionPlanValues.riskPercent, 2));
      return;
    }
    handleUpdatePositionPlan({ riskPercent: nextRiskPercent });
  }, [handleUpdatePositionPlan, positionPlanValues, positionRiskPercentDraft]);

  const addObjectActions = useMemo(
    () =>
      ADD_OBJECT_TOOLS.map((tool) => {
        const meta = DRAWING_TOOL_META[tool];
        return {
          label: t(meta.label),
          icon: <meta.Icon color={meta.accent} />,
          onPress: () => handleSelectTool(tool),
        };
      }),
    [handleSelectTool, t],
  );

  const selectedDrawingActions = useMemo(() => {
    if (!selectedDrawing) {
      return [];
    }

    const actions: Array<{ label: string; danger?: boolean; onPress?: () => void }> = [];

    if (selectedDrawing.supportsVisibility) {
      actions.push({
        label: t('Rename'),
        onPress: () => handleOpenRenameDialog(selectedDrawing),
      });
      actions.push({
        label: selectedDrawing.locked ? t('Unlock object') : t('Lock object'),
        onPress: () => handleToggleDrawingLock(selectedDrawing),
      });
    }

    if (selectedDrawing.kind && drawingSupportsFibLevelEditor(selectedDrawing.kind)) {
      actions.push({
        label: t('Edit Fibonacci levels'),
        onPress: () => handleOpenFibLevelEditor(selectedDrawing),
      });
    }

    if (selectedDrawing.kind && drawingSupportsElliottWaveEditor(selectedDrawing.kind)) {
      actions.push({
        label: t('Edit Elliott waves'),
        onPress: () => handleOpenElliottWaveEditor(selectedDrawing),
      });
    }

    if (selectedDrawing.kind && drawingSupportsXabcdRatioEditor(selectedDrawing.kind)) {
      actions.push({
        label: t('Edit XABCD ratios'),
        onPress: () => handleOpenXabcdRatioEditor(selectedDrawing),
      });
    }

    if (selectedDrawing.kind && drawingSupportsPositionPlanEditor(selectedDrawing.kind)) {
      actions.push({
        label: t('Edit risk / reward'),
        onPress: () => handleOpenPositionPlanEditor(selectedDrawing),
      });
    }

    if (selectedDrawing.kind && drawingSupportsStyleEditor(selectedDrawing.kind)) {
      actions.push({
        label: t('Edit style'),
        onPress: () => handleOpenStyleEditor(selectedDrawing),
      });
    }

    if (selectedDrawingPriceAlertDraft) {
      actions.push({
        label: t('Create price alert'),
        onPress: handleOpenPriceAlertFromDrawing,
      });
    }

    if (selectedDrawing.supportsVisibility) {
      actions.push({
        label: t('Duplicate / clone'),
        onPress: () => handleCloneDrawing(selectedDrawing),
      });
      actions.push({
        label: selectedDrawing.hidden ? t('Show on chart') : t('Hide on chart'),
        onPress: () => handleToggleDrawingVisibility(selectedDrawing),
      });
    }

    if (selectedDrawing.kind && ADD_OBJECT_TOOLS.includes(selectedDrawing.kind)) {
      actions.push({
        label: `${t('Add another')} ${t(DRAWING_TOOL_META[selectedDrawing.kind].label)}`,
        onPress: () => handleSelectTool(selectedDrawing.kind as ChartDrawingKind),
      });
    }

    actions.push({
      label: t('Delete'),
      danger: true,
      onPress: () => handleRemoveDrawing(selectedDrawing),
    });

    return actions;
  }, [
    handleCloneDrawing,
    handleOpenElliottWaveEditor,
    handleOpenFibLevelEditor,
    handleOpenPositionPlanEditor,
    handleOpenRenameDialog,
    handleOpenXabcdRatioEditor,
    handleOpenPriceAlertFromDrawing,
    handleOpenStyleEditor,
    handleRemoveDrawing,
    handleSelectTool,
    handleToggleDrawingLock,
    handleToggleDrawingVisibility,
    selectedDrawing,
    selectedDrawingPriceAlertDraft,
    t,
  ]);

  const styleEditorOpen = Boolean(styleEditorDrawing && styleEditorValues);
  const fibLevelEditorOpen = Boolean(fibEditorDrawing);
  const elliottWaveEditorOpen = Boolean(elliottEditorDrawing);
  const xabcdRatioEditorOpen = Boolean(xabcdEditorDrawing);
  const positionPlanEditorOpen = Boolean(positionEditorDrawing && positionPlanValues);
  const editorOpen = styleEditorOpen || fibLevelEditorOpen || elliottWaveEditorOpen || xabcdRatioEditorOpen || positionPlanEditorOpen;
  const closeOpenEditor = fibLevelEditorOpen
    ? handleCloseFibLevelEditor
    : (elliottWaveEditorOpen
      ? handleCloseElliottWaveEditor
      : (xabcdRatioEditorOpen
        ? handleCloseXabcdRatioEditor
        : (positionPlanEditorOpen ? handleClosePositionPlanEditor : handleCloseStyleEditor)));
  const editorHeaderTitle = fibLevelEditorOpen
    ? t('Fib levels')
    : (elliottWaveEditorOpen
      ? t('Elliott waves')
      : (xabcdRatioEditorOpen
        ? t('XABCD ratios')
        : (positionPlanEditorOpen ? t('Risk / reward') : t('Style'))));
  const renameLabelPreview = renameDrawing
    ? sanitizeDrawingObjectLabel(renameDraft, renameDrawing.label)
    : '';
  const renameSaveDisabled = renameDrawing
    ? renameLabelPreview === renameDrawing.label
    : true;

  return (
    <Screen
      collapsable={false}
      onLayout={handleLaunchBodyLayout}
      style={styles.screen}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={editorOpen ? closeOpenEditor : () => safeRouterBack(router, '/(tabs)/chart')}
            activateOnPressIn
            hitSlop={16}
            style={styles.headerButton}
          >
            <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {editorOpen ? editorHeaderTitle : t('Objects')}
          </Text>
          {editorOpen ? (
            <Pressable
              onPress={closeOpenEditor}
              activateOnPressIn
              activateOnTouchStart
              unstable_pressDelay={0}
              hitSlop={16}
              style={styles.headerButton}
            >
              <Ionicons name="checkmark" size={24} color="#3B82F6" />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleOpenAddObjectSheet}
              activateOnPressIn
              activateOnTouchStart
              unstable_pressDelay={0}
              hitSlop={16}
              style={styles.headerButton}
            >
              <Ionicons name="add" size={24} color="#3B82F6" />
            </Pressable>
          )}
        </View>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {fibEditorDrawing?.label ?? elliottEditorDrawing?.label ?? xabcdEditorDrawing?.label ?? positionEditorDrawing?.label ?? styleEditorDrawing?.label ?? `${chartSymbol.replace(/\//g, '')} ${t('chart objects')}`}
        </Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {fibEditorDrawing ? (
          <>
            <Text style={styles.sectionLabel}>{t('Levels')}</Text>
            <View style={styles.panel}>
              {fibEditorLevels.map((level, index) => {
                const color = level.lineColor ?? level.color ?? '#64748B';
                const selected = selectedFibLevel?.id === level.id;
                return (
                  <React.Fragment key={level.id}>
                    <Pressable
                      style={[styles.fibLevelRow, selected && styles.fibLevelRowSelected]}
                      onPress={() => setSelectedFibLevelId(level.id)}
                    >
                      <View style={styles.rowLeft}>
                        <View style={[styles.fibLevelColorDot, { backgroundColor: color }]} />
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{level.label}</Text>
                          <Text style={styles.rowSubtitle} numberOfLines={1}>
                            {formatFibLevelValue(level.value)} | {formatFibLevelPercent(level.value)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.fibLevelRight}>
                        {selected ? <Ionicons name="checkmark-circle" size={18} color="#2563EB" /> : null}
                        <Switch
                          value={level.visible}
                          onValueChange={(visible) => handleUpdateFibLevel(level.id, { visible })}
                          trackColor={{ false: isDark ? '#1E1E1E' : '#CBD5E1', true: '#3B82F6' }}
                          thumbColor="#FFFFFF"
                        />
                      </View>
                    </Pressable>
                    {index < fibEditorLevels.length - 1 ? <View style={styles.panelDivider} /> : null}
                  </React.Fragment>
                );
              })}
            </View>

            <View style={[styles.panel, styles.fibActionPanel]}>
              <Pressable style={styles.fibActionButton} onPress={handleAddFibLevel}>
                <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
                <Text style={styles.fibActionText}>{t('Add level')}</Text>
              </Pressable>
              <View style={styles.fibActionDivider} />
              <Pressable style={styles.fibActionButton} onPress={handleResetFibLevels}>
                <Ionicons name="refresh-outline" size={18} color="#2563EB" />
                <Text style={styles.fibActionText}>{t('Reset')}</Text>
              </Pressable>
            </View>

            {selectedFibLevel ? (
              <>
                <Text style={styles.sectionLabel}>{t('Selected level')}</Text>
                <View style={styles.panel}>
                  <View style={styles.fibInputRow}>
                    <Text style={styles.styleControlLabel}>{t('Value')}</Text>
                    <TextInput
                      value={fibLevelValueDraft}
                      onChangeText={setFibLevelValueDraft}
                      onBlur={handleCommitFibLevelValue}
                      onSubmitEditing={handleCommitFibLevelValue}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                      style={styles.fibTextInput}
                    />
                  </View>
                  <View style={styles.panelDivider} />
                  <View style={styles.fibInputRow}>
                    <Text style={styles.styleControlLabel}>{t('Label')}</Text>
                    <TextInput
                      value={fibLevelLabelDraft}
                      onChangeText={setFibLevelLabelDraft}
                      onBlur={handleCommitFibLevelLabel}
                      onSubmitEditing={handleCommitFibLevelLabel}
                      selectTextOnFocus
                      maxLength={24}
                      style={styles.fibTextInput}
                    />
                  </View>
                </View>

                <Text style={styles.sectionLabel}>{t('Color')}</Text>
                <View style={[styles.panel, styles.colorSwatchPanel]}>
                  {DRAWING_STYLE_COLOR_SWATCHES.map((color) => {
                    const active = color.toLowerCase() === (selectedFibLevel.lineColor ?? selectedFibLevel.color ?? '').toLowerCase();
                    return (
                      <Pressable
                        key={color}
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: color },
                          color === '#FFFFFF' && styles.colorSwatchLight,
                          active && styles.colorSwatchActive,
                        ]}
                        onPress={() => handleUpdateFibLevel(selectedFibLevel.id, { color })}
                        accessibilityLabel={`Set Fibonacci level color ${color}`}
                      >
                        {active ? (
                          <Ionicons name="checkmark" size={18} color={color === '#FFFFFF' ? '#0F172A' : '#FFFFFF'} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.sectionLabel}>{t('Stroke')}</Text>
                <View style={[styles.panel, styles.styleControlsPanel]}>
                  <StyleStepper
                    label={t('Width')}
                    value={`${Number((selectedFibLevel.lineWidth ?? 1).toFixed(2))}px`}
                    onDecrease={() =>
                      handleUpdateFibLevel(selectedFibLevel.id, { lineWidth: (selectedFibLevel.lineWidth ?? 1) - 1 })
                    }
                    onIncrease={() =>
                      handleUpdateFibLevel(selectedFibLevel.id, { lineWidth: (selectedFibLevel.lineWidth ?? 1) + 1 })
                    }
                    styles={styles}
                  />
                  <View style={styles.panelDivider} />
                  <View style={styles.styleControlBlock}>
                    <Text style={styles.styleControlLabel}>{t('Pattern')}</Text>
                    <StyleSegmentedControl<DrawingStyleLineStyle>
                      options={DRAWING_STYLE_LINE_STYLE_OPTIONS}
                      value={selectedFibLevel.lineStyle ?? 'solid'}
                      onChange={(lineStyle) => handleUpdateFibLevel(selectedFibLevel.id, { lineStyle })}
                      styles={styles}
                    />
                  </View>
                </View>

                <Text style={styles.sectionLabel}>{t('Labels')}</Text>
                <View style={styles.panel}>
                  <ToggleRow
                    label={t('Price label')}
                    description={t('Show price beside this level')}
                    value={selectedFibLevel.showPrice !== false}
                    onValueChange={(showPrice) => handleUpdateFibLevel(selectedFibLevel.id, { showPrice })}
                    styles={styles}
                    isDark={isDark}
                  />
                  <View style={styles.panelDivider} />
                  <ToggleRow
                    label={t('Percent label')}
                    description={t('Show percent beside this level')}
                    value={selectedFibLevel.showPercent !== false}
                    onValueChange={(showPercent) => handleUpdateFibLevel(selectedFibLevel.id, { showPercent })}
                    styles={styles}
                    isDark={isDark}
                  />
                </View>

                <View style={styles.panel}>
                  <Pressable
                    style={[
                      styles.fibDeleteButton,
                      fibEditorLevels.length <= 1 && styles.fibDeleteButtonDisabled,
                    ]}
                    onPress={handleRemoveSelectedFibLevel}
                    disabled={fibEditorLevels.length <= 1}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={fibEditorLevels.length <= 1 ? (isDark ? '#64748B' : '#94A3B8') : '#EF4444'}
                    />
                    <Text
                      style={[
                        styles.fibDeleteText,
                        fibEditorLevels.length <= 1 && styles.fibDeleteTextDisabled,
                      ]}
                    >
                      {t('Delete selected level')}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </>
        ) : elliottEditorDrawing ? (
          <>
            <Text style={styles.sectionLabel}>{t('Wave pattern')}</Text>
            <View style={styles.panel}>
              {ELLIOTT_WAVE_PRESETS.map((preset, index) => {
                const active = activeElliottPresetId === preset.id;
                return (
                  <React.Fragment key={preset.id}>
                    <Pressable
                      style={[styles.fibLevelRow, active && styles.fibLevelRowSelected]}
                      onPress={() => handleApplyElliottWavePreset(preset.id)}
                    >
                      <View style={styles.rowLeft}>
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{t(preset.label)}</Text>
                          <Text style={styles.rowSubtitle} numberOfLines={1}>{t(preset.description)}</Text>
                        </View>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={18} color="#2563EB" /> : null}
                    </Pressable>
                    {index < ELLIOTT_WAVE_PRESETS.length - 1 ? <View style={styles.panelDivider} /> : null}
                  </React.Fragment>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>{t('Waves')}</Text>
            <View style={styles.panel}>
              {elliottEditorWaves.map((wave, index) => {
                const selected = selectedElliottWave?.id === wave.id;
                return (
                  <React.Fragment key={wave.id}>
                    <Pressable
                      style={[styles.fibLevelRow, selected && styles.fibLevelRowSelected]}
                      onPress={() => setSelectedElliottWaveId(wave.id)}
                    >
                      <View style={styles.rowLeft}>
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{wave.label || t('No label')}</Text>
                          <Text style={styles.rowSubtitle} numberOfLines={1}>
                            {index === 0 ? t('Origin pivot') : t('Wave {index} pivot').replace('{index}', String(index))}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.fibLevelRight}>
                        {selected ? <Ionicons name="checkmark-circle" size={18} color="#2563EB" /> : null}
                        <Switch
                          value={wave.visible}
                          onValueChange={(visible) => handleUpdateElliottWave(wave.id, { visible })}
                          trackColor={{ false: isDark ? '#1E1E1E' : '#CBD5E1', true: '#3B82F6' }}
                          thumbColor="#FFFFFF"
                        />
                      </View>
                    </Pressable>
                    {index < elliottEditorWaves.length - 1 ? <View style={styles.panelDivider} /> : null}
                  </React.Fragment>
                );
              })}
            </View>

            <View style={[styles.panel, styles.fibActionPanel]}>
              <Pressable style={styles.fibActionButton} onPress={handleResetElliottWaves}>
                <Ionicons name="refresh-outline" size={18} color="#2563EB" />
                <Text style={styles.fibActionText}>{t('Reset')}</Text>
              </Pressable>
            </View>

            {selectedElliottWave ? (
              <>
                <Text style={styles.sectionLabel}>{t('Selected wave')}</Text>
                <View style={styles.panel}>
                  <View style={styles.fibInputRow}>
                    <Text style={styles.styleControlLabel}>{t('Label')}</Text>
                    <TextInput
                      value={elliottWaveLabelDraft}
                      onChangeText={setElliottWaveLabelDraft}
                      onBlur={handleCommitElliottWaveLabel}
                      onSubmitEditing={handleCommitElliottWaveLabel}
                      selectTextOnFocus
                      maxLength={12}
                      placeholder={t('No label')}
                      style={styles.fibTextInput}
                    />
                  </View>
                </View>
              </>
            ) : null}
          </>
        ) : xabcdEditorDrawing ? (
          <>
            <Text style={styles.sectionLabel}>{t('Harmonic pattern')}</Text>
            <View style={styles.panel}>
              {XABCD_PRESETS.map((preset, index) => {
                const active = activeXabcdPresetId === preset.id;
                return (
                  <React.Fragment key={preset.id}>
                    <Pressable
                      style={[styles.fibLevelRow, active && styles.fibLevelRowSelected]}
                      onPress={() => handleApplyXabcdPreset(preset.id)}
                    >
                      <View style={styles.rowLeft}>
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{t(preset.label)}</Text>
                          <Text style={styles.rowSubtitle} numberOfLines={1}>{preset.description}</Text>
                        </View>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={18} color="#2563EB" /> : null}
                    </Pressable>
                    {index < XABCD_PRESETS.length - 1 ? <View style={styles.panelDivider} /> : null}
                  </React.Fragment>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>{t('Leg ratios')}</Text>
            <View style={styles.panel}>
              {xabcdEditorRatios.map((ratio, index) => {
                const leg = XABCD_RATIO_LEGS[index];
                const selected = selectedXabcdRatio?.id === ratio.id;
                const targetText = ratio.target !== null
                  ? `${t('Target')} ${formatXabcdTargetValue(ratio.target)}`
                  : t('No target');
                return (
                  <React.Fragment key={ratio.id}>
                    <Pressable
                      style={[styles.fibLevelRow, selected && styles.fibLevelRowSelected]}
                      onPress={() => setSelectedXabcdRatioId(ratio.id)}
                    >
                      <View style={styles.rowLeft}>
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{leg?.title ?? ratio.id}</Text>
                          <Text style={styles.rowSubtitle} numberOfLines={1}>
                            {leg ? t(leg.description) : ''} | {targetText}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.fibLevelRight}>
                        {selected ? <Ionicons name="checkmark-circle" size={18} color="#2563EB" /> : null}
                        <Switch
                          value={ratio.visible}
                          onValueChange={(visible) => handleUpdateXabcdRatio(ratio.id, { visible })}
                          trackColor={{ false: isDark ? '#1E1E1E' : '#CBD5E1', true: '#3B82F6' }}
                          thumbColor="#FFFFFF"
                        />
                      </View>
                    </Pressable>
                    {index < xabcdEditorRatios.length - 1 ? <View style={styles.panelDivider} /> : null}
                  </React.Fragment>
                );
              })}
            </View>

            <View style={[styles.panel, styles.fibActionPanel]}>
              <Pressable style={styles.fibActionButton} onPress={handleResetXabcdRatios}>
                <Ionicons name="refresh-outline" size={18} color="#2563EB" />
                <Text style={styles.fibActionText}>{t('Reset')}</Text>
              </Pressable>
            </View>

            {selectedXabcdRatio ? (
              <>
                <Text style={styles.sectionLabel}>{t('Selected leg')}</Text>
                <View style={styles.panel}>
                  <View style={styles.fibInputRow}>
                    <Text style={styles.styleControlLabel}>{t('Target')}</Text>
                    <TextInput
                      value={xabcdTargetDraft}
                      onChangeText={setXabcdTargetDraft}
                      onBlur={handleCommitXabcdTarget}
                      onSubmitEditing={handleCommitXabcdTarget}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                      placeholder={t('No target')}
                      style={styles.fibTextInput}
                    />
                  </View>
                </View>
                <Text style={styles.sectionLabel}>
                  {t('Chart shows measured / target; the label turns green when they match within 0.05')}
                </Text>
              </>
            ) : null}
          </>
        ) : positionEditorDrawing && positionPlanValues ? (
          <>
            <Text style={styles.sectionLabel}>{t('Plan summary')}</Text>
            <View style={styles.panel}>
              <View style={styles.fibInputRow}>
                <Text style={styles.styleControlLabel}>{t('Direction')}</Text>
                <Text style={styles.rowTitle}>
                  {positionPlanValues.direction === 'short' ? t('Short') : t('Long')}
                </Text>
              </View>
              <View style={styles.panelDivider} />
              <View style={styles.fibInputRow}>
                <Text style={styles.styleControlLabel}>{t('Risk : reward')}</Text>
                <Text style={styles.rowTitle}>{formatPositionPlanRiskReward(positionPlanValues.riskReward)}</Text>
              </View>
              <View style={styles.panelDivider} />
              <View style={styles.fibInputRow}>
                <Text style={styles.styleControlLabel}>{t('Reward / unit')}</Text>
                <Text style={styles.rowTitle}>{formatPositionPlanNumber(positionPlanValues.rewardPerUnit) || '0'}</Text>
              </View>
              <View style={styles.panelDivider} />
              <View style={styles.fibInputRow}>
                <Text style={styles.styleControlLabel}>{t('Risk / unit')}</Text>
                <Text style={styles.rowTitle}>{formatPositionPlanNumber(positionPlanValues.riskPerUnit) || '0'}</Text>
              </View>
              {positionPlanValues.accountSize !== null ? (
                <>
                  <View style={styles.panelDivider} />
                  <View style={styles.fibInputRow}>
                    <Text style={styles.styleControlLabel}>{t('Risk amount')}</Text>
                    <Text style={styles.rowTitle}>{formatPositionPlanNumber(positionPlanValues.riskAmount, 2)}</Text>
                  </View>
                  <View style={styles.panelDivider} />
                  <View style={styles.fibInputRow}>
                    <Text style={styles.styleControlLabel}>{t('Reward amount')}</Text>
                    <Text style={styles.rowTitle}>
                      {formatPositionPlanNumber(positionPlanValues.rewardAmount, 2) || '—'}
                    </Text>
                  </View>
                  <View style={styles.panelDivider} />
                  <View style={styles.fibInputRow}>
                    <Text style={styles.styleControlLabel}>{t('Position size')}</Text>
                    <Text style={styles.rowTitle}>
                      {formatPositionPlanNumber(positionPlanValues.quantity, 2) || '—'}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>

            <Text style={styles.sectionLabel}>{t('Price levels')}</Text>
            <View style={styles.panel}>
              <View style={styles.fibInputRow}>
                <Text style={styles.styleControlLabel}>{t('Entry')}</Text>
                <TextInput
                  value={positionEntryDraft}
                  onChangeText={setPositionEntryDraft}
                  onBlur={handleCommitPositionEntry}
                  onSubmitEditing={handleCommitPositionEntry}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={styles.fibTextInput}
                />
              </View>
              <View style={styles.panelDivider} />
              <View style={styles.fibInputRow}>
                <Text style={styles.styleControlLabel}>{t('Take Profit')}</Text>
                <TextInput
                  value={positionTargetDraft}
                  onChangeText={setPositionTargetDraft}
                  onBlur={handleCommitPositionTarget}
                  onSubmitEditing={handleCommitPositionTarget}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={styles.fibTextInput}
                />
              </View>
              <View style={styles.panelDivider} />
              <View style={styles.fibInputRow}>
                <Text style={styles.styleControlLabel}>{t('Stop Loss')}</Text>
                <TextInput
                  value={positionStopDraft}
                  onChangeText={setPositionStopDraft}
                  onBlur={handleCommitPositionStop}
                  onSubmitEditing={handleCommitPositionStop}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  placeholder={`${formatPositionPlanNumber(positionPlanValues.stopPrice)} (1:1)`}
                  style={styles.fibTextInput}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>{t('Position sizing')}</Text>
            <View style={styles.panel}>
              <View style={styles.fibInputRow}>
                <Text style={styles.styleControlLabel}>{t('Account size')}</Text>
                <TextInput
                  value={positionAccountDraft}
                  onChangeText={setPositionAccountDraft}
                  onBlur={handleCommitPositionAccount}
                  onSubmitEditing={handleCommitPositionAccount}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  placeholder={t('Optional')}
                  style={styles.fibTextInput}
                />
              </View>
              <View style={styles.panelDivider} />
              <View style={styles.fibInputRow}>
                <Text style={styles.styleControlLabel}>{t('Risk %')}</Text>
                <TextInput
                  value={positionRiskPercentDraft}
                  onChangeText={setPositionRiskPercentDraft}
                  onBlur={handleCommitPositionRiskPercent}
                  onSubmitEditing={handleCommitPositionRiskPercent}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  placeholder="1"
                  style={styles.fibTextInput}
                />
              </View>
            </View>

            <View style={[styles.panel, styles.fibActionPanel]}>
              <Pressable style={styles.fibActionButton} onPress={handleResetPositionPlan}>
                <Ionicons name="refresh-outline" size={18} color="#2563EB" />
                <Text style={styles.fibActionText}>{t('Reset plan')}</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>
              {t('Entry and take profit move the drawing on the chart; stop loss defaults to a 1:1 mirror until set')}
            </Text>
          </>
        ) : styleEditorDrawing && styleEditorValues ? (
          <>
            <Text style={styles.sectionLabel}>{t('Preview')}</Text>
            <View style={[styles.panel, styles.stylePreviewPanel]}>
              <View style={styles.stylePreviewHeader}>
                <View style={styles.stylePreviewCopy}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{styleEditorDrawing.label}</Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {t(DRAWING_TOOL_META[styleEditorDrawing.kind].label)}
                  </Text>
                </View>
                <View style={[styles.styleColorPill, { backgroundColor: styleEditorValues.color }]} />
              </View>
              <View style={styles.stylePreviewLineTrack}>
                <View
                  style={[
                    styles.stylePreviewLine,
                    {
                      borderTopColor: styleEditorValues.color,
                      borderTopWidth: styleEditorValues.width,
                      borderStyle: styleEditorValues.lineStyle,
                      opacity: styleEditorValues.opacity,
                    },
                  ]}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>{t('Color')}</Text>
            <View style={[styles.panel, styles.colorSwatchPanel]}>
              {DRAWING_STYLE_COLOR_SWATCHES.map((color) => {
                const active = color.toLowerCase() === styleEditorValues.color.toLowerCase();
                return (
                  <Pressable
                    key={color}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      color === '#FFFFFF' && styles.colorSwatchLight,
                      active && styles.colorSwatchActive,
                    ]}
                    onPress={() => handleUpdateDrawingStyle({ color })}
                    accessibilityLabel={`Set drawing color ${color}`}
                  >
                    {active ? (
                      <Ionicons name="checkmark" size={18} color={color === '#FFFFFF' ? '#0F172A' : '#FFFFFF'} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>{t('Stroke')}</Text>
            <View style={[styles.panel, styles.styleControlsPanel]}>
              <StyleStepper
                label={t('Width')}
                value={`${styleEditorValues.width}px`}
                onDecrease={() => handleUpdateDrawingStyle({ width: styleEditorValues.width - 1 })}
                onIncrease={() => handleUpdateDrawingStyle({ width: styleEditorValues.width + 1 })}
                styles={styles}
              />
              <View style={styles.panelDivider} />
              <View style={styles.styleControlBlock}>
                <Text style={styles.styleControlLabel}>{t('Pattern')}</Text>
                <StyleSegmentedControl<DrawingStyleLineStyle>
                  options={DRAWING_STYLE_LINE_STYLE_OPTIONS}
                  value={styleEditorValues.lineStyle}
                  onChange={(lineStyle) => handleUpdateDrawingStyle({ lineStyle })}
                  styles={styles}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>{t('Opacity')}</Text>
            <View style={styles.panel}>
              <StyleStepper
                label={t('Opacity')}
                value={formatOpacity(styleEditorValues.opacity)}
                onDecrease={() =>
                  handleUpdateDrawingStyle({ opacity: styleEditorValues.opacity - STYLE_OPACITY_STEP })
                }
                onIncrease={() =>
                  handleUpdateDrawingStyle({ opacity: styleEditorValues.opacity + STYLE_OPACITY_STEP })
                }
                styles={styles}
              />
            </View>

            {styleEditorValues.supportsExtendMode ? (
              <>
                <Text style={styles.sectionLabel}>{t('Extend')}</Text>
                <View style={[styles.panel, styles.styleControlBlock]}>
                  <Text style={styles.styleControlLabel}>{t('Mode')}</Text>
                  <StyleSegmentedControl<DrawingStyleExtendMode>
                    options={DRAWING_STYLE_EXTEND_MODE_OPTIONS}
                    value={styleEditorValues.extendMode}
                    onChange={(extendMode) => handleUpdateDrawingStyle({ extendMode })}
                    styles={styles}
                  />
                </View>
              </>
            ) : null}
          </>
        ) : (
          <>
        <Text style={styles.sectionLabel}>{t('Actions')}</Text>
        <View style={styles.panel}>
          <ActionRow
            label={t('Add object')}
            description={t('Trend line, fib zone, highlight and more')}
            accent="#2563EB"
            Icon={TvTrendLine}
            onPress={handleOpenAddObjectSheet}
            showDivider
            styles={styles}
            isDark={isDark}
          />
          <ActionRow
            label={t('Add text')}
            description={t('Place a text label on the chart')}
            accent="#1D4ED8"
            Icon={TvText}
            onPress={() => handleSelectTool('text')}
            showDivider
            styles={styles}
            isDark={isDark}
          />
          <ActionRow
            label={t('Add text level')}
            description={t('Mark a horizontal price level')}
            accent="#2962FF"
            Icon={TvText}
            onPress={() => handleSelectTool('textLevel')}
            styles={styles}
            isDark={isDark}
          />
        </View>

        <Text style={styles.sectionLabel}>{t('Controls')}</Text>
        <View style={styles.panel}>
          <ToggleRow
            label={t('Locked all')}
            description={t('Prevent object edits on the chart')}
            value={chartLockAll}
            onValueChange={setChartLockAll}
            styles={styles}
            isDark={isDark}
          />
          <View style={styles.panelDivider} />
          <ToggleRow
            label={t('Hidden all')}
            description={t('Hide every drawing on the chart')}
            value={chartHideAll}
            onValueChange={setChartHideAll}
            styles={styles}
            isDark={isDark}
          />
        </View>

        <View style={styles.objectsHeader}>
          <Text style={styles.sectionLabel}>{t('Main chart')}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{displayDrawings.length}</Text>
          </View>
        </View>

        {displayDrawings.length === 0 ? (
          <View style={[styles.panel, styles.emptyPanel]}>
            <Ionicons name="layers-outline" size={36} color={isDark ? '#334155' : '#94A3B8'} />
            <Text style={styles.emptyTitle}>{t('No objects on this chart')}</Text>
            <Text style={styles.emptySubtitle}>{t('Use Add object or Add text to place a new chart object.')}</Text>
          </View>
        ) : (
          <View style={styles.panel}>
            {displayDrawings.map((drawing, index) => {
              const meta = drawing.kind ? DRAWING_TOOL_META[drawing.kind] : null;
              const Icon = meta?.Icon ?? TvTrendLine;
              const accent = meta?.accent ?? '#64748B';
              return (
                <React.Fragment key={drawing.id}>
                  <Pressable
                    style={({ pressed }) => [styles.objectRow, pressed && styles.rowPressed]}
                    onPress={() => setSelectedDrawingId(drawing.id)}
                  >
                    <View style={styles.rowLeft}>
                      <View style={[styles.rowIconWrap, { backgroundColor: `${accent}18` }]}>
                        <Icon color={accent} />
                      </View>
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{drawing.label}</Text>
                        <Text style={styles.rowSubtitle} numberOfLines={1}>{drawing.description}</Text>
                      </View>
                    </View>
                    <View style={styles.objectRowRight}>
                      {drawing.hidden ? (
                        <View style={styles.hiddenPill}>
                          <Text style={styles.hiddenPillText}>{t('Hidden')}</Text>
                        </View>
                      ) : null}
                      {drawing.locked ? (
                        <View style={styles.lockedPill}>
                          <Text style={styles.lockedPillText}>{t('Locked')}</Text>
                        </View>
                      ) : null}
                      <Ionicons
                        name={drawing.locked ? 'lock-closed-outline' : (drawing.hidden ? 'eye-off-outline' : 'eye-outline')}
                        size={18}
                        color={isDark ? '#64748B' : '#94A3B8'}
                      />
                      <Ionicons name="chevron-forward" size={18} color={isDark ? '#475569' : '#94A3B8'} />
                    </View>
                  </Pressable>
                  {index < displayDrawings.length - 1 ? <View style={styles.panelDivider} /> : null}
                </React.Fragment>
              );
            })}
          </View>
        )}

        {displayDrawings.length > 0 ? (
          <Text style={styles.footerHint}>
            {t('Tap an object row for rename, lock, clone, hide, or delete.')}
          </Text>
        ) : null}
          </>
        )}
      </ScrollView>

      <ActionSheet
        visible={showAddObjectSheet}
        onClose={() => setShowAddObjectSheet(false)}
        title={t('Add object')}
        detent="auto"
        instantOpen
        presentation="mt5Plain"
        showActionIcons
        actions={addObjectActions}
      />

      <ActionSheet
        visible={Boolean(selectedDrawing)}
        onClose={() => setSelectedDrawingId(null)}
        title={selectedDrawing?.label ?? t('Object')}
        detent="adaptive"
        instantOpen
        presentation="mt5Plain"
        showActionIcons
        actions={selectedDrawingActions}
      />

      <Modal
        visible={Boolean(renameDrawing)}
        transparent
        animationType="fade"
        onRequestClose={handleCloseRenameDialog}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.renameModalOverlay}
        >
          <Pressable style={styles.renameModalBackdrop} onPress={handleCloseRenameDialog} />
          <View style={styles.renameModalSheet}>
            <Text style={styles.renameModalTitle}>{t('Rename object')}</Text>
            <Text style={styles.renameModalSubtitle} numberOfLines={1}>
              {renameDrawing?.label ?? t('Chart object')}
            </Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              autoFocus
              selectTextOnFocus
              maxLength={64}
              returnKeyType="done"
              onSubmitEditing={handleSubmitRename}
              placeholder={t('Object name')}
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
              style={styles.renameInput}
            />
            <View style={styles.renameModalActions}>
              <Pressable style={styles.renameModalButton} onPress={handleCloseRenameDialog}>
                <Text style={styles.renameModalCancelText}>{t('Cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.renameModalButton, styles.renameModalSaveButton, renameSaveDisabled && styles.renameModalSaveDisabled]}
                onPress={handleSubmitRename}
                disabled={renameSaveDisabled}
              >
                <Text style={[styles.renameModalSaveText, renameSaveDisabled && styles.renameModalSaveTextDisabled]}>
                  {t('Save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
