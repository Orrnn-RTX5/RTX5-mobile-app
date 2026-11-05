import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n/useTranslation';
import { FastPressable } from '../../ui/components/FastPressable';
import { OVERLAY_MODAL_PROPS } from '../../ui/overlayModalProps';
import { useTheme } from '../../ui/theme/useTheme';

const MAX_QUESTION_LENGTH = 2000;
const MAX_TITLE_LENGTH = 120;

export type HelpQuestionDraft = { title: string; question: string };

export function HelpQuestionForm({ visible, onClose, onSubmitQuestion }: {
  visible: boolean;
  onClose: () => void;
  /** Resolve only after the backend has confirmed acceptance. */
  onSubmitQuestion?: (draft: HelpQuestionDraft) => Promise<void>;
}) {
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Preserve the draft when closing the form or when submission fails.
  const [questionTitle, setQuestionTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const titleInputRef = useRef<TextInput>(null);
  const questionInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const questionFocusedRef = useRef(false);
  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bgRoot },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
    close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, color: T.text, fontSize: 20, fontWeight: '500' },
    content: { padding: 20, gap: 16 },
    body: { color: T.textSub, fontSize: 14, lineHeight: 21 },
    label: { color: T.text, fontSize: 14, fontWeight: '600' },
    input: { minHeight: 150, maxHeight: 240, borderWidth: 1, borderColor: T.border, borderRadius: 8, backgroundColor: T.glass1, color: T.text, padding: 12, fontSize: 16, textAlignVertical: 'top' },
    titleInput: { minHeight: 48, maxHeight: undefined, textAlignVertical: 'center' },
    count: { color: T.textMuted, fontSize: 12, textAlign: 'right' },
    button: { minHeight: 48, padding: 14, borderRadius: 8, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', textAlign: 'center' },
    disabled: { opacity: 0.45 },
    feedback: { color: T.textSub, fontSize: 14, lineHeight: 21 },
    success: { alignItems: 'center', gap: 16, paddingVertical: 24 },
    successTitle: { color: T.text, fontSize: 22, fontWeight: '600' },
  }), [T]);

  const submitQuestion = async () => {
    if (!questionTitle.trim() || !question.trim() || submittingRef.current || submitted) return;
    if (!onSubmitQuestion) {
      setFeedback('Question submission is currently unavailable. Your draft has been kept.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setFeedback(null);
    Keyboard.dismiss();
    try {
      await onSubmitQuestion({ title: questionTitle.trim(), question: question.trim() });
      setSubmitted(true);
      setQuestionTitle('');
      setQuestion('');
    } catch {
      setFeedback('Could not confirm submission. Your draft has been kept. Please try again later.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!visible) return null;
  const disabled = !questionTitle.trim() || !question.trim() || submitting;
  const closeForm = () => {
    if (submittingRef.current) return;
    setSubmitted(false);
    onClose();
  };
  return (
    <Modal {...OVERLAY_MODAL_PROPS} visible animationType="none" onRequestClose={closeForm} onShow={() => { if (!submitted) titleInputRef.current?.focus(); }}>
      <KeyboardAvoidingView style={[styles.screen, { paddingLeft: insets.left, paddingRight: insets.right }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <FastPressable onPress={closeForm} disabled={submitting} style={styles.close} accessibilityRole="button" accessibilityLabel={t('Close')} latencyLabel="help.question.close">
            <Ionicons name="close" size={24} color={T.text} />
          </FastPressable>
          <Text style={styles.title}>{t('Ask a question')}</Text>
        </View>
        <ScrollView
          ref={scrollRef}
          onLayout={() => { if (questionFocusedRef.current) scrollRef.current?.scrollToEnd({ animated: true }); }}
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        >
          {submitted ? (
            <View style={styles.success} accessibilityLiveRegion="polite">
              <Ionicons name="checkmark-circle-outline" size={56} color={T.accent} />
              <Text style={styles.successTitle}>{t('Submitted')}</Text>
              <Text style={styles.body}>{t('Your question has been submitted successfully.')}</Text>
              <FastPressable onPress={closeForm} style={styles.button} accessibilityRole="button" latencyLabel="help.question.done">
                <Text style={styles.buttonText}>{t('Done')}</Text>
              </FastPressable>
            </View>
          ) : <>
          <Text style={styles.body}>{t('Enter a title and your question, then tap Submit.')}</Text>
          <Text style={styles.label}>{t('Title')}</Text>
          <TextInput
            ref={titleInputRef}
            value={questionTitle}
            editable={!submitting}
            onChangeText={(value) => { setQuestionTitle(value); setFeedback(null); }}
            onFocus={() => { questionFocusedRef.current = false; scrollRef.current?.scrollTo({ y: 0, animated: true }); }}
            onSubmitEditing={() => questionInputRef.current?.focus()}
            style={[styles.input, styles.titleInput]}
            placeholder={t('Enter a short title')}
            placeholderTextColor={T.textMuted}
            accessibilityLabel={t('Title')}
            maxLength={MAX_TITLE_LENGTH}
            returnKeyType="next"
            submitBehavior="submit"
            selectionColor={T.accent}
          />
          <Text style={styles.label}>{t('Question')}</Text>
          <TextInput
            ref={questionInputRef}
            value={question}
            editable={!submitting}
            onChangeText={(value) => { setQuestion(value); setFeedback(null); }}
            onFocus={() => { questionFocusedRef.current = true; scrollRef.current?.scrollToEnd({ animated: true }); }}
            onBlur={() => { questionFocusedRef.current = false; }}
            style={styles.input}
            placeholder={t('What would you like help with?')}
            placeholderTextColor={T.textMuted}
            accessibilityLabel={t('Question')}
            multiline
            maxLength={MAX_QUESTION_LENGTH}
            selectionColor={T.accent}
          />
          <Text style={styles.count}>{question.length}/{MAX_QUESTION_LENGTH}</Text>
          <FastPressable onPress={() => { void submitQuestion(); }} disabled={disabled} style={[styles.button, disabled && styles.disabled]} accessibilityRole="button" accessibilityState={{ disabled, busy: submitting }} latencyLabel="help.question.submit">
            <Text style={styles.buttonText}>{t(submitting ? 'Submitting...' : 'Submit')}</Text>
          </FastPressable>
          {feedback ? (
            <Text style={styles.feedback} accessibilityLiveRegion="polite">
              {t(feedback)}
            </Text>
          ) : null}
          </>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
