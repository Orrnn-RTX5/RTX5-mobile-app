import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { PRICE_WHEEL_ROW_HEIGHT, priceAtWheelOffset, priceWheelRange } from './priceWheel';

type Props = {
  value: number; step: number; decimals: number; min?: number; max?: number; label: string;
  textStyle?: StyleProp<TextStyle>; selectionStyle?: StyleProp<ViewStyle>; children?: React.ReactNode;
  onChange: (value: number) => void; onScrollStart: () => void;
};

/** A native snapping wheel. Scrolling edits the draft; the popup owns OK/Cancel. */
export function PriceScrollWheel(props: Props) {
  const latest = useRef(props); latest.current = props;
  const [range, setRange] = useState(() => priceWheelRange(props.value, props.step, props.decimals, props.min, props.max));
  const rangeRef = useRef(range);
  const [selected, setSelected] = useState(range?.index ?? 0);
  const scroll = useRef<ScrollView>(null);
  const scrolling = useRef(false);
  const emitted = useRef(props.value);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSettle = () => { if (settleTimer.current) clearTimeout(settleTimer.current); settleTimer.current = null; };
  const reset = (value: number) => {
    const p = latest.current;
    const next = priceWheelRange(value, p.step, p.decimals, p.min, p.max);
    rangeRef.current = next; setRange(next); setSelected(next?.index ?? 0);
    scroll.current?.scrollTo({ y: (next?.index ?? 0) * PRICE_WHEEL_ROW_HEIGHT, animated: false });
  };
  useEffect(() => {
    const current = rangeRef.current;
    if (props.value === emitted.current && current?.step === props.step && current?.digits === props.decimals
      && current?.min === props.min && current?.max === props.max) return;
    clearSettle(); scrolling.current = false; emitted.current = props.value; reset(props.value);
  }, [props.value, props.step, props.decimals, props.min, props.max]);
  useEffect(() => () => { clearSettle(); scrolling.current = false; }, []);
  const update = (offset: number) => {
    if (!scrolling.current || !rangeRef.current) return;
    const next = priceAtWheelOffset(rangeRef.current, offset);
    setSelected(next.index);
    if (next.value === emitted.current) return;
    emitted.current = next.value;
    latest.current.onChange(next.value);
  };
  const settle = (offset: number) => {
    if (!scrolling.current) return;
    clearSettle(); update(offset); scrolling.current = false;
    // Recenter after each gesture so repeated scrolls have no artificial range limit.
    reset(emitted.current);
  };
  const endDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.y;
    update(offset); clearSettle();
    settleTimer.current = setTimeout(() => settle(offset), 150);
  };
  return <View style={styles.viewport} accessibilityRole="adjustable" accessibilityLabel={props.label}
    accessibilityHint="Scroll up or down to select a price"
    // Preserve the decimal price without sending it to Fabric's integer fields.
    accessibilityValue={{ text: String(props.value) }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={event => {
      const direction = event.nativeEvent.actionName === 'increment' ? 1 : event.nativeEvent.actionName === 'decrement' ? -1 : 0;
      if (!direction) return;
      const p = latest.current;
      const current = priceWheelRange(p.value, p.step, p.decimals, p.min, p.max);
      if (!current) return;
      p.onScrollStart();
      const next = priceAtWheelOffset(current, (current.index + direction) * PRICE_WHEEL_ROW_HEIGHT).value;
      emitted.current = next; p.onChange(next); reset(next);
    }}>
    <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.content}
      contentOffset={{ x: 0, y: (range?.index ?? 0) * PRICE_WHEEL_ROW_HEIGHT }}
      showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" nestedScrollEnabled
      snapToInterval={PRICE_WHEEL_ROW_HEIGHT} decelerationRate="fast" scrollEventThrottle={16}
      keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'} keyboardDismissMode="on-drag" scrollEnabled={Boolean(range)}
      onLayout={() => { if (!scrolling.current) scroll.current?.scrollTo({ y: (rangeRef.current?.index ?? 0) * PRICE_WHEEL_ROW_HEIGHT, animated: false }); }}
      onScrollBeginDrag={() => { clearSettle(); scrolling.current = true; latest.current.onScrollStart(); }}
      onScroll={event => update(event.nativeEvent.contentOffset.y)} onScrollEndDrag={endDrag}
      onMomentumScrollBegin={clearSettle} onMomentumScrollEnd={event => settle(event.nativeEvent.contentOffset.y)}>
      {range ? Array.from({ length: range.last - range.first + 1 }, (_, index) =>
        <View key={index} style={styles.row}>
          {index === selected && props.children ? props.children
            : <Text style={[props.textStyle, index === selected && styles.selected]} maxFontSizeMultiplier={1.4}>
              {Number(((range.first + index) * range.step).toFixed(range.digits)).toFixed(range.digits)}
            </Text>}
        </View>) : <View style={styles.row}>{props.children}</View>}
    </ScrollView>
    <View pointerEvents="none" style={[styles.selection, props.selectionStyle]} />
  </View>;
}

const styles = StyleSheet.create({
  viewport: { height: PRICE_WHEEL_ROW_HEIGHT * 3, width: '100%', overflow: 'hidden' },
  scroll: { flex: 1 },
  content: { paddingVertical: PRICE_WHEEL_ROW_HEIGHT },
  row: { height: PRICE_WHEEL_ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  selected: { fontWeight: '700' },
  selection: { position: 'absolute', top: PRICE_WHEEL_ROW_HEIGHT, left: '10%', right: '10%',
    height: PRICE_WHEEL_ROW_HEIGHT, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#94A3B8' },
});
