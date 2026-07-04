// ============================================================
// Focussive Mobile — Create Session Screen
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme } from '@/utils/theme';
import { sessionApi, appGroupApi, websiteGroupApi } from '@/utils/api';
import { useSessions } from '@/context/SessionContext';
import { ScheduleType, Weekday } from '@focussive/shared';
import type { AppGroup, WebsiteGroup } from '@focussive/shared';
import { Ionicons } from '@expo/vector-icons';
import { hasRequiredPermissions, requestUsageStatsPermission, requestOverlayPermission } from '@focussive/app-blocker';

// ── Mini calendar component ──────────────────────────────────────────────────

function MiniCalendar({
  selectedDates,
  onToggleDate,
  theme,
}: {
  selectedDates: string[];
  onToggleDate: (iso: string) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthName = new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long', year: 'numeric' });

  function isoOf(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const cells: (number | null)[] = Array(firstDay).fill(null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <View style={[calStyles.cal, { borderColor: theme.border }]}>
      <View style={calStyles.header}>
        <TouchableOpacity onPress={prevMonth}>
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={[calStyles.monthTitle, { color: theme.text }]}>{monthName}</Text>
        <TouchableOpacity onPress={nextMonth}>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={calStyles.weekRow}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <Text key={d} style={[calStyles.weekDay, { color: theme.textSecondary }]}>{d}</Text>
        ))}
      </View>
      <View style={calStyles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`empty-${i}`} style={calStyles.cell} />;
          const iso = isoOf(day);
          const isSelected = selectedDates.includes(iso);
          const isPast = iso < todayISO;
          return (
            <TouchableOpacity
              key={iso}
              style={[calStyles.cell, isSelected && { backgroundColor: theme.accent }]}
              onPress={() => !isPast && onToggleDate(iso)}
              disabled={isPast}
            >
              <Text style={[
                calStyles.dayText,
                { color: isSelected ? '#fff' : isPast ? theme.textSecondary : theme.text },
                isPast && { opacity: 0.35 },
              ]}>
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  cal: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  monthTitle: { fontSize: 15, fontWeight: '500' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 20 },
  dayText: { fontSize: 13 },
});

// ── Weekday picker ────────────────────────────────────────────────────────────

const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: Weekday.MONDAY, label: 'Mon' },
  { key: Weekday.TUESDAY, label: 'Tue' },
  { key: Weekday.WEDNESDAY, label: 'Wed' },
  { key: Weekday.THURSDAY, label: 'Thu' },
  { key: Weekday.FRIDAY, label: 'Fri' },
  { key: Weekday.SATURDAY, label: 'Sat' },
  { key: Weekday.SUNDAY, label: 'Sun' },
];

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CreateSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { refreshSessions } = useSessions();

  const [name, setName] = useState('');
  const [durationHours, setDurationHours] = useState('0');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [startHours, setStartHours] = useState('');
  const [startMinutes, setStartMinutes] = useState('');
  const [startAmPm, setStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [use24Hour, setUse24Hour] = useState(true);
  const [schedule, setSchedule] = useState<ScheduleType>(ScheduleType.TODAY);
  const [recurringDays, setRecurringDays] = useState<Weekday[]>([]);   // for RECURRING
  const [scheduledDates, setScheduledDates] = useState<string[]>([]);   // for SCHEDULED
  const [mobileFocus, setMobileFocus] = useState(false);
  const [browserFocus, setBrowserFocus] = useState(false);
  const [appGroups, setAppGroups] = useState<AppGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [websiteGroups, setWebsiteGroups] = useState<WebsiteGroup[]>([]);
  const [selectedWebsiteGroupIds, setSelectedWebsiteGroupIds] = useState<string[]>([]);
  const [extraWebsites, setExtraWebsites] = useState<string[]>([]);
  const [customWebsite, setCustomWebsite] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    appGroupApi.getAll().then(r => setAppGroups(r.data as AppGroup[])).catch(() => {});
    websiteGroupApi.getAll().then(r => setWebsiteGroups(r.data as WebsiteGroup[])).catch(() => {});
    loadTimeFormat();
  }, []);

  async function loadTimeFormat() {
    try {
      const format = await AsyncStorage.getItem('time_format');
      setUse24Hour(format !== '12');
    } catch {
      setUse24Hour(true);
    }
  }

  function toggleRecurringDay(day: Weekday) {
    setRecurringDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }
  function toggleScheduledDate(iso: string) {
    setScheduledDates(prev => prev.includes(iso) ? prev.filter(d => d !== iso) : [...prev, iso]);
  }
  function toggleWebsiteGroup(id: string) {
    setSelectedWebsiteGroupIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }
  function addCustomWebsite() {
    const site = customWebsite.trim().toLowerCase().replace(/^https?:\/\//, '');
    if (!site) return;
    if (!extraWebsites.includes(site)) setExtraWebsites(prev => [...prev, site]);
    setCustomWebsite('');
  }
  function removeExtraWebsite(site: string) {
    setExtraWebsites(prev => prev.filter(s => s !== site));
  }

  async function handleCreate() {
    if (!name.trim()) { Alert.alert('Error', 'Session name is required'); return; }

    const dh = parseInt(durationHours, 10) || 0;
    const dm = parseInt(durationMinutes, 10) || 0;
    const duration = dh * 60 + dm;
    if (duration < 1) { Alert.alert('Error', 'Duration must be at least 1 minute'); return; }

    let sh = parseInt(startHours, 10) || 0;
    const sm = parseInt(startMinutes, 10) || 0;
    
    // Convert 12-hour to 24-hour if needed
    if (!use24Hour) {
      if (sh < 1 || sh > 12) {
        Alert.alert('Error', 'Hour must be between 1 and 12 for 12-hour format');
        return;
      }
      if (startAmPm === 'PM' && sh !== 12) sh += 12;
      if (startAmPm === 'AM' && sh === 12) sh = 0;
    } else {
      if (sh < 0 || sh > 23) {
        Alert.alert('Error', 'Hour must be between 0 and 23 for 24-hour format');
        return;
      }
    }
    
    if (sm < 0 || sm > 59) {
      Alert.alert('Error', 'Minutes must be between 0 and 59');
      return;
    }
    const startTime = `${sh.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`;

    if (schedule === ScheduleType.RECURRING && recurringDays.length === 0) {
      Alert.alert('Error', 'Select at least one day for recurring sessions');
      return;
    }
    if (schedule === ScheduleType.SCHEDULED && scheduledDates.length === 0) {
      Alert.alert('Error', 'Select at least one date');
      return;
    }

    if (mobileFocus) {
      if (!selectedGroupId) {
        Alert.alert('Error', 'Select an app group to block for mobile focus');
        return;
      }
      
      const hasPerms = await hasRequiredPermissions();
      if (!hasPerms) {
        Alert.alert(
          'Permissions Required', 
          'You need to grant Usage Access and Display Over Other Apps permissions to use Mobile Focus.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Grant Usage Access', 
              onPress: () => requestUsageStatsPermission() 
            },
            { 
              text: 'Grant Overlay', 
              onPress: () => requestOverlayPermission() 
            },
          ]
        );
        return;
      }
    }

    // Combine website group websites + extra websites
    const allBlockedWebsites = [
      ...new Set([
        ...websiteGroups.filter(g => selectedWebsiteGroupIds.includes(g.id)).flatMap(g => g.websites),
        ...extraWebsites,
      ]),
    ];

    setLoading(true);
    try {
      await sessionApi.create({
        name: name.trim(),
        duration,
        schedule,
        schedule_days: schedule === ScheduleType.RECURRING
          ? recurringDays
          : schedule === ScheduleType.SCHEDULED
          ? scheduledDates
          : [],
        start_time: startTime,
        mobile_focus: mobileFocus,
        browser_focus: browserFocus,
        app_group_id: mobileFocus ? selectedGroupId : null,
        blocked_websites: browserFocus ? allBlockedWebsites : [],
        website_group_ids: browserFocus ? selectedWebsiteGroupIds : [],
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
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>

      {/* Session Name */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>SESSION NAME</Text>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
        placeholder="e.g. Deep Work, Study, Writing..."
        placeholderTextColor={theme.textSecondary}
        value={name} onChangeText={setName}
      />

      {/* Duration */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>DURATION</Text>
      <View style={styles.timeRow}>
        <TextInput
          style={[styles.timeInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
          placeholder="0" placeholderTextColor={theme.textSecondary}
          value={durationHours} onChangeText={setDurationHours} keyboardType="numeric" maxLength={2}
        />
        <Text style={[styles.timeSep, { color: theme.textSecondary }]}>h</Text>
        <TextInput
          style={[styles.timeInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
          placeholder="0" placeholderTextColor={theme.textSecondary}
          value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="numeric" maxLength={2}
        />
        <Text style={[styles.timeSep, { color: theme.textSecondary }]}>m</Text>
      </View>

      {/* Start Time */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>START TIME {!use24Hour && '(12-hour)'}</Text>
      <View style={styles.timeRow}>
        <TextInput
          style={[styles.timeInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
          placeholder={use24Hour ? 'HH' : '12'} placeholderTextColor={theme.textSecondary}
          value={startHours} onChangeText={setStartHours} keyboardType="numeric" maxLength={2}
        />
        <Text style={[styles.timeSep, { color: theme.text }]}>:</Text>
        <TextInput
          style={[styles.timeInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
          placeholder="MM" placeholderTextColor={theme.textSecondary}
          value={startMinutes} onChangeText={setStartMinutes} keyboardType="numeric" maxLength={2}
        />
        {!use24Hour && (
          <View style={styles.ampmRow}>
            <TouchableOpacity
              style={[styles.ampmBtn, { borderColor: theme.border, backgroundColor: startAmPm === 'AM' ? theme.accent : theme.surface }]}
              onPress={() => setStartAmPm('AM')}
            >
              <Text style={[styles.ampmText, { color: startAmPm === 'AM' ? '#fff' : theme.textSecondary }]}>AM</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ampmBtn, { borderColor: theme.border, backgroundColor: startAmPm === 'PM' ? theme.accent : theme.surface }]}
              onPress={() => setStartAmPm('PM')}
            >
              <Text style={[styles.ampmText, { color: startAmPm === 'PM' ? '#fff' : theme.textSecondary }]}>PM</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Schedule Type */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>SCHEDULE</Text>
      <View style={styles.scheduleRow}>
        {([
          { key: ScheduleType.TODAY, label: 'Today' },
          { key: ScheduleType.SCHEDULED, label: 'Scheduled' },
          { key: ScheduleType.RECURRING, label: 'Recurring' },
        ] as const).map(opt => (
          <TouchableOpacity
            key={String(opt.key)}
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

      {/* Recurring: weekday picker */}
      {schedule === ScheduleType.RECURRING && (
        <View style={styles.daysRow}>
          {WEEKDAYS.map(day => (
            <TouchableOpacity
              key={day.key}
              style={[
                styles.dayBtn,
                { borderColor: recurringDays.includes(day.key) ? theme.accent : theme.border },
                recurringDays.includes(day.key) && { backgroundColor: `${theme.accent}20` },
              ]}
              onPress={() => toggleRecurringDay(day.key)}
            >
              <Text style={[styles.dayBtnText, { color: recurringDays.includes(day.key) ? theme.accent : theme.textSecondary }]}>
                {day.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Scheduled: calendar date picker */}
      {schedule === ScheduleType.SCHEDULED && (
        <>
          <MiniCalendar selectedDates={scheduledDates} onToggleDate={toggleScheduledDate} theme={theme} />
          {scheduledDates.length > 0 && (
            <View style={styles.selectedDatesRow}>
              {scheduledDates.sort().map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.datePill, { backgroundColor: `${theme.accent}20`, borderColor: theme.accent }]}
                  onPress={() => toggleScheduledDate(d)}
                >
                  <Text style={[styles.datePillText, { color: theme.accent }]}>{d}</Text>
                  <Ionicons name="close" size={12} color={theme.accent} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      {/* Focus Mode */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>FOCUS MODE</Text>

      <TouchableOpacity
        style={[styles.toggleRow, { borderColor: mobileFocus ? theme.accent : theme.border }]}
        onPress={async () => {
          if (!mobileFocus) {
            const hasPerms = await hasRequiredPermissions();
            if (!hasPerms) {
              Alert.alert(
                'Permissions Required', 
                'You need to grant Usage Access and Display Over Other Apps permissions to use Mobile Focus.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Grant Usage Access', 
                    onPress: () => requestUsageStatsPermission() 
                  },
                  { 
                    text: 'Grant Overlay', 
                    onPress: () => requestOverlayPermission() 
                  },
                ]
              );
              return; // Do not enable if permissions are missing (or let them enable it anyway but they'll be prompted at creation)
            }
          }
          setMobileFocus(!mobileFocus);
        }}
      >
        <View style={styles.toggleLabelRow}>
          <Ionicons name="phone-portrait-outline" size={18} color={mobileFocus ? theme.accent : theme.textSecondary} />
          <Text style={[styles.toggleLabel, { color: theme.text }]}>Mobile Focus</Text>
        </View>
        <View style={[styles.toggle, mobileFocus && { backgroundColor: theme.accent }]}>
          <View style={[styles.toggleDot, mobileFocus && styles.toggleDotActive]} />
        </View>
      </TouchableOpacity>

      {mobileFocus && appGroups.length > 0 && (
        <>
          <Text style={[styles.subLabel, { color: theme.textSecondary }]}>App Group to Block</Text>
          {appGroups.map(group => {
            const isSelected = selectedGroupId === group.id;
            return (
              <View key={group.id}>
                <TouchableOpacity
                  style={[
                    styles.groupItem,
                    { borderColor: isSelected ? theme.accent : theme.border },
                    isSelected && { backgroundColor: `${theme.accent}15` },
                  ]}
                  onPress={() => setSelectedGroupId(isSelected ? null : group.id)}
                >
                  <Text style={[styles.groupItemText, { color: theme.text }]}>{group.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.groupItemCount, { color: theme.textSecondary }]}>{group.apps?.length || 0} apps</Text>
                    <Ionicons name={isSelected ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
                  </View>
                </TouchableOpacity>
                {isSelected && group.apps && group.apps.length > 0 && (
                  <View style={[styles.appListContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    {group.apps.map((app, index) => (
                      <View key={app.id || index} style={[styles.appListItem, index < group.apps.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                        <Ionicons name="apps-outline" size={16} color={theme.textSecondary} />
                        <Text style={[styles.appListText, { color: theme.text }]}>{app.name}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      <TouchableOpacity
        style={[styles.toggleRow, { borderColor: browserFocus ? theme.accent : theme.border }]}
        onPress={() => setBrowserFocus(!browserFocus)}
      >
        <View style={styles.toggleLabelRow}>
          <Ionicons name="globe-outline" size={18} color={browserFocus ? theme.accent : theme.textSecondary} />
          <Text style={[styles.toggleLabel, { color: theme.text }]}>Browser Focus</Text>
        </View>
        <View style={[styles.toggle, browserFocus && { backgroundColor: theme.accent }]}>
          <View style={[styles.toggleDot, browserFocus && styles.toggleDotActive]} />
        </View>
      </TouchableOpacity>

      {browserFocus && (
        <>
          {/* Website Groups */}
          {websiteGroups.length > 0 && (
            <>
              <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Website Groups</Text>
              {websiteGroups.map(group => {
                const isSelected = selectedWebsiteGroupIds.includes(group.id);
                return (
                  <View key={group.id}>
                    <TouchableOpacity
                      style={[
                        styles.groupItem,
                        { borderColor: isSelected ? theme.accent : theme.border },
                        isSelected && { backgroundColor: `${theme.accent}15` },
                      ]}
                      onPress={() => toggleWebsiteGroup(group.id)}
                    >
                      <Text style={[styles.groupItemText, { color: theme.text }]}>{group.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.groupItemCount, { color: theme.textSecondary }]}>{group.websites?.length || 0} sites</Text>
                        <Ionicons name={isSelected ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
                      </View>
                    </TouchableOpacity>
                    {isSelected && group.websites && group.websites.length > 0 && (
                      <View style={[styles.appListContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        {group.websites.map((website, index) => (
                          <View key={`${group.id}-${website}-${index}`} style={[styles.appListItem, index < group.websites.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                            <Ionicons name="globe-outline" size={16} color={theme.textSecondary} />
                            <Text style={[styles.appListText, { color: theme.text }]}>{website}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}

          {/* Additional individual websites */}
          <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Additional Websites</Text>
          <View style={styles.customRow}>
            <TextInput
              style={[styles.customInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              placeholder="example.com" placeholderTextColor={theme.textSecondary}
              value={customWebsite} onChangeText={setCustomWebsite}
              autoCapitalize="none" keyboardType="url"
              onSubmitEditing={addCustomWebsite}
            />
            <TouchableOpacity onPress={addCustomWebsite} style={[styles.addIconBtn, { backgroundColor: theme.accent }]}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          {extraWebsites.length > 0 && (
            <View style={styles.chipWrap}>
              {extraWebsites.map((site, idx) => (
                <TouchableOpacity
                  key={`extra-${site}-${idx}`}
                  style={[styles.sitePill, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => removeExtraWebsite(site)}
                >
                  <Text style={[styles.sitePillText, { color: theme.text }]}>{site}</Text>
                  <Ionicons name="close" size={12} color={theme.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      {/* Create Button */}
      <TouchableOpacity
        style={[styles.createBtn, { backgroundColor: theme.accentDark }, loading && { opacity: 0.6 }]}
        onPress={handleCreate}
        disabled={loading}
      >
        <Text style={styles.createBtnText}>{loading ? 'Creating...' : 'Create Session'}</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: 8, marginTop: 20 },
  subLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 8, marginTop: 12 },
  input: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, fontSize: 16, fontWeight: '300' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { width: 70, height: 48, borderWidth: 1, borderRadius: 10, textAlign: 'center', fontSize: 18, fontWeight: '300' },
  timeSep: { fontSize: 24, fontWeight: '300' },
  ampmRow: { flexDirection: 'row', gap: 4, marginLeft: 8 },
  ampmBtn: { width: 52, height: 48, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  ampmText: { fontSize: 14, fontWeight: '500' },
  scheduleRow: { flexDirection: 'row', gap: 8 },
  scheduleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  scheduleBtnText: { fontSize: 13, fontWeight: '400' },
  daysRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dayBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  dayBtnText: { fontSize: 12, fontWeight: '400' },
  selectedDatesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  datePillText: { fontSize: 12, fontWeight: '500' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderRadius: 10, marginTop: 8 },
  toggleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleLabel: { fontSize: 15 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#ccc', justifyContent: 'center', paddingHorizontal: 2 },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleDotActive: { alignSelf: 'flex-end' },
  groupItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderWidth: 1, borderRadius: 10, marginTop: 6 },
  groupItemText: { fontSize: 15 },
  groupItemCount: { fontSize: 13 },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  customInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 14 },
  addIconBtn: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  sitePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  sitePillText: { fontSize: 12 },
  appListContainer: { marginTop: 4, marginBottom: 8, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  appListItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  appListText: { fontSize: 14, flex: 1 },
  createBtn: { height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 32 },
  createBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
