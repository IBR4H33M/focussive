// ============================================================
// Focussive Mobile — Session Detail + Edit Screen
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/utils/theme';
import { sessionApi, appGroupApi } from '@/utils/api';
import { useSessions } from '@/context/SessionContext';
import { ScheduleType, Weekday, PREDEFINED_BLOCKED_WEBSITES, SessionStatus, formatDuration, formatTime } from '@focussive/shared';
import type { Session, AppGroup } from '@focussive/shared';

const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: Weekday.MONDAY, label: 'Mon' },
  { key: Weekday.TUESDAY, label: 'Tue' },
  { key: Weekday.WEDNESDAY, label: 'Wed' },
  { key: Weekday.THURSDAY, label: 'Thu' },
  { key: Weekday.FRIDAY, label: 'Fri' },
  { key: Weekday.SATURDAY, label: 'Sat' },
  { key: Weekday.SUNDAY, label: 'Sun' },
];

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { refreshSessions, handleBreak } = useSessions();

  const [session, setSession] = useState<Session & { violations_count?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appGroups, setAppGroups] = useState<AppGroup[]>([]);
  const [breakModalVisible, setBreakModalVisible] = useState(false);
  const [breakPickerMinutes, setBreakPickerMinutes] = useState(1);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editDurationHours, setEditDurationHours] = useState('0');
  const [editDurationMinutes, setEditDurationMinutes] = useState('25');
  const [editHours, setEditHours] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [editSchedule, setEditSchedule] = useState<ScheduleType>(ScheduleType.TODAY);
  const [editScheduleDays, setEditScheduleDays] = useState<Weekday[]>([]);
  const [editMobileFocus, setEditMobileFocus] = useState(false);
  const [editBrowserFocus, setEditBrowserFocus] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editWebsites, setEditWebsites] = useState<string[]>([]);

  const fetchSession = useCallback(async () => {
    try {
      const data = await sessionApi.getById(id) as Session & { violations_count?: number };
      setSession(data);
    } catch {
      Alert.alert('Error', 'Session not found');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSession();
    appGroupApi.getAll().then(r => setAppGroups(r.data as AppGroup[])).catch(() => {});
  }, [fetchSession]);

  // Header configuration
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => null,
    });
  }, [navigation]);

  function openEditModal() {
    if (!session) return;
    setEditName(session.name);
    const totalMins = session.duration;
    setEditDurationHours(String(Math.floor(totalMins / 60)));
    setEditDurationMinutes(String(totalMins % 60));
    const [h, m] = session.start_time.split(':');
    setEditHours(h);
    setEditMinutes(m);
    setEditSchedule((session.schedule as ScheduleType) || ScheduleType.TODAY);
    setEditScheduleDays((session.schedule_days as Weekday[]) || []);
    setEditMobileFocus(session.mobile_focus || false);
    setEditBrowserFocus(session.browser_focus || false);
    setEditGroupId(session.app_group_id as string | null || null);
    setEditWebsites((session.blocked_websites as string[]) || []);
    setEditModalVisible(true);
  }

  function handleDelete() {
    if (!session) return;
    Alert.alert(
      'Delete Session',
      `Are you sure you want to delete "${session.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await sessionApi.delete(session.id);
              await refreshSessions();
              router.back();
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete session');
            }
          },
        },
      ]
    );
  }

  async function handleSave() {
    if (!editName.trim()) {
      Alert.alert('Error', 'Session name is required');
      return;
    }
    const dh = parseInt(editDurationHours, 10) || 0;
    const dm = parseInt(editDurationMinutes, 10) || 0;
    const duration = dh * 60 + dm;
    if (duration < 1) {
      Alert.alert('Error', 'Duration must be at least 1 minute');
      return;
    }
    const sh = parseInt(editHours, 10) || 0;
    const sm = parseInt(editMinutes, 10) || 0;
    if (sh < 0 || sh > 23 || sm < 0 || sm > 59) {
      Alert.alert('Error', 'Please enter a valid time');
      return;
    }

    setSaving(true);
    try {
      await sessionApi.update(id, {
        name: editName.trim(),
        duration,
        start_time: `${sh.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`,
        schedule: editSchedule,
        schedule_days: editSchedule !== ScheduleType.TODAY ? editScheduleDays : [],
        mobile_focus: editMobileFocus,
        browser_focus: editBrowserFocus,
        app_group_id: editMobileFocus ? editGroupId : null,
        blocked_websites: editBrowserFocus ? editWebsites : [],
      });
      setEditModalVisible(false);
      await fetchSession();
      await refreshSessions();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day: Weekday) {
    setEditScheduleDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }
  function toggleWebsite(site: string) {
    setEditWebsites(prev => prev.includes(site) ? prev.filter(s => s !== site) : [...prev, site]);
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!session) return null;

  const isActive = session.status === SessionStatus.ACTIVE;
  const isEditable = !isActive;
  const breakRemaining = Math.floor((session.break_used_seconds != null
    ? Math.max(0, ((session.max_break_minutes ?? 0) * 60) - session.break_used_seconds)
    : (session.max_break_minutes ?? 0) * 60) / 60);

  return (
    <>
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: isActive ? `${theme.accent}15` : theme.surface }]}>
          <Ionicons
            name={isActive ? 'radio-button-on' : 'calendar-outline'}
            size={16}
            color={isActive ? theme.accent : theme.textSecondary}
          />
          <Text style={[styles.statusText, { color: isActive ? theme.accent : theme.textSecondary }]}>
            {isActive ? 'Active' : session.status.charAt(0).toUpperCase() + session.status.slice(1)}
          </Text>
        </View>

        {/* Name */}
        <Text style={[styles.sessionName, { color: theme.text }]}>{session.name}</Text>

        {/* Details */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <DetailRow icon="time-outline" label="Duration" value={formatDuration(session.duration)} theme={theme} />
          <DetailRow icon="play-outline" label="Start Time" value={formatTime(session.start_time)} theme={theme} />
          <DetailRow icon="calendar-outline" label="Schedule" value={session.schedule} theme={theme} />
          {(session.violations_count ?? 0) > 0 && (
            <DetailRow icon="warning-outline" label="Violations" value={String(session.violations_count)} theme={theme} color={theme.danger} />
          )}
          {session.allow_breaks && (
            <DetailRow icon="cafe-outline" label="Break Time" value={`${session.max_break_minutes ?? 0} min (${breakRemaining} remaining)`} theme={theme} />
          )}
        </View>

        {/* Focus Modes */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <FocusRow icon="phone-portrait-outline" label="Mobile Focus" enabled={session.mobile_focus || false} theme={theme} />
          <FocusRow icon="globe-outline" label="Browser Focus" enabled={session.browser_focus || false} theme={theme} />
        </View>

        {!isEditable && (
          <Text style={[styles.editHint, { color: theme.textSecondary }]}>
            {isActive ? 'Stop the session to edit or delete it' : 'Cannot edit a completed session'}
          </Text>
        )}

        {/* Action Buttons — shown for all non-active sessions */}
        {!isActive && (
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[styles.editBtn, { borderColor: theme.accent }]}
              onPress={openEditModal}
            >
              <Ionicons name="create-outline" size={16} color={theme.accent} />
              <Text style={[styles.editBtnText, { color: theme.accent }]}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteBtn, { borderColor: theme.danger }]}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={16} color={theme.danger} />
              <Text style={[styles.deleteBtnText, { color: theme.danger }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Take a Break button — active sessions with allow_breaks */}
        {isActive && session.allow_breaks && (
          <View style={{ paddingHorizontal: 0, marginBottom: 12 }}>
            {breakRemaining > 0 ? (
              <TouchableOpacity
                style={[styles.breakBtn, { borderColor: '#90EE90' }]}
                onPress={() => { setBreakPickerMinutes(1); setBreakModalVisible(true); }}
              >
                <Ionicons name="cafe-outline" size={18} color="#90EE90" />
                <Text style={styles.breakBtnText}>Take a break</Text>
                <Text style={styles.breakBtnSub}>{breakRemaining} min remaining</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.breakBtn, { borderColor: theme.border, opacity: 0.45 }]}>
                <Text style={[styles.breakBtnText, { color: theme.textSecondary }]}>No break time available</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Break Picker Modal */}
      <Modal visible={breakModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={[{ backgroundColor: theme.card, borderRadius: 20, padding: 32, width: '80%', alignItems: 'center', borderWidth: 1, borderColor: theme.border }]}>
            <Text style={[{ fontSize: 20, fontWeight: '600', color: theme.text, marginBottom: 6 }]}>Take a break</Text>
            <Text style={[{ fontSize: 13, color: theme.textSecondary, marginBottom: 28, textAlign: 'center' }]}>Breaks don't count as distracted time</Text>

            <TouchableOpacity onPress={() => setBreakPickerMinutes(m => Math.min(m + 1, breakRemaining))} style={{ paddingVertical: 8, paddingHorizontal: 40 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 22 }}>▲</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 64, fontWeight: '200', color: theme.text, lineHeight: 72 }}>{breakPickerMinutes}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 14, marginBottom: 8 }}>min</Text>
            <TouchableOpacity onPress={() => setBreakPickerMinutes(m => Math.max(m - 1, 1))} style={{ paddingVertical: 8, paddingHorizontal: 40 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 22 }}>▼</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[{ marginTop: 28, width: '100%', paddingVertical: 14, borderRadius: 12, backgroundColor: `${theme.accent}25`, borderWidth: 1.5, borderColor: theme.accent, alignItems: 'center' }]}
              onPress={async () => {
                setBreakModalVisible(false);
                await handleBreak(session.id, breakPickerMinutes);
              }}
            >
              <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 15 }}>Start {breakPickerMinutes} min break</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setBreakModalVisible(false)} style={{ marginTop: 14, padding: 8 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={editModalVisible} animationType="slide">
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Session</Text>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: theme.textSecondary }]}>SESSION NAME</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
            value={editName}
            onChangeText={setEditName}
            placeholder="Session name"
            placeholderTextColor={theme.textSecondary}
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>DURATION</Text>
          <View style={styles.timeRow}>
            <TextInput
              style={[styles.timeInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              value={editDurationHours} onChangeText={setEditDurationHours}
              keyboardType="numeric" maxLength={2} placeholder="0"
              placeholderTextColor={theme.textSecondary}
            />
            <Text style={[styles.timeSep, { color: theme.textSecondary }]}>h</Text>
            <TextInput
              style={[styles.timeInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              value={editDurationMinutes} onChangeText={setEditDurationMinutes}
              keyboardType="numeric" maxLength={2} placeholder="25"
              placeholderTextColor={theme.textSecondary}
            />
            <Text style={[styles.timeSep, { color: theme.textSecondary }]}>m</Text>
          </View>

          <Text style={[styles.label, { color: theme.textSecondary }]}>START TIME</Text>
          <View style={styles.timeRow}>
            <TextInput
              style={[styles.timeInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              value={editHours} onChangeText={setEditHours}
              keyboardType="numeric" maxLength={2} placeholder="HH"
              placeholderTextColor={theme.textSecondary}
            />
            <Text style={[styles.timeSep, { color: theme.text }]}>:</Text>
            <TextInput
              style={[styles.timeInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              value={editMinutes} onChangeText={setEditMinutes}
              keyboardType="numeric" maxLength={2} placeholder="MM"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <Text style={[styles.label, { color: theme.textSecondary }]}>SCHEDULE</Text>
          <View style={styles.scheduleRow}>
            {[
              { key: ScheduleType.TODAY, label: 'Today' },
              { key: ScheduleType.SPECIFIC_DAYS, label: 'Specific Days' },
              { key: ScheduleType.RECURRING, label: 'Recurring' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.scheduleBtn, { borderColor: editSchedule === opt.key ? theme.accent : theme.border }, editSchedule === opt.key && { backgroundColor: `${theme.accent}20` }]}
                onPress={() => setEditSchedule(opt.key)}
              >
                <Text style={[styles.scheduleBtnText, { color: editSchedule === opt.key ? theme.accent : theme.textSecondary }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {editSchedule !== ScheduleType.TODAY && (
            <View style={styles.daysRow}>
              {WEEKDAYS.map(day => (
                <TouchableOpacity
                  key={day.key}
                  style={[styles.dayBtn, { borderColor: editScheduleDays.includes(day.key) ? theme.accent : theme.border }, editScheduleDays.includes(day.key) && { backgroundColor: `${theme.accent}20` }]}
                  onPress={() => toggleDay(day.key)}
                >
                  <Text style={[styles.dayBtnText, { color: editScheduleDays.includes(day.key) ? theme.accent : theme.textSecondary }]}>{day.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[styles.label, { color: theme.textSecondary }]}>FOCUS MODE</Text>

          <TouchableOpacity style={[styles.toggleRow, { borderColor: editMobileFocus ? theme.accent : theme.border }]} onPress={() => setEditMobileFocus(!editMobileFocus)}>
            <View style={styles.toggleLabelRow}>
              <Ionicons name="phone-portrait-outline" size={18} color={editMobileFocus ? theme.accent : theme.textSecondary} />
              <Text style={[styles.toggleLabel, { color: theme.text }]}>Mobile Focus</Text>
            </View>
            <View style={[styles.toggle, editMobileFocus && { backgroundColor: theme.accent }]}>
              <View style={[styles.toggleDot, editMobileFocus && styles.toggleDotActive]} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.toggleRow, { borderColor: editBrowserFocus ? theme.accent : theme.border }]} onPress={() => setEditBrowserFocus(!editBrowserFocus)}>
            <View style={styles.toggleLabelRow}>
              <Ionicons name="globe-outline" size={18} color={editBrowserFocus ? theme.accent : theme.textSecondary} />
              <Text style={[styles.toggleLabel, { color: theme.text }]}>Browser Focus</Text>
            </View>
            <View style={[styles.toggle, editBrowserFocus && { backgroundColor: theme.accent }]}>
              <View style={[styles.toggleDot, editBrowserFocus && styles.toggleDotActive]} />
            </View>
          </TouchableOpacity>

          {editMobileFocus && appGroups.map(group => (
            <TouchableOpacity
              key={group.id}
              style={[styles.groupItem, { borderColor: editGroupId === group.id ? theme.accent : theme.border }, editGroupId === group.id && { backgroundColor: `${theme.accent}20` }]}
              onPress={() => setEditGroupId(editGroupId === group.id ? null : group.id)}
            >
              <Text style={[styles.groupItemText, { color: theme.text }]}>{group.name}</Text>
              <Text style={[styles.groupItemCount, { color: theme.textSecondary }]}>{group.apps?.length || 0} apps</Text>
            </TouchableOpacity>
          ))}

          {editBrowserFocus && (
            <View style={styles.websiteGrid}>
              {PREDEFINED_BLOCKED_WEBSITES.map(site => (
                <TouchableOpacity
                  key={site}
                  style={[styles.websiteChip, { borderColor: editWebsites.includes(site) ? theme.accent : theme.border }, editWebsites.includes(site) && { backgroundColor: `${theme.accent}20` }]}
                  onPress={() => toggleWebsite(site)}
                >
                  <Text style={[styles.websiteText, { color: editWebsites.includes(site) ? theme.accent : theme.textSecondary }]}>{site}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.accentDark }, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </Modal>
    </>
  );
}

function DetailRow({ icon, label, value, theme, color }: { icon: string; label: string; value: string; theme: ReturnType<typeof useTheme>; color?: string }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon as any} size={16} color={color || theme.textSecondary} style={{ marginRight: 10 }} />
      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: color || theme.text }]}>{value}</Text>
    </View>
  );
}

function FocusRow({ icon, label, enabled, theme }: { icon: string; label: string; enabled: boolean; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon as any} size={16} color={enabled ? theme.accent : theme.textSecondary} style={{ marginRight: 10 }} />
      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Ionicons name={enabled ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={enabled ? theme.accent : theme.border} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 16 },
  statusText: { fontSize: 13, fontWeight: '500' },
  sessionName: { fontSize: 28, fontWeight: '300', letterSpacing: 0.5, marginBottom: 24 },
  card: { borderRadius: 12, borderWidth: 1, padding: 4, marginBottom: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 0 },
  detailLabel: { flex: 1, fontSize: 14, fontWeight: '300' },
  detailValue: { fontSize: 14, fontWeight: '500' },
  editHint: { textAlign: 'center', fontSize: 13, marginTop: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '500' },
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
  toggleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleLabel: { fontSize: 15 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#ccc', justifyContent: 'center', paddingHorizontal: 2 },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleDotActive: { alignSelf: 'flex-end' },
  groupItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderWidth: 1, borderRadius: 10, marginTop: 8 },
  groupItemText: { fontSize: 15 },
  groupItemCount: { fontSize: 13 },
  websiteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  websiteChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  websiteText: { fontSize: 13 },
  saveBtn: { height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 32 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  actionButtonsContainer: { flexDirection: 'row', marginTop: 24, gap: 12 },
  editBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderWidth: 1, borderRadius: 12 },
  editBtnText: { fontSize: 14, fontWeight: '500' },
  deleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderWidth: 1, borderRadius: 12 },
  deleteBtnText: { fontSize: 14, fontWeight: '500' },
  breakBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1.5, marginTop: 12 },
  breakBtnText: { color: '#90EE90', fontSize: 15, fontWeight: '600' },
  breakBtnSub: { color: 'rgba(144,238,144,0.65)', fontSize: 12 },
});
