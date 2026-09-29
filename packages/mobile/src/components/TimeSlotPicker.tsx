// ============================================================
// Focussive Mobile — TimeSlotPicker Component
// Buttery-smooth Samsung OneUI Clock Style Wheel Picker
// Native 120fps GPU-accelerated scaling & opacity transitions
// Supports both 24-hour and 12-hour (with AM/PM toggle) modes
// ============================================================

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import type { SessionTimeSlot } from '@focussive/shared';
import { useIsDark } from '@/utils/theme';

const ITEM_HEIGHT = 44;
const VISIBLE_HEIGHT = ITEM_HEIGHT * 3; // 132px (3 items visible: previous, selected, next)
const REPETITIONS = 3; // 3 cycles to allow free looping fling momentum

interface TimeSlotPickerProps {
  slots: SessionTimeSlot[];
  onChangeSlots: (slots: SessionTimeSlot[]) => void;
  use24Hour?: boolean;
  theme: any;
  maxSlots?: number;
  onScrollStart?: () => void;
  onScrollEnd?: () => void;
}

interface WheelItemProps {
  num: number;
  index: number;
  scrollY: Animated.Value;
  onPress: (index: number) => void;
  textColor: string;
}

/**
 * Individual wheel item driven entirely by the native RenderThread.
 * Scale: 0.65 -> 0.80 -> 1.16 -> 0.80 -> 0.65 (Samsung OneUI magnification)
 * Opacity: 0.08 -> 0.38 -> 1.00 -> 0.38 -> 0.08 (Smooth fading)
 */
const WheelItem = React.memo(function WheelItem({
  num,
  index,
  scrollY,
  onPress,
  textColor,
}: WheelItemProps) {
  const itemOffset = index * ITEM_HEIGHT;

  const scale = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [
        itemOffset - 2 * ITEM_HEIGHT,
        itemOffset - ITEM_HEIGHT,
        itemOffset,
        itemOffset + ITEM_HEIGHT,
        itemOffset + 2 * ITEM_HEIGHT,
      ],
      outputRange: [0.65, 0.80, 1.16, 0.80, 0.65],
      extrapolate: 'clamp',
    });
  }, [scrollY, itemOffset]);

  const opacity = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [
        itemOffset - 2 * ITEM_HEIGHT,
        itemOffset - ITEM_HEIGHT,
        itemOffset,
        itemOffset + ITEM_HEIGHT,
        itemOffset + 2 * ITEM_HEIGHT,
      ],
      outputRange: [0.08, 0.38, 1.0, 0.38, 0.08],
      extrapolate: 'clamp',
    });
  }, [scrollY, itemOffset]);

  return (
    <Pressable
      onPress={() => onPress(index)}
      style={styles.wheelItem}
      hitSlop={{ top: 2, bottom: 2 }}
    >
      <Animated.View
        style={[
          styles.wheelItemContent,
          {
            transform: [{ scale }],
            opacity,
          },
        ]}
      >
        <Text style={[styles.wheelNumber, { color: textColor }]}>
          {num.toString().padStart(2, '0')}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

/**
 * Free-scrollable column with Samsung OneUI physics momentum.
 * Uses Animated.ScrollView with useNativeDriver for true 120fps fluid motion.
 */
function WheelColumn({
  value,
  count,
  min = 0,
  onChange,
  theme,
  width = 54,
  onScrollStart,
  onScrollEnd,
}: {
  value: number;
  count: number;
  min?: number;
  onChange: (val: number) => void;
  theme: any;
  width?: number;
  onScrollStart?: () => void;
  onScrollEnd?: () => void;
}) {
  const scrollRef = useRef<any>(null);
  const isDragging = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeValue = isNaN(value) ? min : Math.max(min, Math.min(min + count - 1, value));
  const initialIndex = 1 * count + (safeValue - min);
  const initialOffset = initialIndex * ITEM_HEIGHT;

  const scrollY = useRef(new Animated.Value(initialOffset)).current;
  const internalValueRef = useRef(safeValue);

  // Generate 3 repetitions of numbers [min .. min + count - 1]
  const items = useMemo(() => {
    const list: number[] = [];
    for (let r = 0; r < REPETITIONS; r++) {
      for (let i = 0; i < count; i++) {
        list.push(i + min);
      }
    }
    return list;
  }, [count, min]);

  // Sync when prop value changes from outside (e.g. AM/PM toggle)
  useEffect(() => {
    if (value !== internalValueRef.current) {
      internalValueRef.current = value;
      const targetIndex = 1 * count + (value - min);
      const targetY = targetIndex * ITEM_HEIGHT;
      scrollY.setValue(targetY);
      scrollRef.current?.scrollTo({ y: targetY, animated: false });
    }
  }, [value, count, min, scrollY]);

  // Safety timer to guarantee page scrolling is re-enabled even in unexpected touch cancels
  const resetSafetyTimer = useCallback(() => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      if (isDragging.current) {
        isDragging.current = false;
        onScrollEnd?.();
      }
    }, 1200);
  }, [onScrollEnd]);

  useEffect(() => {
    return () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      onScrollEnd?.();
    };
  }, [onScrollEnd]);

  const handleScrollEnd = useCallback(
    (offsetY: number) => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      isDragging.current = false;
      onScrollEnd?.();

      const idx = Math.round(offsetY / ITEM_HEIGHT);
      const offsetInCycle = ((idx % count) + count) % count;
      const val = offsetInCycle + min;
      const normalizedIndex = 1 * count + offsetInCycle;

      internalValueRef.current = val;
      onChange(val);

      // Silently re-center into middle cycle only if the user flung far into cycle 0 or cycle 2
      if (idx !== normalizedIndex) {
        const normalizedY = normalizedIndex * ITEM_HEIGHT;
        scrollY.setValue(normalizedY);
        scrollRef.current?.scrollTo({ y: normalizedY, animated: false });
      }
    },
    [count, min, onChange, onScrollEnd, scrollY]
  );

  const handleItemPress = useCallback(
    (index: number) => {
      const offsetInCycle = ((index % count) + count) % count;
      const val = offsetInCycle + min;
      const targetY = index * ITEM_HEIGHT;
      scrollRef.current?.scrollTo({ y: targetY, animated: true });
      internalValueRef.current = val;
      onChange(val);
    },
    [count, min, onChange]
  );

  const onScrollAnimated = useMemo(() => {
    return Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      {
        useNativeDriver: true,
        listener: () => {
          resetSafetyTimer();
        },
      }
    );
  }, [scrollY, resetSafetyTimer]);

  return (
    <View style={[styles.wheelContainer, { width, height: VISIBLE_HEIGHT }]}>
      <Animated.ScrollView
        ref={scrollRef}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={false}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.988}
        snapToInterval={ITEM_HEIGHT}
        snapToAlignment="start"
        disableIntervalMomentum={false}
        fadingEdgeLength={24}
        bounces={false}
        overScrollMode="never"
        contentOffset={{ x: 0, y: initialOffset }}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
        onScrollBeginDrag={() => {
          isDragging.current = true;
          onScrollStart?.();
        }}
        onScroll={onScrollAnimated}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e: any) => handleScrollEnd(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e: any) => {
          const vy = e.nativeEvent.velocity?.y;
          if (!vy || Math.abs(vy) < 0.05) {
            handleScrollEnd(e.nativeEvent.contentOffset.y);
          }
        }}
      >
        {items.map((num, idx) => (
          <WheelItem
            key={`item-${idx}`}
            num={num}
            index={idx}
            scrollY={scrollY}
            onPress={handleItemPress}
            textColor={theme.text}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

/**
 * Free-floating time display [HH : MM] with Samsung OneUI selection capsule & optional AM/PM toggle
 */
function TimeBox({
  timeStr,
  onChangeTime,
  use24Hour = false,
  theme,
  onScrollStart,
  onScrollEnd,
}: {
  timeStr: string;
  onChangeTime: (time: string) => void;
  use24Hour?: boolean;
  theme: any;
  onScrollStart?: () => void;
  onScrollEnd?: () => void;
}) {
  const isDark = useIsDark();
  const toggleBg = isDark ? '#2D2E46' : theme.surface;
  const parts = (timeStr || '09:00').split(':').map(Number);
  const rawHours = isNaN(parts[0]) ? 9 : parts[0];
  const minutes = isNaN(parts[1]) ? 0 : parts[1];

  const isPm = rawHours >= 12;
  const displayHours = use24Hour
    ? rawHours
    : rawHours % 12 === 0
    ? 12
    : rawHours % 12;

  function setHours(h: number) {
    let finalHours = h;
    if (!use24Hour) {
      if (isPm) {
        finalHours = h === 12 ? 12 : h + 12;
      } else {
        finalHours = h === 12 ? 0 : h;
      }
    }
    const formatted = `${finalHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    onChangeTime(formatted);
  }

  function setMinutes(m: number) {
    const formatted = `${rawHours.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    onChangeTime(formatted);
  }

  function toggleAmPm(targetIsPm: boolean) {
    if (targetIsPm === isPm) return;
    let newHours = rawHours;
    if (targetIsPm && rawHours < 12) {
      newHours = rawHours + 12;
    } else if (!targetIsPm && rawHours >= 12) {
      newHours = rawHours - 12;
    }
    const formatted = `${newHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    onChangeTime(formatted);
  }

  return (
    <View style={styles.timeBoxColumn}>
      {/* Wheels row: [HH] : [MM] with Samsung OneUI selection capsule behind */}
      <View style={styles.wheelsRow}>
        <View
          pointerEvents="none"
          style={[
            styles.selectionCapsule,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            },
          ]}
        />

        <WheelColumn
          value={displayHours}
          count={use24Hour ? 24 : 12}
          min={use24Hour ? 0 : 1}
          onChange={setHours}
          theme={theme}
          onScrollStart={onScrollStart}
          onScrollEnd={onScrollEnd}
        />

        <View style={styles.colonContainer}>
          <Text style={[styles.colon, { color: theme.textSecondary }]}>:</Text>
        </View>

        <WheelColumn
          value={minutes}
          count={60}
          min={0}
          onChange={setMinutes}
          theme={theme}
          onScrollStart={onScrollStart}
          onScrollEnd={onScrollEnd}
        />
      </View>

      {/* AM / PM Toggle (Only shown when not in 24-hour mode) */}
      {!use24Hour && (
        <View style={[styles.ampmToggleContainer, { backgroundColor: toggleBg }]}>
          <TouchableOpacity
            style={[
              styles.ampmToggleBtn,
              !isPm && { backgroundColor: theme.accent },
            ]}
            onPress={() => toggleAmPm(false)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.ampmToggleText,
                { color: !isPm ? '#FFFFFF' : theme.textSecondary },
                !isPm && { fontWeight: '700' },
              ]}
            >
              AM
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.ampmToggleBtn,
              isPm && { backgroundColor: theme.accent },
            ]}
            onPress={() => toggleAmPm(true)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.ampmToggleText,
                { color: isPm ? '#FFFFFF' : theme.textSecondary },
                isPm && { fontWeight: '700' },
              ]}
            >
              PM
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function TimeSlotPicker({
  slots,
  onChangeSlots,
  use24Hour = false,
  theme,
  maxSlots = 5,
  onScrollStart,
  onScrollEnd,
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
          {/* Left: Start time */}
          <TimeBox
            timeStr={slot.start_time}
            onChangeTime={(val) => handleUpdateSlot(index, 'start_time', val)}
            use24Hour={use24Hour}
            theme={theme}
            onScrollStart={onScrollStart}
            onScrollEnd={onScrollEnd}
          />

          {/* Dash separator in between */}
          <View style={styles.dashContainer}>
            <Ionicons name="remove-outline" size={22} color={theme.textSecondary} />
          </View>

          {/* Right: End time */}
          <TimeBox
            timeStr={slot.end_time}
            onChangeTime={(val) => handleUpdateSlot(index, 'end_time', val)}
            use24Hour={use24Hour}
            theme={theme}
            onScrollStart={onScrollStart}
            onScrollEnd={onScrollEnd}
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

      {/* Plus icon: clean SVG plus */}
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
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  timeBoxColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelsRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
  },
  selectionCapsule: {
    position: 'absolute',
    top: ITEM_HEIGHT, // Center row offset
    height: ITEM_HEIGHT,
    left: 2,
    right: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  wheelContainer: {
    overflow: 'hidden',
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelItemContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelNumber: {
    fontSize: 27,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  colonContainer: {
    height: VISIBLE_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colon: {
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 30,
  },
  dashContainer: {
    paddingHorizontal: 8,
    marginTop: 54, // Vertically center with the wheel center row
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    marginLeft: 6,
    marginTop: 54, // Vertically center with the wheel center row
    padding: 4,
  },
  ampmToggleContainer: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    alignSelf: 'center',
    marginTop: 8,
    overflow: 'hidden',
  },
  ampmToggleBtn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ampmToggleText: {
    fontSize: 12,
    fontWeight: '500',
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
