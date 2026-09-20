// ============================================================
// Focussive Mobile — TimeSlotPicker Component
// Free-scrollable Samsung Alarm Clock Style Wheel Picker
// ============================================================

import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import type { SessionTimeSlot } from '@focussive/shared';

const ITEM_HEIGHT = 44;
const VISIBLE_HEIGHT = ITEM_HEIGHT * 3; // 132px (3 items visible: previous, selected, next)
const REPETITIONS = 3; // 3 cycles to allow free looping fling momentum

interface TimeSlotPickerProps {
  slots: SessionTimeSlot[];
  onChangeSlots: (slots: SessionTimeSlot[]) => void;
  use24Hour?: boolean;
  theme: any;
  maxSlots?: number;
}

/**
 * Free-scrollable column with physics momentum (Samsung Alarm clock style)
 */
function WheelColumn({
  value,
  count,
  onChange,
  theme,
  width = 54,
}: {
  value: number;
  count: number; // 24 for hours, 60 for minutes
  onChange: (val: number) => void;
  theme: any;
  width?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const isDragging = useRef(false);

  // Middle cycle starts at index (1 * count)
  const initialOffset = (1 * count + value) * ITEM_HEIGHT;
  const currentCenter = useRef(1 * count + value);
  const [centerIndex, setCenterIndex] = useState(1 * count + value);

  // Generate 3 repetitions of numbers 0..count-1
  const items = useMemo(() => {
    const list: number[] = [];
    for (let r = 0; r < REPETITIONS; r++) {
      for (let i = 0; i < count; i++) {
        list.push(i);
      }
    }
    return list;
  }, [count]);

  // Sync when prop value changes from outside
  useEffect(() => {
    if (!isDragging.current) {
      const targetIndex = 1 * count + value;
      currentCenter.current = targetIndex;
      setCenterIndex(targetIndex);
      scrollRef.current?.scrollTo({ y: targetIndex * ITEM_HEIGHT, animated: false });
    }
  }, [value, count]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    if (idx !== currentCenter.current) {
      currentCenter.current = idx;
      setCenterIndex(idx);
    }
  };

  const handleScrollEnd = (offsetY: number) => {
    isDragging.current = false;
    const idx = Math.round(offsetY / ITEM_HEIGHT);
    const val = ((idx % count) + count) % count;
    const normalizedIndex = 1 * count + val;
    currentCenter.current = normalizedIndex;
    setCenterIndex(normalizedIndex);
    onChange(val);

    // Silently re-center into middle cycle so user can scroll indefinitely
    const normalizedY = normalizedIndex * ITEM_HEIGHT;
    scrollRef.current?.scrollTo({ y: normalizedY, animated: false });
  };

  const handleItemPress = (index: number) => {
    const val = ((index % count) + count) % count;
    const targetY = index * ITEM_HEIGHT;
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
    currentCenter.current = index;
    setCenterIndex(index);
    onChange(val);
  };

  return (
    <View style={[styles.wheelContainer, { width, height: VISIBLE_HEIGHT }]}>
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={ITEM_HEIGHT}
        snapToAlignment="start"
        contentOffset={{ x: 0, y: initialOffset }}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
        onScrollBeginDrag={() => {
          isDragging.current = true;
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => handleScrollEnd(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => {
          // If slow drag stopped without momentum, snap immediately
          if (!e.nativeEvent.velocity?.y || Math.abs(e.nativeEvent.velocity.y) < 0.1) {
            handleScrollEnd(e.nativeEvent.contentOffset.y);
          }
        }}
        overScrollMode="never"
      >
        {items.map((num, idx) => {
          const isCenter = idx === centerIndex;
          const isAdjacent = Math.abs(idx - centerIndex) === 1;

          return (
            <TouchableOpacity
              key={`item-${idx}`}
              onPress={() => handleItemPress(idx)}
              activeOpacity={0.7}
              style={styles.wheelItem}
            >
              <Text
                style={[
                  styles.wheelNumber,
                  {
                    color: isCenter ? theme.text : theme.textSecondary,
                    fontSize: isCenter ? 32 : isAdjacent ? 18 : 14,
                    fontWeight: isCenter ? '700' : '400',
                    opacity: isCenter ? 1 : isAdjacent ? 0.35 : 0.12,
                  },
                ]}
              >
                {num.toString().padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Free-floating time display [HH : MM] without any container box or border
 */
function TimeBox({
  timeStr,
  onChangeTime,
  theme,
}: {
  timeStr: string;
  onChangeTime: (time: string) => void;
  theme: any;
}) {
  const parts = (timeStr || '09:00').split(':').map(Number);
  const hours = isNaN(parts[0]) ? 9 : parts[0];
  const minutes = isNaN(parts[1]) ? 0 : parts[1];

  function setHours(h: number) {
    const formatted = `${h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    onChangeTime(formatted);
  }

  function setMinutes(m: number) {
    const formatted = `${hours.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    onChangeTime(formatted);
  }

  return (
    <View style={styles.timeBox}>
      {/* Hours Column (0..23) */}
      <WheelColumn
        value={hours}
        count={24}
        onChange={setHours}
        theme={theme}
      />

      {/* Colon */}
      <View style={styles.colonContainer}>
        <Text style={[styles.colon, { color: theme.textSecondary }]}>:</Text>
      </View>

      {/* Minutes Column (0..59 with 1-min accuracy) */}
      <WheelColumn
        value={minutes}
        count={60}
        onChange={setMinutes}
        theme={theme}
      />
    </View>
  );
}

export default function TimeSlotPicker({
  slots,
  onChangeSlots,
  theme,
  maxSlots = 5,
}: TimeSlotPickerProps) {
  function handleUpdateSlot(index: number, field: 'start_time' | 'end_time', value: string) {
    const updated = slots.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onChangeSlots(updated);
  }

  function handleAddSlot() {
    if (slots.length >= maxSlots) return;
    const lastSlot = slots[slots.length - 1];
    let newStart = '10:00';
    let newEnd = '11:00';

    if (lastSlot) {
      const [eh, em] = lastSlot.end_time.split(':').map(Number);
      const nextStartH = (eh + 1) % 24;
      const nextEndH = (nextStartH + 1) % 24;
      newStart = `${nextStartH.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
      newEnd = `${nextEndH.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
    }

    onChangeSlots([...slots, { start_time: newStart, end_time: newEnd }]);
  }

  function handleRemoveSlot(index: number) {
    if (slots.length <= 1) return;
    onChangeSlots(slots.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.container}>
      {slots.map((slot, index) => (
        <View key={`slot-${index}`} style={styles.slotRow}>
          {/* Left: Start time without container */}
          <TimeBox
            timeStr={slot.start_time}
            onChangeTime={(val) => handleUpdateSlot(index, 'start_time', val)}
            theme={theme}
          />

          {/* Dash separator in between */}
          <View style={styles.dashContainer}>
            <Ionicons name="remove-outline" size={22} color={theme.textSecondary} />
          </View>

          {/* Right: End time without container */}
          <TimeBox
            timeStr={slot.end_time}
            onChangeTime={(val) => handleUpdateSlot(index, 'end_time', val)}
            theme={theme}
          />

          {/* Remove icon if more than 1 slot */}
          {slots.length > 1 && (
            <TouchableOpacity
              onPress={() => handleRemoveSlot(index)}
              style={styles.deleteBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close-circle-outline" size={22} color={theme.danger || '#EF4444'} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Plus icon ONLY: single, larger and fatter plus without borders or circle fill */}
      {slots.length < maxSlots && (
        <TouchableOpacity
          onPress={handleAddSlot}
          style={styles.addSlotBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 4V20M4 12H20"
              stroke={theme.accent}
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </Svg>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    gap: 16,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Container removed completely: no border, no background, no box
  timeBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  wheelContainer: {
    overflow: 'hidden',
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelNumber: {
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  colonContainer: {
    height: VISIBLE_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  colon: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  dashContainer: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    marginLeft: 6,
    padding: 4,
  },
  addSlotBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 10,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});
