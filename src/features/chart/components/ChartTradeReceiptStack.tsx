import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItem,
} from 'react-native';
import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import {
  selectChartTradeReceiptSnapshotForPane,
  type ChartTradeReceiptSnapshot,
  type ChartTradeQueueEvent,
  type ChartTradeReceiptStackController,
} from './chartTradeReceiptStackController';

export * from './chartTradeReceiptStackController';

const CARD_HEIGHT = 32;
const CARD_GAP = 2;
const ITEM_HEIGHT = CARD_HEIGHT + CARD_GAP;

export type ChartTradeReceiptStackProps = {
  controller: ChartTradeReceiptStackController;
  isDark: boolean;
  buyColor: string;
  sellColor: string;
  chartWindowPaneId?: string;
  paneWidth?: number;
  topOffset?: number;
  bottomOffset?: number;
};

const formatVolume = (volume: number): string => {
  if (!Number.isFinite(volume)) return '--';
  const precision = Math.abs(volume) < 0.01 ? 3 : 2;
  return volume.toFixed(precision);
};

const terminalLabel = (event: ChartTradeQueueEvent): string => {
  switch (event.status) {
    case 'confirmed':
      return 'done';
    case 'unconfirmed':
      return 'check';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return '';
  }
};

const ReceiptRow = React.memo(({
  event,
  isDark,
  buyColor,
  sellColor,
  onDismiss,
}: {
  event: ChartTradeQueueEvent;
  isDark: boolean;
  buyColor: string;
  sellColor: string;
  onDismiss: (queueId: number) => void;
}) => {
  const sideColor = event.side === 'buy' ? buyColor : sellColor;
  const isPending = event.status === 'pending';
  const statusColor = event.status === 'failed'
    ? '#EF4444'
    : event.status === 'unconfirmed'
      ? '#F59E0B'
      : sideColor;
  const label = terminalLabel(event);

  return (
    <Pressable
      accessibilityLiveRegion="polite"
      accessibilityRole={isPending ? 'alert' : 'button'}
      accessibilityLabel={
        `${event.symbol}, ${event.side}, ${formatVolume(event.volume)} lots, `
        + (isPending ? 'pending' : label)
      }
      accessibilityHint={isPending ? undefined : 'Dismiss trade receipt'}
      disabled={isPending}
      onPress={() => onDismiss(event.queueId)}
      style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: isDark ? '#171B24' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255,255,255,0.13)' : 'rgba(15,23,42,0.13)',
            shadowColor: isDark ? '#000000' : '#64748B',
          },
          pressed && styles.cardPressed,
        ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.symbol, { color: isDark ? '#F8FAFC' : '#0F172A' }]}
      >
        {event.symbol.replace(/\//g, '')}
      </Text>

      <Text numberOfLines={1} style={[styles.side, { color: sideColor }]}>
        {event.side === 'buy' ? 'Buy' : 'Sell'}
      </Text>

      <Text
        numberOfLines={1}
        style={[styles.volume, { color: isDark ? '#CBD5E1' : '#475569' }]}
      >
        {formatVolume(event.volume)}
      </Text>

      <View style={styles.statusSlot}>
        {isPending ? (
          <ActivityIndicator size="small" color={sideColor} />
        ) : (
          <Text numberOfLines={1} style={[styles.status, { color: statusColor }]}>
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

ReceiptRow.displayName = 'ChartTradeReceiptRow';

export const ChartTradeReceiptStack = React.memo(({
  controller,
  isDark,
  buyColor,
  sellColor,
  chartWindowPaneId,
  paneWidth,
  topOffset = 8,
  bottomOffset = 16,
}: ChartTradeReceiptStackProps) => {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const receipts: ChartTradeReceiptSnapshot = useMemo(
    () => chartWindowPaneId
      ? selectChartTradeReceiptSnapshotForPane(snapshot, chartWindowPaneId)
      : snapshot,
    [chartWindowPaneId, snapshot],
  );
  const listRef = useRef<FlatList<ChartTradeQueueEvent>>(null);
  const previousQueueIdsRef = useRef<ReadonlySet<number>>(new Set());
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const maxListHeight = Math.max(160, Math.min(680, windowHeight * 0.68));
  const listHeight = Math.min(
    maxListHeight,
    Math.max(CARD_HEIGHT, receipts.length * ITEM_HEIGHT - CARD_GAP),
  );
  // Stay compact while giving the receipt a few more pixels of breathing room.
  const preferredListWidth = Math.min(238, Math.max(208, windowWidth * 0.54));
  const listWidth = Number.isFinite(paneWidth) && Number(paneWidth) > 0
    ? Math.min(preferredListWidth, Math.max(1, Number(paneWidth) - 12))
    : preferredListWidth;

  useEffect(() => {
    const newestQueueId = receipts[0]?.queueId ?? null;
    const isNewReceipt = newestQueueId !== null
      && !previousQueueIdsRef.current.has(newestQueueId);
    previousQueueIdsRef.current = new Set(receipts.map((receipt) => receipt.queueId));
    if (isNewReceipt) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [receipts]);

  const renderItem = useCallback<ListRenderItem<ChartTradeQueueEvent>>(({ item }) => (
    <ReceiptRow
      event={item}
      isDark={isDark}
      buyColor={buyColor}
      sellColor={sellColor}
      onDismiss={controller.dismiss}
    />
  ), [buyColor, controller.dismiss, isDark, sellColor]);

  const contentContainerStyle = useMemo(() => styles.listContent, []);

  if (receipts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { top: topOffset, bottom: bottomOffset }]}
    >
      <FlatList
        ref={listRef}
        data={receipts}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.queueId)}
        getItemLayout={(_data, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        contentContainerStyle={contentContainerStyle}
        style={{ width: listWidth, height: listHeight, maxHeight: '100%', flexGrow: 0 }}
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        updateCellsBatchingPeriod={32}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        scrollEnabled={receipts.length * ITEM_HEIGHT - CARD_GAP > listHeight}
        showsVerticalScrollIndicator={receipts.length * ITEM_HEIGHT - CARD_GAP > listHeight}
        keyboardShouldPersistTaps="always"
      />
    </View>
  );
});

ChartTradeReceiptStack.displayName = 'ChartTradeReceiptStack';

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    right: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  listContent: {
    gap: CARD_GAP,
  },
  card: {
    height: CARD_HEIGHT,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 5,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.72,
  },
  symbol: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  // Center Buy/Sell in its column to create a cleaner gap after the symbol.
  side: {
    width: 36,
    marginLeft: 8,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  volume: {
    width: 42,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  statusSlot: {
    width: 48,
    marginLeft: 8,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  status: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
});
