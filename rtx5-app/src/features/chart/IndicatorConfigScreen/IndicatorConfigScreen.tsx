import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Chart Feature UI: IndicatorConfigScreen
 *
 * MT5-style indicator configuration screen. Parameters, Style, Levels,
 * and Visualization sections — each style line and level opens its own
 * dedicated editor screen, mirroring MT5's mobile flow.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../../ui/components/Screen';
import { useIsDarkTheme } from '../../../state/themeMode';
import { useTranslation } from '../../../i18n/useTranslation';
import { useTheme } from '../../../ui/theme/useTheme';
import { safeRouterBack } from '../../../utils/navigation';
import { useIndicatorEditState } from '../indicatorEditState';
import { getIndicatorMeta } from '../indicatorRegistry';
import { ConfigBody } from './ConfigBody';
import { makeIndicatorConfigStyles } from './styles';

export function IndicatorConfigScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();

  const meta = useMemo(() => getIndicatorMeta(id as string), [id]);
  const initialize = useIndicatorEditState((s) => s.initialize);
  const clear = useIndicatorEditState((s) => s.clear);
  const editMeta = useIndicatorEditState((s) => s.meta);

  useEffect(() => {
    if (meta && (!editMeta || editMeta.id !== meta.id)) {
      initialize(meta);
    }
  }, [meta, editMeta, initialize]);

  const bgColor = T.bg;
  const styles = useMemo(() => makeIndicatorConfigStyles(bgColor, isDark, T), [bgColor, isDark, T]);

  if (!meta) {
    return (
      <Screen style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 8 }]}>
          <Pressable
            onPress={() => safeRouterBack(router, '/chart/indicators')}
            activateOnPressIn
            hitSlop={16}
            style={styles.headerBackBtn}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle}>{t('Unknown')}</Text>
          </View>
          <View style={styles.headerBackBtn} />
        </View>
      </Screen>
    );
  }

  return (
    <ConfigBody
      metaId={meta.id}
      styles={styles}
      isDark={isDark}
      insets={insets}
      T={T}
      onDone={() => {
        clear();
        safeRouterBack(router, '/(tabs)/chart');
      }}
    />
  );
}
