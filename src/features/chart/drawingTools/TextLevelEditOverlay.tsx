import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FastPressable as Pressable } from '../../../ui/components/FastPressable';

export type TextLevelEditRequest = {
  recordId: string;
  text: string;
};

type TextLevelEditOverlayProps = {
  accentColor: string;
  isDark: boolean;
  onCancel: (recordId: string) => void;
  onCommit: (recordId: string, text: string) => void;
  request: TextLevelEditRequest | null;
};

const sanitizeTextLevelDraft = (value: string): string => {
  const plain = value
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return plain || 'Level';
};

export function TextLevelEditOverlay({
  accentColor,
  isDark,
  onCancel,
  onCommit,
  request,
}: TextLevelEditOverlayProps) {
  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState('Level');

  useEffect(() => {
    if (!request) {
      return;
    }
    setDraft(request.text || 'Level');
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 80);

    return () => clearTimeout(focusTimer);
  }, [request]);

  const visible = request !== null;
  const colors = {
    backdrop: isDark ? 'rgba(2, 6, 23, 0.52)' : 'rgba(15, 23, 42, 0.22)',
    card: isDark ? '#1E1E1E' : '#FFFFFF',
    text: isDark ? '#F8FAFC' : '#111827',
    muted: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? '#263244' : '#E3E8F0',
  };

  const commit = () => {
    if (!request) {
      return;
    }
    Keyboard.dismiss();
    onCommit(request.recordId, sanitizeTextLevelDraft(draft));
  };

  const cancel = () => {
    if (!request) {
      return;
    }
    Keyboard.dismiss();
    onCancel(request.recordId);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.host, { backgroundColor: colors.backdrop }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel} />
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Text Level</Text>
          <TextInput
            ref={inputRef}
            autoCapitalize="sentences"
            autoCorrect={false}
            autoFocus
            maxLength={120}
            returnKeyType="done"
            selectTextOnFocus
            showSoftInputOnFocus
            style={[
              styles.input,
              {
                borderColor: accentColor,
                color: colors.text,
                backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC',
              },
            ]}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commit}
          />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={cancel} style={styles.actionButton}>
              <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={commit}
              style={[styles.doneButton, { backgroundColor: accentColor }]}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
  },
  panel: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '700',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  actionButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  doneButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 82,
    paddingHorizontal: 16,
  },
  doneText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
