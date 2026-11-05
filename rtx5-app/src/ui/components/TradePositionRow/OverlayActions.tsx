import { FastPressable as Pressable } from '../FastPressable';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import type { ThemeColors } from '../../theme/useTheme';
import { CRITICAL_TRADE_ACTION_MAX_LATENCY_MS } from '../../../utils/actionLatency';
import { useTranslation } from '../../../i18n/useTranslation';
import { tradePositionRowStyles as styles } from './styles';

export type OverlayActionsProps = {
  T: ThemeColors;
  isDark: boolean;
  dividerColor: string;
  overlayActionLocked: boolean;
  overlayStyle: any;
  onClose: () => void;
  onModify: () => void;
  onOrderTicket: () => void;
  onOpenChart: () => void;
  onBulk?: () => void;
  onCloseSell?: () => void;
};

export function OverlayActions({
  T,
  isDark,
  dividerColor,
  overlayActionLocked,
  overlayStyle,
  onClose,
  onModify,
  onOrderTicket,
  onOpenChart,
  onBulk,
  onCloseSell,
}: OverlayActionsProps) {
  const { t } = useTranslation();
  return (
    <Animated.View
      style={[
        styles.overlayMenu,
        overlayStyle,
        { backgroundColor: T.glass2, borderLeftColor: dividerColor, zIndex: 100 },
      ]}
    >
      {/*
        Close (and every other overlay action) must fire on press RELEASE, never
        on touch-down. The overlay lives under the row's swipe gesture: a
        swipe-back (left-to-right) that happens to start on this button used to
        close the position instantly on the first touch frame, before the pan
        could claim the movement. Release-based onPress lets the pan activation
        cancel the press, so only a genuine stationary tap submits the close.
      */}
      <Pressable
        hitSlop={0}
        disabled={overlayActionLocked}
        onPress={onClose}
        latencyLabel="tradeRow.closePosition.submit"
        latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
        unstable_pressDelay={0}
        style={({ pressed }) => [
          styles.actionBtnContainer,
          styles.actionBtnPressable,
          overlayActionLocked && styles.actionBtnDisabled,
          pressed && styles.actionBtnPressed,
        ]}
      >
        <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
          <Ionicons name="close" size={20} color={T.down} />
        </View>
      </Pressable>
      <Pressable
        hitSlop={0}
        disabled={overlayActionLocked}
        onPress={onModify}
        unstable_pressDelay={0}
        style={({ pressed }) => [
          styles.actionBtnContainer,
          styles.actionBtnPressable,
          overlayActionLocked && styles.actionBtnDisabled,
          pressed && styles.actionBtnPressed,
        ]}
      >
        <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
          <Ionicons name="create" size={20} color={T.text} />
        </View>
      </Pressable>
      <Pressable
        hitSlop={0}
        disabled={overlayActionLocked}
        onPress={onOrderTicket}
        unstable_pressDelay={0}
        style={({ pressed }) => [
          styles.actionBtnContainer,
          styles.actionBtnPressable,
          overlayActionLocked && styles.actionBtnDisabled,
          pressed && styles.actionBtnPressed,
        ]}
      >
        <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
          <Ionicons name="add" size={20} color={T.text} />
        </View>
      </Pressable>
      <Pressable
        hitSlop={0}
        disabled={overlayActionLocked}
        onPress={onOpenChart}
        unstable_pressDelay={0}
        style={({ pressed }) => [
          styles.actionBtnContainer,
          styles.actionBtnPressable,
          overlayActionLocked && styles.actionBtnDisabled,
          pressed && styles.actionBtnPressed,
        ]}
      >
        <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
          <Ionicons name="bar-chart" size={20} color={T.text} />
        </View>
      </Pressable>
      {onBulk && (
        <Pressable
          hitSlop={0}
          disabled={overlayActionLocked}
          onPress={onBulk}
          unstable_pressDelay={0}
          style={({ pressed }) => [
            styles.actionBtnContainer,
            styles.actionBtnPressable,
            overlayActionLocked && styles.actionBtnDisabled,
            pressed && styles.actionBtnPressed,
          ]}
        >
          <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
            <Ionicons name="layers" size={20} color={T.text} />
          </View>
        </Pressable>
      )}
      {onCloseSell && (
        <Pressable
          hitSlop={0}
          disabled={overlayActionLocked}
          onPress={onCloseSell}
          accessibilityRole="button"
          accessibilityLabel={t('Close Sell Positions')}
          unstable_pressDelay={0}
          style={({ pressed }) => [
            styles.actionBtnContainer,
            styles.actionBtnPressable,
            overlayActionLocked && styles.actionBtnDisabled,
            pressed && styles.actionBtnPressed,
          ]}
        >
          <View style={[styles.actionBtn, { backgroundColor: isDark ? T.glass1 : T.glass2, borderColor: T.border }]}>
            <Ionicons name="arrow-down-circle-outline" size={20} color={T.text} />
          </View>
        </Pressable>
      )}
    </Animated.View>
  );
}
