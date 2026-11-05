import { FontAwesome6, Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useNavigation, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BugReportError, loadBugReportOptions,
  submitBugReport, truncateUtf8, utf8Bytes, validateBugReport,
  type BugReportAttachment, type BugReportDraft, type BugReportOption, type BugReportOptions,
  type BugReportSubmission, type BugReportValidationErrors,
} from '../../api/bugReports';
import { useInvestorReadOnlySession } from '../../hooks/useInvestorReadOnlySession';
import { useTranslation } from '../../i18n/useTranslation';
import { subscribeActiveBrokerSession } from '../../state/activeBrokerSession';
import { useIsDarkTheme } from '../../state/themeMode';
import { FastPressable } from '../../ui/components/FastPressable';
import { Screen } from '../../ui/components/Screen';
import { prepareBugReportAttachment, releaseBugReportAttachment } from './bugReportAttachments';
import { bugReportFilePickerErrorMessage, pickBugReportFiles } from './bugReportFilePicker';
import { bugReportDraftScope, clearBugReportDraft, readBugReportDraft, registerBugReportCloseGuard, saveBugReportDraft, takeBugReportContext } from './bugReportRuntime';
import { makeBugReportStyles } from './BugReportScreen.styles';
import { createBugReportSubmissionGate } from './bugReportDraftState';

type Props = Readonly<{ active?: boolean; insetsTop: number; insetsBottom: number; onClose: () => void }>;
type Styles = ReturnType<typeof makeBugReportStyles>;
const subscribeSession = (notify: () => void) => subscribeActiveBrokerSession(() => notify());
const emptyDraft = (): BugReportDraft => ({ title: '', description: '', category: '', severity: '', attachments: [] });
const visibleDraft = (draft: BugReportDraft): BugReportDraft => ({
  ...draft,
  // Removed fields must not be sent or block submission from an older saved draft.
  stepsToReproduce: undefined, expectedBehavior: undefined, actualBehavior: undefined, occurredAt: undefined,
});
const hasContent = (draft: BugReportDraft) => !!(draft.title || draft.description || draft.attachments?.length || draft.classificationEdited);

export function BugReportScreen({ active = true, insetsTop, insetsBottom, onClose }: Props) {
  const { t } = useTranslation();
  const dark = useIsDarkTheme({ active });
  const styles = useMemo(() => makeBugReportStyles(dark), [dark]);
  const router = useRouter(); const navigation = useNavigation(); const pathname = usePathname();
  const sessionScope = useSyncExternalStore(subscribeSession, bugReportDraftScope, bugReportDraftScope);
  const scopeRef = useRef(sessionScope);
  const [draft, setDraft] = useState<BugReportDraft>(() => visibleDraft(readBugReportDraft(sessionScope) ?? { ...emptyDraft(), context: takeBugReportContext(pathname) }));
  const [options, setOptions] = useState<BugReportOptions>();
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsFailure, setOptionsFailure] = useState<BugReportError>();
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [errors, setErrors] = useState<BugReportValidationErrors>({});
  const [failure, setFailure] = useState<BugReportError>();
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [receipt, setReceipt] = useState<BugReportSubmission>();
  const [failedNames, setFailedNames] = useState<string[]>([]);
  const [preview, setPreview] = useState<number>();
  const investor = useInvestorReadOnlySession();
  const [serverReadOnly, setServerReadOnly] = useState(false);
  const busyRef = useRef(createBugReportSubmissionGate()); const confirmationRef = useRef(false);
  const uploadRef = useRef<AbortController | undefined>(undefined); const leavingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const pickingRef = useRef(false);
  const latestDraftRef = useRef(draft); latestDraftRef.current = draft;
  const blocked = submitting || picking || optionsLoading || !options?.enabled || investor || serverReadOnly || sessionScope === 'signed-out' || sessionScope !== scopeRef.current;

  const updateDraft = useCallback((patch: Partial<BugReportDraft>) => {
    setDraft((current) => {
      const next = visibleDraft({ ...current, ...patch });
      saveBugReportDraft(scopeRef.current, next); return next;
    });
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; uploadRef.current?.abort(); };
  }, []);
  useEffect(() => {
    if (sessionScope === 'signed-out' || sessionScope === scopeRef.current) return;
    saveBugReportDraft(scopeRef.current, latestDraftRef.current);
    scopeRef.current = sessionScope;
    setDraft(visibleDraft(readBugReportDraft(sessionScope) ?? { ...emptyDraft(), context: takeBugReportContext(pathname) }));
    setReceipt(undefined); setFailure(undefined); setErrors({}); setServerReadOnly(false);
    setPreview(undefined);
  }, [sessionScope, pathname]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController(); const requestScope = sessionScope;
    setOptions(undefined); setOptionsLoading(true); setOptionsFailure(undefined);
    void loadBugReportOptions(undefined, { signal: controller.signal }).then((loaded) => {
      if (controller.signal.aborted || requestScope !== bugReportDraftScope()) return;
      setOptions(loaded);
      const chooseDefault = (values: readonly BugReportOption[], preferred: string, current: string) => values.some((v) => v.value === current) ? current : values.find((v) => v.value === preferred)?.value ?? values[0]?.value ?? '';
      updateDraft({ category: chooseDefault(loaded.categories, 'other', latestDraftRef.current.category), severity: chooseDefault(loaded.severities, 'medium', latestDraftRef.current.severity) });
    }).catch((error) => {
      if (!controller.signal.aborted) setOptionsFailure(error instanceof BugReportError ? error : new BugReportError('server', 'The report options could not be loaded. Please retry.'));
    }).finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [active, optionsAttempt, sessionScope, updateDraft]);

  const discardAndClose = useCallback((close: () => void) => {
    clearBugReportDraft(scopeRef.current);
    latestDraftRef.current.attachments?.forEach(releaseBugReportAttachment);
    leavingRef.current = true; close();
  }, []);
  const requestClose = useCallback((close = onClose) => {
    if (busyRef.current.isBusy()) {
      Alert.alert(t('Sending report'), t('Cancel the upload? Acceptance may be uncertain.'), [
        { text: t('Keep sending'), style: 'cancel' }, { text: t('Cancel upload'), onPress: () => uploadRef.current?.abort() },
      ]); return;
    }
    if (picking) return;
    if (!receipt && hasContent(latestDraftRef.current)) {
      Alert.alert(t('Discard report draft?'), t('Your text and selected attachments will be removed.'), [
        { text: t('Keep draft'), style: 'cancel' }, { text: t('Discard'), style: 'destructive', onPress: () => discardAndClose(close) },
      ]); return;
    }
    leavingRef.current = true; close();
  }, [discardAndClose, onClose, picking, receipt, t]);
  useEffect(() => {
    if (!active) return;
    const unregister = registerBugReportCloseGuard(() => requestClose());
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { requestClose(); return true; });
    return () => { unregister(); subscription.remove(); };
  }, [active, requestClose]);
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (!active || leavingRef.current) return;
    event.preventDefault(); requestClose(() => navigation.dispatch(event.data.action));
  }), [active, navigation, requestClose]);
  useEffect(() => navigation.addListener('focus', () => { leavingRef.current = false; }), [navigation]);
  const signIn = () => {
    saveBugReportDraft(scopeRef.current, latestDraftRef.current);
    leavingRef.current = true; router.push('/login');
  };

  const addAssets = async (assets: Array<{ uri: string; name: string; file?: globalThis.File }>) => {
    if (!options) return;
    const startScope = scopeRef.current;
    const currentDraft = latestDraftRef.current;
    const prepared: BugReportAttachment[] = [];
    try {
      if ((currentDraft.attachments?.length ?? 0) + assets.length > options.maxAttachments) throw new BugReportError('validation', `Choose no more than ${options.maxAttachments} attachments.`);
      for (const asset of assets) prepared.push(await prepareBugReportAttachment(asset, options));
      const next = [...(currentDraft.attachments ?? []), ...prepared];
      // New files require review; temporarily mark them reviewed for size validation.
      const error = validateBugReport({ ...currentDraft, attachments: next.map((file) => ({ ...file, reviewed: true })) }, options).attachments;
      if (error) throw new BugReportError('validation', error);
      if (!mountedRef.current || scopeRef.current !== startScope) { prepared.forEach(releaseBugReportAttachment); return; }
      updateDraft({ attachments: next }); setErrors((current) => ({ ...current, attachments: undefined }));
      if (prepared.length) setPreview(next.length - prepared.length);
    } catch (error) {
      prepared.forEach(releaseBugReportAttachment);
      if (mountedRef.current) Alert.alert(t('Attachment not added'), t(error instanceof BugReportError ? error.message : 'The file could not be read. Try another file.'));
    }
  };
  const chooseFiles = async () => {
    if (pickingRef.current || busyRef.current.isBusy() || !options?.enabled) return;
    pickingRef.current = true; setPicking(true);
    const startScope = scopeRef.current;
    try {
      Keyboard.dismiss();
      const result = await pickBugReportFiles();
      if (!result.canceled && mountedRef.current && scopeRef.current === startScope) await addAssets(result.assets);
    } catch (error) { if (mountedRef.current) Alert.alert(t('Could not open files'), t(bugReportFilePickerErrorMessage(error))); }
    finally { pickingRef.current = false; if (mountedRef.current) setPicking(false); }
  };

  const submit = async () => {
    if (busyRef.current.isBusy() || pickingRef.current || blocked || !options) return;
    const snapshot = visibleDraft(latestDraftRef.current); const requestScope = scopeRef.current;
    const nextErrors = validateBugReport(snapshot, options); setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { Keyboard.dismiss(); scrollRef.current?.scrollTo({ y: 0, animated: true }); return; }
    // Lock before any asynchronous preflight, including NetInfo.
    await busyRef.current.run(async () => {
      setSubmitting(true); setProgress(0); setFailure(undefined);
      const controller = new AbortController(); uploadRef.current = controller;
      try {
        const network = await NetInfo.fetch().catch(() => null);
        if (controller.signal.aborted) return;
        if (network && (network.isConnected === false || network.isInternetReachable === false)) throw new BugReportError('offline', 'You are offline. Reconnect before sending.');
        if (requestScope !== bugReportDraftScope()) throw new BugReportError('unauthorized', 'The active session changed. Your draft is saved.');
        const result = await submitBugReport(snapshot, { formOptions: options, signal: controller.signal, onUploadProgress: setProgress });
        clearBugReportDraft(requestScope);
        snapshot.attachments?.forEach(releaseBugReportAttachment);
        if (!mountedRef.current || requestScope !== scopeRef.current) return;
        setFailedNames(result.failedAttachments.map((ordinal) => `${ordinal}. ${snapshot.attachments?.[ordinal - 1]?.name ?? ''}`));
        setReceipt(result); setDraft(emptyDraft());
      } catch (error) {
        if (!mountedRef.current || requestScope !== scopeRef.current) return;
        const problem = error instanceof BugReportError ? error : new BugReportError('uncertain', 'Acceptance could not be confirmed. Retrying could create a duplicate.');
        setFailure(problem);
        if (problem.kind === 'read-only') setServerReadOnly(true);
        if (problem.kind === 'disabled') setOptions((current) => current ? { ...current, enabled: false } : current);
      } finally {
        uploadRef.current = undefined;
        if (mountedRef.current) setSubmitting(false);
      }
    });
  };
  const confirmSubmit = () => {
    if (busyRef.current.isBusy() || blocked || confirmationRef.current) return;
    if (failure?.kind !== 'uncertain') { void submit(); return; }
    confirmationRef.current = true;
    Alert.alert(t('Retry this report?'), t('The previous report may already exist. Retrying could create a duplicate.'), [
      { text: t('Keep draft'), style: 'cancel', onPress: () => { confirmationRef.current = false; } },
      { text: t('Retry anyway'), onPress: () => { confirmationRef.current = false; void submit(); } },
    ], { cancelable: true, onDismiss: () => { confirmationRef.current = false; } });
  };
  const textField = (key: 'title' | 'description', label: string, placeholder: string, limit?: number, multiline = false) => (
    <View style={styles.field}>
      <Text style={styles.label}>{t(label)}</Text>
      <TextInput accessibilityLabel={t(label)} value={draft[key] ?? ''} editable={!submitting && !picking} placeholder={t(placeholder)} placeholderTextColor={styles.placeholder.color}
        style={[styles.input, multiline && styles.multiline, !!errors[key] && styles.inputError]} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'}
        onChangeText={(value) => {
          updateDraft({ [key]: limit ? truncateUtf8(value, limit) : value }); setErrors((current) => ({ ...current, [key]: undefined }));
        }} />
      {limit ? <Text style={styles.fieldHelp}>{utf8Bytes(draft[key] ?? '')}/{limit}</Text> : null}
      {errors[key] ? <Text style={styles.error}>{t(errors[key]!)}</Text> : null}
    </View>
  );
  const files = draft.attachments ?? []; const previewFile = preview === undefined ? undefined : files[preview];
  return <Screen noBottomInset style={styles.screen}>
    <View style={[styles.header, { paddingTop: insetsTop + 6 }]}>
      <FastPressable onPress={() => requestClose()} activateOnPressIn style={styles.back} accessibilityRole="button" accessibilityLabel={t('Go back')}><Ionicons name="arrow-back" size={22} color={styles.headerTitle.color} /></FastPressable>
      <Text style={styles.headerTitle}>{t('Report a Bug')}</Text><View style={styles.headerSpacer} />
    </View>
    {receipt ? <>
      <ScrollView contentContainerStyle={styles.successContent} keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'}>
        <View style={styles.successIcon}><Ionicons name="checkmark" size={36} color={styles.successTitle.color} /></View>
        <Text style={styles.successTitle}>{t('Bug report submitted')}</Text>
        {failedNames.length ? <><Text style={styles.successHelp}>{t('Your report was submitted, but some attachments could not be uploaded.')}</Text><Text style={styles.help}>{failedNames.join('\n')}</Text></> : null}
        <View style={styles.referenceCard}><Text style={styles.metaLabel}>{t('REPORT REFERENCE')}</Text><Text selectable style={styles.reportId}>{receipt.reportId}</Text>
          <FastPressable style={styles.back} onPress={() => void import('expo-clipboard').then((Clipboard) => Clipboard.setStringAsync(receipt.reportId)).catch(() => Alert.alert(t('Copy report ID'), t('Select the report ID to copy it.')))} accessibilityRole="button" accessibilityLabel={t('Copy report ID')}><Ionicons name="copy-outline" color={styles.accent.color} size={24} /></FastPressable>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insetsBottom, 12) }]}><FastPressable onPress={() => requestClose()} style={styles.send}><Text style={styles.sendText}>{t('Done')}</Text></FastPressable></View>
    </> : <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'} keyboardDismissMode="on-drag">
        <View style={styles.intro}>
          <Text style={styles.introHelp}>{t('Tell us what went wrong so we can help.')}</Text>
        </View>
        {optionsLoading ? <View style={styles.loading} accessibilityLiveRegion="polite"><ActivityIndicator color={styles.accent.color} /><Text style={[styles.help, styles.flex]}>{t('Loading report options...')}</Text></View> : null}
        {optionsFailure ? <View style={styles.errorPanel}><Text style={styles.error}>{t(optionsFailure.message)}</Text><FastPressable onPress={() => setOptionsAttempt((n) => n + 1)} style={styles.attach}><Text style={styles.attachTitle}>{t('Retry options')}</Text></FastPressable>{optionsFailure.kind === 'unauthorized' ? <FastPressable onPress={signIn} style={styles.attach}><Text style={styles.attachTitle}>{t('Sign in')}</Text></FastPressable> : null}</View> : null}
        {options && !options.enabled ? <Text style={styles.error}>{t('Bug reporting is unavailable for this broker.')}</Text> : null}
        {investor || serverReadOnly ? <Text style={styles.error}>{t('Investor sessions are read-only and cannot submit reports.')}</Text> : null}
        <View style={styles.card}>
          {textField('title', 'Title, required', 'Briefly describe the issue', 200)}
          {textField('description', 'Description, required', 'What happened?', 8000, true)}
          <View style={styles.selectorGroup}>
            <Options label={t('Category')} items={(options?.categories ?? []).map((item) => ({ ...item, label: t(item.label) }))} value={draft.category} onChange={(category) => updateDraft({ category, classificationEdited: true })} error={errors.category && t(errors.category)} disabled={submitting || !options?.enabled} active={active} styles={styles} />
            <View style={styles.selectorDivider} />
            <Options label={t('Severity')} items={(options?.severities ?? []).map((item) => ({ ...item, label: t(item.label) }))} value={draft.severity} onChange={(severity) => updateDraft({ severity, classificationEdited: true })} error={errors.severity && t(errors.severity)} disabled={submitting || !options?.enabled} active={active} styles={styles} />
          </View>
        </View>
        <View style={styles.sectionDivider}>
          {files.map((file, index) => <View key={`${file.uri}-${index}`} style={styles.file}>
            <View style={styles.fileIcon}><Ionicons name={file.reviewed ? 'checkmark-circle-outline' : file.mimeType.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={22} color={styles.accent.color} accessible={false} /></View>
            <FastPressable disabled={submitting || picking} style={[styles.flex, { paddingVertical: 12 }]} onPress={() => setPreview(index)} accessibilityRole="button" accessibilityLabel={`${t('Preview')} ${file.name}`}>
              <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">{file.name}</Text><Text style={styles.fileSize}>{(file.size / 1_048_576).toFixed(2)} MiB · {t(file.reviewed ? 'Reviewed' : 'Review required')}</Text>
            </FastPressable>
            <FastPressable disabled={submitting || picking} onPress={() => { releaseBugReportAttachment(file); updateDraft({ attachments: files.filter((_, i) => i !== index) }); }} style={styles.removeFile} accessibilityRole="button" accessibilityLabel={`${t('Remove')} ${file.name}`}><Ionicons name="close" size={20} color={styles.help.color} /></FastPressable>
          </View>)}
          <FastPressable disabled={!options?.enabled || submitting || picking || files.length >= (options?.maxAttachments ?? 0)} onPress={() => void chooseFiles()} style={styles.attach} accessibilityRole="button"><FontAwesome6 name="cloud-arrow-up" solid size={22} color={styles.accent.color} /><Text style={styles.attachTitle}>{t('Upload files')}</Text></FastPressable>
          {picking ? <ActivityIndicator color={styles.accent.color} /> : null}
          {errors.attachments ? <Text style={styles.error}>{t(errors.attachments)}</Text> : null}
        </View>
        {failure ? <View style={styles.errorPanel} accessibilityLiveRegion="polite"><Text style={styles.error}>{t(failure.message)}</Text>{failure.kind === 'unauthorized' ? <FastPressable onPress={signIn} style={styles.attach}><Text style={styles.attachTitle}>{t('Sign in')}</Text></FastPressable> : null}</View> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insetsBottom, 12) }]}>
        {submitting ? <>
          <View style={styles.uploadStatus}>
            <Text style={[styles.help, styles.flex]}>{t(progress >= 1 ? 'Waiting for receipt...' : 'Sending report')} {Math.round(progress * 100)}%</Text>
            <FastPressable onPress={() => requestClose()} style={styles.back} accessibilityLabel={t('Cancel upload')}><Ionicons name="close" size={22} color={styles.help.color} /></FastPressable>
          </View>
          <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
        </> : null}
        <FastPressable disabled={blocked} onPress={confirmSubmit} style={[styles.send, blocked && styles.disabled]} accessibilityRole="button" accessibilityState={{ disabled: blocked, busy: submitting }}>
          {submitting ? <ActivityIndicator color="#FFF" /> : null}<Text style={styles.sendText}>{t(submitting ? 'Sending report...' : failure?.kind === 'uncertain' ? 'Retry report' : 'Submit report')}</Text>
        </FastPressable>
      </View>
    </KeyboardAvoidingView>}
    <Modal visible={!!previewFile && active} onRequestClose={() => setPreview(undefined)} animationType="none">
      <View style={[styles.screen, { paddingTop: Math.max(insetsTop, 0) + 8, paddingBottom: Math.max(insetsBottom, 12) }]}>
        <View style={styles.header}><Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="middle">{previewFile?.name}</Text><FastPressable onPress={() => setPreview(undefined)} style={styles.back} accessibilityLabel={t('Close preview')}><Ionicons name="close" size={24} color={styles.help.color} /></FastPressable></View>
        <Text style={[styles.help, { padding: 16 }]}>{t('Check the complete file for sensitive information. Remove it if you cannot safely share it.')}</Text>
        {previewFile?.mimeType === 'text/plain' ? <ScrollView style={styles.flex} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'}><Text selectable style={styles.help}>{previewFile.textPreview}</Text></ScrollView> : <Image source={{ uri: previewFile?.uri }} resizeMode="contain" style={styles.flex} accessibilityLabel={t('Attachment preview')} />}
        <View style={styles.previewActions}>
          <FastPressable style={styles.send} onPress={() => {
            updateDraft({ attachments: files.map((file, i) => i === preview ? { ...file, reviewed: true } : file) });
            setPreview(undefined); setErrors((current) => ({ ...current, attachments: undefined }));
          }}><Text style={styles.sendText}>{t('Reviewed, safe to attach')}</Text></FastPressable>
          <FastPressable style={styles.attach} onPress={() => { if (previewFile) releaseBugReportAttachment(previewFile); updateDraft({ attachments: files.filter((_, i) => i !== preview) }); setPreview(undefined); }}><Text style={styles.attachTitle}>{t('Remove attachment')}</Text></FastPressable>
        </View>
      </View>
    </Modal>
  </Screen>;
}

function Options({ label, items, value, onChange, error, disabled, active, styles }: {
  label: string; items: readonly BugReportOption[]; value: string; onChange: (value: string) => void;
  error?: string; disabled: boolean; active: boolean; styles: Styles;
}) {
  const { t } = useTranslation(); const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets(); const { height } = useWindowDimensions();
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  const selected = items.find((item) => item.value === value);
  return <View>
    <FastPressable disabled={disabled} onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={[styles.selectorRow, disabled && styles.disabled]} accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label ?? ''}`} accessibilityState={{ disabled, expanded: open }}>
      <Text style={styles.selectorLabel}>{label}</Text><Text style={[styles.selectorValue, styles.flex]} numberOfLines={1}>{selected?.label ?? t('Select')}</Text><Ionicons name="chevron-down" size={16} color={styles.help.color} />
    </FastPressable>{error ? <Text style={styles.selectorError}>{error}</Text> : null}
    <Modal visible={active && open && !disabled} transparent animationType="none" onRequestClose={() => setOpen(false)}>
      <View style={[styles.modal, { paddingTop: insets.top + 12 }]}>
        <FastPressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel={t('Close selection')} />
        <View style={[styles.sheet, { maxHeight: height - insets.top - 12, paddingBottom: Math.max(insets.bottom, 16) }]} accessibilityViewIsModal>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{label}</Text><FastPressable onPress={() => setOpen(false)} style={styles.back}><Ionicons name="close" size={22} color={styles.headerTitle.color} /></FastPressable></View>
          <ScrollView contentContainerStyle={styles.sheetOptions} keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'}>
            {items.map((item) => <FastPressable key={item.value} onPress={() => { onChange(item.value); setOpen(false); }} style={[styles.optionRow, value === item.value && styles.optionSelected]} accessibilityRole="radio" accessibilityState={{ checked: value === item.value }}><Text style={[styles.optionText, value === item.value && styles.selectedText]}>{item.label}</Text><Ionicons name={value === item.value ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={styles.accent.color} /></FastPressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
