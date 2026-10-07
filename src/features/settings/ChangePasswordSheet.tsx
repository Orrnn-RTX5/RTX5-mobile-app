import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Settings Feature UI: ChangePasswordSheet
 * 
 * Secure form component handling the rotation of either the Master or Investor 
 * (read-only) account passwords directly coordinating with the trading server.
 */

import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { View, Text, StyleSheet, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { useIsDarkTheme } from '../../state/themeMode';
import { useMemo, useRef, useState } from 'react';
import { changePasswordAPI } from '../../api/auth';

const MAX_PASSWORD_LENGTH = 15;

const passwordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Must be at least 8 characters')
    .max(MAX_PASSWORD_LENGTH, `Must be at most ${MAX_PASSWORD_LENGTH} characters`)
    .regex(/[A-Z]/, 'Must contain at least 1 uppercase letter')
    .regex(/[a-z]/, 'Must contain at least 1 lowercase letter')
    .regex(/[0-9]/, 'Must contain at least 1 number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least 1 special character'),
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

// Live UI checklist — each rule MUST mirror the zod schema above so the visible
// requirements and the submit-time validation never disagree.
const PASSWORD_REQUIREMENTS: { key: string; label: string; test: (value: string) => boolean }[] = [
  { key: 'length', label: 'Between 8 and 15 characters', test: (v) => v.length >= 8 && v.length <= MAX_PASSWORD_LENGTH },
  { key: 'uppercase', label: 'At least 1 uppercase letter (A–Z)', test: (v) => /[A-Z]/.test(v) },
  { key: 'lowercase', label: 'At least 1 lowercase letter (a–z)', test: (v) => /[a-z]/.test(v) },
  { key: 'number', label: 'At least 1 number (0–9)', test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'At least 1 special character (e.g. !@#$%)', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

interface Props {
  loginId: string;
  type: 'master' | 'investor';
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * A bottom sheet modal allowing the user to securely change their account password.
 */
export function ChangePasswordSheet({ loginId, type, onClose, onSuccess }: Props) {
  const { control, handleSubmit, setError, watch, formState: { errors } } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    mode: 'onChange',
  });

  const newPasswordValue = watch('newPassword') ?? '';
  const oldPasswordValue = watch('oldPassword') ?? '';
  const allRequirementsMet = PASSWORD_REQUIREMENTS.every((req) => req.test(newPasswordValue));
  const canSubmit = allRequirementsMet && oldPasswordValue.length > 0;

  const [isPending, setIsPending] = useState(false);
  const passwordChangeInFlightRef = useRef(false);
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const onSubmit = async (data: PasswordFormValues) => {
    if (passwordChangeInFlightRef.current) {
      return;
    }

    passwordChangeInFlightRef.current = true;
    setIsPending(true);
    try {
      await changePasswordAPI({
        current_password: data.oldPassword,
        new_password: data.newPassword,
      });
      onSuccess();
    } catch (err: any) {
      setError('root.serverError', {
        type: 'manual',
        message: err.message || 'Failed to change password',
      });
    } finally {
      passwordChangeInFlightRef.current = false;
      setIsPending(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
      style={[styles.container, { maxHeight: Math.max(0, height - insets.top - 12) }]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.md) }}
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
      <View style={styles.sheetHeader}>
        <Text style={styles.title}>Change {type === 'master' ? 'Master' : 'Investor'} Password</Text>
        <Pressable hitSlop={15} onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={T.textSub} />
        </Pressable>
      </View>

      <Text style={styles.subtitle}>
        For account #{loginId}. After a successful change, your old {type} password will stop working immediately.
      </Text>

      {errors.root?.serverError && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={T.down} />
          <Text style={styles.errorText}>{errors.root.serverError.message}</Text>
        </View>
      )}

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Current password</Text>
          <View style={styles.inputWrapper}>
            <Controller
              control={control}
              name="oldPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.oldPassword && styles.inputError]}
                  autoCapitalize="none"
                  secureTextEntry={!showOldPassword}
                  placeholder="Enter current password"
                  placeholderTextColor={T.textMuted}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            <Pressable onPress={() => setShowOldPassword(!showOldPassword)} hitSlop={15} style={styles.eyeBtn}>
              <Ionicons name={showOldPassword ? "eye-off-outline" : "eye-outline"} size={20} color={T.textMuted} />
            </Pressable>
          </View>
          {errors.oldPassword && <Text style={styles.fieldError}>{errors.oldPassword.message}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>New password</Text>
          <View style={styles.inputWrapper}>
            <Controller
              control={control}
              name="newPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.newPassword && styles.inputError]}
                  autoCapitalize="none"
                  secureTextEntry={!showNewPassword}
                  maxLength={MAX_PASSWORD_LENGTH}
                  placeholder="Enter new password"
                  placeholderTextColor={T.textMuted}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            <Pressable onPress={() => setShowNewPassword(!showNewPassword)} hitSlop={15} style={styles.eyeBtn}>
              <Ionicons name={showNewPassword ? "eye-off-outline" : "eye-outline"} size={20} color={T.textMuted} />
            </Pressable>
          </View>
          <View style={styles.requirementsList}>
            {PASSWORD_REQUIREMENTS.map((req) => {
              const met = req.test(newPasswordValue);
              // Highlight unmet rules in red once the user has typed something (or
              // tried to submit), neutral grey before they start.
              const showFailed = !met && (newPasswordValue.length > 0 || !!errors.newPassword);
              const color = met ? T.up : showFailed ? T.down : T.textMuted;
              return (
                <View key={req.key} style={styles.requirementRow}>
                  <Ionicons
                    name={met ? 'checkmark-circle' : showFailed ? 'close-circle' : 'ellipse-outline'}
                    size={15}
                    color={color}
                  />
                  <Text style={[styles.requirementText, { color }]}>{req.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <Pressable
          style={[styles.submitBtn, (isPending || !canSubmit) && styles.submitBtnDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={isPending || !canSubmit}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Change Password</Text>
          )}
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.md,
    paddingTop: 8,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: isDark ? 'rgba(148,163,184,0.16)' : 'rgba(15,23,42,0.08)',
  },
  scroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: T.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    color: T.textSub,
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  form: {
    gap: 16,
    paddingBottom: spacing.xl,
  },
  field: {
    gap: 6,
  },
  label: {
    color: T.text,
    fontSize: 13,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F2F6FC',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(148,163,184,0.18)' : '#D1D5DB',
    borderRadius: 12,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: T.text,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  eyeBtn: {
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputError: {
    borderColor: T.downGlow,
  },
  fieldError: {
    color: T.down,
    fontSize: 12,
    marginTop: 2,
  },
  requirementsList: {
    marginTop: 8,
    gap: 5,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  requirementText: {
    fontSize: 12,
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: T.down,
    fontSize: 13,
    flex: 1,
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    flexShrink: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
