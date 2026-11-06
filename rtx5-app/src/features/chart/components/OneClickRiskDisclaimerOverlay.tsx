import { Ionicons } from '@expo/vector-icons';
import React, { memo, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from '../../../i18n/useTranslation';
import { FastPressable as Pressable } from '../../../ui/components/FastPressable';

export type OneClickRiskDisclaimerOverlayProps = Readonly<{
  visible: boolean;
  isDark: boolean;
  onCancel: () => void;
  onAccept: () => void;
}>;

export const OneClickRiskDisclaimerOverlay = memo(function OneClickRiskDisclaimerOverlay({
  visible,
  isDark,
  onCancel,
  onAccept,
}: OneClickRiskDisclaimerOverlayProps) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(true);

  useEffect(() => {
    if (visible) {
      setAcknowledged(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel, visible]);

  if (!visible) {
    return null;
  }

  const cardBg = isDark ? '#161A23' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(15, 23, 42, 0.08)';
  const titleColor = isDark ? '#F8FAFC' : '#0F172A';
  const bodyColor = isDark ? '#94A3B8' : '#475569';
  const checkLabelColor = isDark ? '#E2E8F0' : '#1E293B';
  const warningBg = isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB';
  const warningBorder = isDark ? 'rgba(245, 158, 11, 0.28)' : '#FDE68A';
  const warningText = isDark ? '#FCD34D' : '#B45309';
  const warningAccent = isDark ? '#F59E0B' : '#D97706';
  const cancelBg = isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9';
  const cancelText = isDark ? '#CBD5E1' : '#334155';

  return (
    <View style={styles.root} pointerEvents="box-none" testID="one-click-risk-disclaimer-overlay">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Close disclaimer')}
        style={styles.backdrop}
        onPress={onCancel}
        unstable_pressDelay={0}
      />

      <View
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
          },
        ]}
      >
        {/* Compact Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleGroup}>
            <View style={[styles.iconBadge, { backgroundColor: warningBg, borderColor: warningBorder }]}>
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M13.6 2.6L5.6 13.4H11.7L10.4 21.4L18.4 10.6H12.3L13.6 2.6Z"
                  fill={warningAccent}
                  stroke={warningAccent}
                  strokeWidth="0.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            <Text style={[styles.title, { color: titleColor }]}>
              {t('One-Click Trading')}
            </Text>
          </View>

          <View style={[styles.riskPill, { backgroundColor: warningBg, borderColor: warningBorder }]}>
            <Ionicons name="warning" size={11} color={warningAccent} />
            <Text style={[styles.riskPillText, { color: warningText }]}>
              {t('HIGH RISK')}
            </Text>
          </View>
        </View>

        {/* Concise Risk Notice */}
        <Text style={[styles.bodyText, { color: bodyColor }]}>
          {t(
            'Tapping BUY or SELL submits a live market order immediately without secondary confirmation. Orders execute at the prevailing market price and carry high risk from volatility and slippage.',
          )}
        </Text>

        {/* Acknowledgment Checkbox */}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged }}
          accessibilityLabel={t('I understand the high risks and accept the One-Click Trading terms')}
          style={styles.checkboxRow}
          onPress={() => setAcknowledged((prev) => !prev)}
          unstable_pressDelay={0}
        >
          <View
            style={[
              styles.checkboxBox,
              acknowledged
                ? styles.checkboxBoxChecked
                : {
                    borderColor: isDark ? '#475569' : '#94A3B8',
                    backgroundColor: 'transparent',
                  },
            ]}
          >
            {acknowledged ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
          </View>
          <Text style={[styles.checkboxLabel, { color: checkLabelColor }]}>
            {t('I accept these terms and assume full responsibility for instant orders.')}
          </Text>
        </Pressable>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Decline')}
            style={[styles.actionBtn, { backgroundColor: cancelBg }]}
            onPress={onCancel}
            unstable_pressDelay={0}
          >
            <Text style={[styles.cancelBtnText, { color: cancelText }]}>{t('Cancel')}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Accept & Enable')}
            accessibilityState={{ disabled: !acknowledged }}
            disabled={!acknowledged}
            style={[
              styles.actionBtn,
              styles.acceptBtn,
              !acknowledged && styles.acceptBtnDisabled,
            ]}
            onPress={() => {
              if (!acknowledged) return;
              onAccept();
            }}
            unstable_pressDelay={0}
          >
            <Text style={styles.acceptBtnText}>{t('Accept & Enable')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 95,
    elevation: 95,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.62)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flexShrink: 1,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  riskPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 16.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 4,
    marginBottom: 14,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#2962FF',
    borderColor: '#2962FF',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  acceptBtn: {
    backgroundColor: '#2962FF',
  },
  acceptBtnDisabled: {
    opacity: 0.42,
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
