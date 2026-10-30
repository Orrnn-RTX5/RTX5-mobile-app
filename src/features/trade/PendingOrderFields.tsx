import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { FastPressable } from '../../ui/components/FastPressable';
import { useTheme } from '../../ui/theme/useTheme';
import { endOfLocalDaySeconds, isStopLimitPendingType, pendingMinimumDistance, pendingPoint, roundPendingPrice, type PendingPriceRules, type PendingTimeInForce } from '../../domain/pendingOrders';
import { formatPendingExpiryDate, formatPendingExpiryTime, pendingExpiryWithLocalDate, pendingExpiryWithLocalTime } from './pendingExpirationDate';

export function PendingPriceField({ label, value, onChange, rules, seed = 0, disabled = false }: {
  label: string; value: number; onChange: (value: number) => void; rules: PendingPriceRules; seed?: number; disabled?: boolean;
}) {
  const T = useTheme();
  const [draft, setDraft] = useState(value > 0 ? String(value) : '');
  useEffect(() => { setDraft(value > 0 ? String(value) : ''); }, [value]);
  const step = rules.tickSize && rules.tickSize > 0 ? rules.tickSize : pendingPoint(rules);
  const adjust = (direction: number) => onChange(roundPendingPrice(Math.max(step, (value > 0 ? value : seed) + direction * step), rules));
  return <View style={{ gap: 5, marginVertical: 5 }}>
    <Text style={{ color: T.textSub, fontSize: 12 }}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: T.border, borderRadius: 8 }}>
      <FastPressable disabled={disabled} onPress={() => adjust(-1)} accessibilityLabel={`Decrease ${label}`} style={{ padding: 14 }}>
        <Text style={{ color: T.text }}>−</Text>
      </FastPressable>
      <TextInput value={draft} editable={!disabled} keyboardType="decimal-pad" accessibilityLabel={label}
        placeholder="Not set" placeholderTextColor={T.textMuted} style={{ flex: 1, color: T.text, textAlign: 'center', minHeight: 44, fontSize: 15 }}
        onChangeText={text => {
          const normalized = text.replace(',', '.');
          if (!/^\d*\.?\d*$/.test(normalized)) return;
          setDraft(normalized);
          onChange(Number(normalized));
        }} onBlur={() => { if (value > 0) onChange(roundPendingPrice(value, rules)); }} />
      <FastPressable disabled={disabled} onPress={() => { setDraft(''); onChange(0); }} accessibilityLabel={`Clear ${label}`} style={{ padding: 10 }}>
        <Text style={{ color: T.textMuted }}>×</Text>
      </FastPressable>
      <FastPressable disabled={disabled} onPress={() => adjust(1)} accessibilityLabel={`Increase ${label}`} style={{ padding: 14 }}>
        <Text style={{ color: T.text }}>+</Text>
      </FastPressable>
    </View>
  </View>;
}

export function PendingExpirationPicker({ value, expiry, onChange, disabled = false }: {
  value: PendingTimeInForce; expiry: number | null; onChange: (value: PendingTimeInForce, expiry: number | null) => void; disabled?: boolean;
}) {
  const T = useTheme();
  const selectedDate = new Date(expiry ? expiry * 1000 : Date.now() + 3600000);
  const [timeDraft, setTimeDraft] = useState(() => formatPendingExpiryTime(selectedDate));
  useEffect(() => { setTimeDraft(formatPendingExpiryTime(selectedDate)); }, [expiry]);
  const openSpecified = () => {
    onChange('GTD', Math.floor(selectedDate.getTime() / 1000));
  };
  return <View style={{ gap: 8, marginVertical: 10 }}>
    <Text style={{ color: T.textSub }}>Expiration</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {(['GTC', 'DAY', 'GTD'] as const).map(mode => <FastPressable key={mode} disabled={disabled}
        accessibilityRole="button" accessibilityState={{ selected: mode === value, disabled }}
        onPress={() => mode === 'GTD' ? openSpecified() : onChange(mode, mode === 'DAY' ? endOfLocalDaySeconds() : null)}
        style={{ flex: 1, padding: 11, borderRadius: 8, borderWidth: 1, borderColor: mode === value ? T.accent : T.border }}>
        <Text style={{ color: mode === value ? T.accent : T.text, textAlign: 'center' }}>{mode === 'DAY' ? 'Today' : mode === 'GTD' ? 'Specified' : 'GTC'}</Text>
      </FastPressable>)}
    </View>
    {value !== 'GTC' && expiry ? <Text style={{ color: T.textMuted, fontSize: 12 }}>{new Date(expiry * 1000).toLocaleString()}</Text> : null}
    {/* JavaScript controls work on both existing production binaries without a new native date-picker module. */}
    {value === 'GTD' ? <View pointerEvents={disabled ? 'none' : 'auto'} style={{ gap: 8, opacity: disabled ? 0.5 : 1 }}>
      <Calendar current={formatPendingExpiryDate(selectedDate)} minDate={formatPendingExpiryDate(new Date())}
        markedDates={{ [formatPendingExpiryDate(selectedDate)]: { selected: true, selectedColor: T.accent } }}
        onDayPress={({ dateString }) => {
          if (disabled) return;
          const next = pendingExpiryWithLocalDate(selectedDate, dateString);
          if (next) onChange('GTD', Math.floor(next.getTime() / 1000));
        }} />
      <Text style={{ color: T.textSub }}>Expiration time (24-hour, local)</Text>
      <TextInput accessibilityLabel="Expiration time" placeholder="HH:mm" value={timeDraft} editable={!disabled}
        maxLength={5} autoCorrect={false} style={{ color: T.text, padding: 10, borderWidth: 1, borderColor: T.border }}
        onChangeText={text => {
          if (!/^\d{0,2}:?\d{0,2}$/.test(text)) return;
          setTimeDraft(text);
          const next = pendingExpiryWithLocalTime(selectedDate, text);
          if (!disabled && next) onChange('GTD', Math.floor(next.getTime() / 1000));
        }} onBlur={() => setTimeDraft(formatPendingExpiryTime(selectedDate))} />
    </View> : null}
  </View>;
}

export function PendingOrderFields(props: {
  type: string; price: number; priceLimit: number; sl: number; tp: number;
  onPrice: (value: number) => void; onPriceLimit: (value: number) => void;
  onSl: (value: number) => void; onTp: (value: number) => void;
  timeInForce: PendingTimeInForce; expiry: number | null;
  onExpiration: (mode: PendingTimeInForce, expiry: number | null) => void;
  rules: PendingPriceRules; bid?: number; ask?: number; disabled?: boolean;
}) {
  const T = useTheme();
  const entry = isStopLimitPendingType(props.type) ? props.priceLimit : props.price;
  const offset = Math.max(pendingMinimumDistance(props.rules), (props.rules.tickSize || pendingPoint(props.rules)) * 10);
  const buy = props.type.startsWith('buy');
  return <View style={{ gap: 4 }}>
    <Text style={{ color: T.text, marginVertical: 8 }}>Bid {props.bid && props.bid > 0 ? props.bid : '—'} · Ask {props.ask && props.ask > 0 ? props.ask : '—'}</Text>
    <PendingPriceField label="Trigger Price" value={props.price} onChange={props.onPrice} rules={props.rules} disabled={props.disabled} />
    {isStopLimitPendingType(props.type) ? <PendingPriceField label="Stop Limit Price" value={props.priceLimit} onChange={props.onPriceLimit} rules={props.rules} disabled={props.disabled} /> : null}
    <PendingPriceField label="Stop Loss" value={props.sl} onChange={props.onSl} rules={props.rules} seed={entry + (buy ? -offset : offset)} disabled={props.disabled} />
    <PendingPriceField label="Take Profit" value={props.tp} onChange={props.onTp} rules={props.rules} seed={entry + (buy ? offset : -offset)} disabled={props.disabled} />
    <Text style={{ color: T.textMuted, fontSize: 12 }}>SL/TP use the pending entry price{isStopLimitPendingType(props.type) ? ' (Stop Limit Price)' : ''}. Blank means no SL/TP.</Text>
    <PendingExpirationPicker value={props.timeInForce} expiry={props.expiry} onChange={props.onExpiration} disabled={props.disabled} />
  </View>;
}
