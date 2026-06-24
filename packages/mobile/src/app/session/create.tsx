// ============================================================
// Focussive Mobile — Create Session Screen
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/utils/theme';
import { sessionApi, appGroupApi } from '@/utils/api';
import { useSessions } from '@/context/SessionContext';
import { ScheduleType, Weekday, PREDEFINED_BLOCKED_WEBSITES } from '@focussive/shared';
import type { AppGroup } from '@focussive/shared';

const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: Weekday.MONDAY, label: 'Mon' },
  { key: Weekday.TUESDAY, label: 'Tue' },
  { key: Weekday.WEDNESDAY, label: 'Wed' },
  { key: Weekday.THURSDAY, label: 'Thu' },
  { key: Weekday.FRIDAY, label: 'Fri' },
  { key: Weekday.SATURDAY, label: 'Sat' },
  { key: Weekday.SUNDAY, label: 'Sun' },
];

export default function CreateSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { refreshSessions } = useSessions();

  const [name, setName] = useState('');
  const [durationStr, setDurationStr] = useState('25');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [schedule, setSchedule] = useState<ScheduleType>(ScheduleType.TODAY);
  const [scheduleDays, setScheduleDays] = useState<Weekday[]>([]);
  const [mobileFocus, setMobileFocus] = useState(false);
  const [browserFocus, setBrowserFocus] = useState(false);
  const [appGroups, setAppGroups] = useState<AppGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedWebsites, setSelectedWebsites] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAppGroups();
  }, []);

  async function loadAppGroups() {
    try {
      const response = await appGroupApi.getAll();
      setAppGroups(response.data as AppGroup[]);
    } catch {
      // silently fail
    }
  }

  function toggleDay(day: Weekday) {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function toggleWebsite(site: string) {
    setSelectedWebsites((prev) =>
      prev.includes(site) ? prev.filter((s) => s !== site) : [...prev, site]
    );
  }

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert('Error', 'Session name is required');
      return;
    }

    const duration = parseInt(durationStr, 10);
    if (isNaN(duration) || duration < 1) {
      Alert.alert('Error', 'Duration must be at least 1 minute');
      return;
    }

    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const startTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    if (h < 0 || h > 23 || m < 0 || m > 59) {
      Alert.alert('Error', 'Please enter a valid time (HH:MM)');
      return;
    }

    setLoading(true);
    try {
      await sessionApi.create({
        name: name.trim(),
        duration,
        schedule,
        schedule_days: schedule !== ScheduleType.TODAY ? scheduleDays : [],
        start_time: startTime,
        mobile_focus: mobileFocus,
        browser_focus: browserFocus,
        app_group_id: mobileFocus ? selectedGroupId : null,
        blocked_websites: browserFocus ? selectedWebsites : [],
      });

      await refreshSessions();
      router.back();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Session Name */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>SESSION NAME</Text>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
        placeholder="e.g. Deep Work, Study, Writing..."
        placeholderTextColor={theme.textSecondary}
        value={name}
        onChangeText={setName}
      />

      {/* Duration */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>DURATION (MINUTES)</Text>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
        placeholder="25"
        placeholderTextColor={theme.textSecondary}
        value={durationStr}
        onChangeText={setDurationStr}
        keyboardType="numeric"
      />

      {/* Start Time */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>START TIME</Text>
      <View style={styles.timeRow}>
        <TextInput
          style={[styles.timeInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
          placeholder="HH"
          placeholderTextColor={theme.textSecondary}
          value={hours}
          onChangeText={setHours}
          keyboardType="numeric"
          maxLength={2}
        />
        <Text style={[styles.timeSep, { color: theme.text }]}>:</Text>
        <TextInput
          style={[styles.timeInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
          placeholder="MM"
          placeholderTextColor={theme.textSecondary}
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="numeric"
          maxLength={2}
        />
      </View>

      {/* Schedule */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>SCHEDULE</Text>
      <View style={styles.scheduleRow}>
        {[
          { key: ScheduleType.TODAY, label: 'Today' },
          { key: ScheduleType.SPECIFIC_DAYS, label: 'Specific Days' },
          { key: ScheduleType.RECURRING, label: 'Recurring' },
        ].map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[
              styles.scheduleBtn,
              { borderColor: schedule === opt.key ? theme.accent : theme.border },
              schedule === opt.key && { backgroundColor: `${theme.accent}20` },
            ]}
            onPress={() => setSchedule(opt.key)}
          >
            <Text style={[styles.scheduleBtnText, { color: schedule === opt.key ? theme.accent : theme.textSecondary }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Day Selector */}
      {schedule !== ScheduleType.TODAY && (
        <View style={styles.daysRow}>
          {WEEKDAYS.map((day) => (
            <TouchableOpacity
              key={day.key}
              style={[
                styles.dayBtn,
                { borderColor: scheduleDays.includes(day.key) ? theme.accent : theme.border },
                scheduleDays.includes(day.key) && { backgroundColor: `${theme.accent}20` },
              ]}
              onPress={() => toggleDay(day.key)}
            >
              <Text style={[styles.dayBtnText, { color: scheduleDays.includes(day.key) ? theme.accent : theme.textSecondary }]}>
                {day.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Focus Toggles */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>FOCUS MODE</Text>

      <TouchableOpacity
        style={[styles.toggleRow, { borderColor: mobileFocus ? theme.accent : theme.border }]}
        onPress={() => setMobileFocus(!mobileFocus)}
      >
        <Text style={[styles.toggleLabel, { color: theme.text }]}>📱 Mobile Focus</Text>
        <View style={[styles.toggle, mobileFocus && { backgroundColor: theme.accent }]}>
          <View style={[styles.toggleDot, mobileFocus && styles.toggleDotActive]} />
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.toggleRow, { borderColor: browserFocus ? theme.accent : theme.border }]}
        onPress={() => setBrowserFocus(!browserFocus)}
      >
        <Text style={[styles.toggleLabel, { color: theme.text }]}>🌐 Browser Focus</Text>
        <View style={[styles.toggle, browserFocus && { backgroundColor: theme.accent }]}>
          <View style={[styles.toggleDot, browserFocus && styles.toggleDotActive]} />
        </View>
      </TouchableOpacity>

      {/* App Group Selector (when mobile focus ON) */}
      {mobileFocus && (
        <>
          <Text style={[styles.label, { color: theme.textSecondary }]}>SELECT APP GROUP</Text>
          {appGroups.map((group) => (
            <TouchableOpacity
              key={group.id}
              style={[
                styles.groupItem,
                { borderColor: selectedGroupId === group.id ? theme.accent : theme.border },
                selectedGroupId === group.id && { backgroundColor: `${theme.accent}20` },
              ]}
              onPress={() => setSelectedGroupId(selectedGroupId === group.id ? null : group.id)}
            >
              <Text style={[styles.groupItemText, { color: theme.text }]}>{group.name}</Text>
              <Text style={[styles.groupItemCount, { color: theme.textSecondary }]}>
                {group.apps?.length || 0} apps
              </Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Blocked Websites (when browser focus ON) */}
      {browserFocus && (
        <>
          <Text style={[styles.label, { color: theme.textSecondary }]}>BLOCK WEBSITES</Text>
          <View style={styles.websiteGrid}>
            {PREDEFINED_BLOCKED_WEBSITES.map((site) => (
              <TouchableOpacity
                key={site}
                style={[
                  styles.websiteChip,
                  { borderColor: selectedWebsites.includes(site) ? theme.accent : theme.border },
                  selectedWebsites.includes(site) && { backgroundColor: `${theme.accent}20` },
                ]}
                onPress={() => toggleWebsite(site)}
              >
                <Text style={[styles.websiteText, { color: selectedWebsites.includes(site) ? theme.accent : theme.textSecondary }]}>
                  {site}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Create Button */}
      <TouchableOpacity
        style={[styles.createBtn, { backgroundColor: theme.accentDark }, loading && { opacity: 0.6 }]}
        onPress={handleCreate}
        disabled={loading}
      >
        <Text style={styles.createBtnText}>
          {loading ? 'Creating...' : 'Create Session'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: 8, marginTop: 20 },
  input: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, fontSize: 16, fontWeight: '300' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { width: 70, height: 48, borderWidth: 1, borderRadius: 10, textAlign: 'center', fontSize: 18, fontWeight: '300' },
  timeSep: { fontSize: 24, fontWeight: '300' },
  scheduleRow: { flexDirection: 'row', gap: 8 },
  scheduleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  scheduleBtnText: { fontSize: 13, fontWeight: '400' },
  daysRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dayBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  dayBtnText: { fontSize: 12, fontWeight: '400' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderRadius: 10, marginTop: 8 },
  toggleLabel: { fontSize: 15 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#ccc', justifyContent: 'center', paddingHorizontal: 2 },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleDotActive: { alignSelf: 'flex-end' },
  groupItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderWidth: 1, borderRadius: 10, marginTop: 8 },
  groupItemText: { fontSize: 15 },
  groupItemCount: { fontSize: 13 },
  websiteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  websiteChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  websiteText: { fontSize: 13 },
  createBtn: { height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 32 },
  createBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
