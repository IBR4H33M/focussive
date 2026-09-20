// ============================================================
// Focussive Mobile — TimeSlotPicker Component
// ============================================================

import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SessionTimeSlot } from '@focussive/shared';

interface TimeSlotPickerProps {
  slots: SessionTimeSlot[];
  onChangeSlots: (slots: SessionTimeSlot[]) => void;
  use24Hour?: boolean;
  theme: any;
  maxSlots?: number;
}

/**
 * A single swipeable / tappable number unit (hours or minutes)
 */
function SwipeNumberUnit({
  value,
  min,
  max,
  step = 1,
  onChange,
  theme,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  theme: any;
  label?: string;
}) {
  const accumulatedDy = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        accumulatedDy.current = 0;
      },
      onPanResponderMove: (_, gestureState: PanResponderGestureState) => {
        const threshold = 18; // pixels of drag to trigger a step
        const diff = gestureState.dy - accumulatedDy.current;
        if (Math.abs(diff) >= threshold) {
          const steps = Math.trunc(diff / threshold);
          accumulatedDy.current += steps * threshold;
          // Swipe up (negative dy) increments; swipe down (positive dy) decrements
          const delta = -steps * step;
          let next = (value + delta) % (max + 1);
          if (next < min) next = max - (min - next - 1);
          onChange(next);
        }
      },
    })
  ).current;

  function increment() {
    const next = value + step > max ? min : value + step;
    onChange(next);
  }

  function decrement() {
    const next = value - step < min ? max : value - step;
    onChange(next);
  }

  const formatted = value.toString().padStart(2, '0');

  return (
    <View style={styles.unitContainer} {...panResponder.panHandlers}>
      <TouchableOpacity onPress={increment} hitSlop={{ top: 8, bottom: 4, left: 8, right: 8 }}>
        <Text style={[styles.arrowText, { color: theme.textSecondary }]}>▲</Text>
      </TouchableOpacity>
      <Text style={[styles.unitNumber, { color: theme.text }]}>{formatted}</Text>
      <TouchableOpacity onPress={decrement} hitSlop={{ top: 4, bottom: 8, left: 8, right: 8 }}>
        <Text style={[styles.arrowText, { color: theme.textSecondary }]}>▼</Text>
      </TouchableOpacity>
      {label && <Text style={[styles.unitLabel, { color: theme.textSecondary }]}>{label}</Text>}
    </View>
  );
}

/**
 * A color-filled box containing Start or End time [HH : MM]
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
    <View style={[styles.timeBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <SwipeNumberUnit
        value={hours}
        min={0}
        max={23}
        step={1}
        onChange={setHours}
        theme={theme}
      />
      <Text style={[styles.colon, { color: theme.textSecondary }]}>:</Text>
      <SwipeNumberUnit
        value={minutes}
        min={0}
        max={59}
        step={5}
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
          {/* Left: Start time box */}
          <TimeBox
            timeStr={slot.start_time}
            onChangeTime={(val) => handleUpdateSlot(index, 'start_time', val)}
            theme={theme}
          />

          {/* Gap with Dash icon in between */}
          <View style={styles.dashContainer}>
            <Ionicons name="remove-outline" size={20} color={theme.textSecondary} />
          </View>

          {/* Right: End time box */}
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
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle-outline" size={20} color={theme.danger || '#EF4444'} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Below the time durations: Plus icon ONLY (no texts) */}
      {slots.length < maxSlots && (
        <TouchableOpacity
          onPress={handleAddSlot}
          style={[styles.addSlotBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={24} color={theme.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    gap: 12,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 64,
  },
  unitContainer: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unitNumber: {
    fontSize: 22,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginVertical: 2,
  },
  unitLabel: {
    fontSize: 9,
    textTransform: 'uppercase',
  },
  arrowText: {
    fontSize: 10,
    opacity: 0.6,
  },
  colon: {
    fontSize: 22,
    fontWeight: '500',
    marginHorizontal: 4,
    marginBottom: 4,
  },
  dashContainer: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    marginLeft: 8,
    padding: 4,
  },
  addSlotBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 4,
  },
});
