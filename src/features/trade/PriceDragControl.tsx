import React, { useMemo, useRef } from 'react';
import { PanResponder, View, type StyleProp, type ViewStyle } from 'react-native';
import { priceAfterVerticalDrag } from './priceDrag';

type Props = {
  value: number; step: number; decimals: number; min?: number; max?: number;
  enabled?: boolean; label: string; style?: StyleProp<ViewStyle>; children: React.ReactNode;
  getValue?: () => number; onChange: (value: number) => void; onDragStart?: () => void;
};

/** A drag changes only its draft callback. Submission stays on the Place button. */
export function PriceDragControl(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const drag = useRef<{ value: number; step: number; decimals: number; min?: number; max?: number; last: number } | null>(null);
  const enabled = () => latest.current.enabled !== false && Number.isFinite(latest.current.step) && latest.current.step > 0;
  const responder = useMemo(() => {
    const move = (dy: number) => {
      const active = drag.current;
      if (!active || !enabled()) return;
      const next = priceAfterVerticalDrag(active.value, dy, active.step, active.decimals, active.min, active.max);
      if (next !== active.last) { active.last = next; latest.current.onChange(next); }
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_event, gesture) => enabled() && Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        latest.current.onDragStart?.();
        const current = latest.current;
        const value = current.getValue?.() ?? current.value;
        drag.current = { value, step: current.step, decimals: current.decimals, min: current.min, max: current.max, last: value };
      },
      onPanResponderMove: (_event, gesture) => move(gesture.dy),
      onPanResponderRelease: (_event, gesture) => { move(gesture.dy); drag.current = null; },
      onPanResponderTerminate: () => { drag.current = null; },
      onPanResponderTerminationRequest: () => false,
    });
  }, []);
  return <View style={props.style} {...responder.panHandlers}
    accessibilityRole={props.enabled !== false ? 'adjustable' : undefined} accessibilityLabel={props.label}
    accessibilityHint="Drag up to increase the price or down to decrease it"
    // Fabric's numeric accessibility fields accept integers, while prices contain decimals.
    accessibilityValue={{ text: String(props.value) }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={event => {
      if (!enabled()) return;
      const direction = event.nativeEvent.actionName === 'increment' ? -8 : event.nativeEvent.actionName === 'decrement' ? 8 : 0;
      if (!direction) return;
      const current = latest.current;
      current.onDragStart?.();
      current.onChange(priceAfterVerticalDrag(current.getValue?.() ?? current.value, direction, current.step, current.decimals, current.min, current.max));
    }}>{props.children}</View>;
}
