// ============================================================
// Focussive Mobile — Session Detail + Edit Screen
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark } from '@/utils/theme';
import { sessionApi, appGroupApi } from '@/utils/api';
import { useSessions } from '@/context/SessionContext';
import { ScheduleType, Weekday, PREDEFINED_BLOCKED_WEBSITES, SessionStatus, formatDuration, formatTime, formatCountdown, getRemainingSeconds } from '@focussive/shared';
import type { Session, AppGroup, SessionTimeSlot } from '@focussive/shared';
import InstalledApps from '@focussive/installed-apps';
import TimeSlotPicker from '@/components/TimeSlotPicker';
import MiniCalendar from '@/components/MiniCalendar';

const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: Weekday.MONDAY, label: 'Mon' },
  { key: Weekday.TUESDAY, label: 'Tue' },
  { key: Weekday.WEDNESDAY, label: 'Wed' },
  { key: Weekday.THURSDAY, label: 'Thu' },
  { key: Weekday.FRIDAY, label: 'Fri' },
  { key: Weekday.SATURDAY, label: 'Sat' },
  { key: Weekday.SUNDAY, label: 'Sun' },
];

// Break accent. Raw Saffron sits at ~1.7:1 on the light Cosmic latte
// background, so light mode uses a darkened variant of the same hue.
const BREAK_ACCENT_DARK = '#F6C531';
const BREAK_ACCENT_LIGHT = '#9A5B00';

// Small countdown for the break ongoing indicator on session detail
function BreakDetailCountdown({ breakEndsAt }: { breakEndsAt: string }) {
  const isDark = useIsDark();
  const [left, setLeft] = useState(Math.max(0, Math.floor((new Date(breakEndsAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const iv = setInterval(() => setLeft(Math.max(0, Math.floor((new Date(breakEndsAt).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(iv);
  }, [breakEndsAt]);
  return (
    <Text
      style={{
        color: isDark ? BREAK_ACCENT_DARK : BREAK_ACCENT_LIGHT,
        fontSize: 16,
        fontWeight: '300',
        fontVariant: ['tabular-nums'],
      }}
    >
      {formatCountdown(left)}
    </Text>
  );
}


export default function SessionDetailScreen() {
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const theme = useTheme();
  const isDark = useIsDark();
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
  const [editTimeSlots, setEditTimeSlots] = useState<SessionTimeSlot[]>([
    { start_time: '08:00', end_time: '09:00' },
  ]);
  const [editSchedule, setEditSchedule] = useState<ScheduleType>(ScheduleType.TODAY);
  const [editScheduleDays, setEditScheduleDays] = useState<Weekday[]>([]);
  const [editScheduledDates, setEditScheduledDates] = useState<string[]>([]);
  const [editMobileFocus, setEditMobileFocus] = useState(false);
  const [editBrowserFocus, setEditBrowserFocus] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editWebsites, setEditWebsites] = useState<string[]>([]);
  const [appIconMap, setAppIconMap] = useState<Record<string, string>>({});
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [use24Hour, setUse24Hour] = useState(true);

  async function loadTimeFormat() {
    try {
      const format = await AsyncStorage.getItem('time_format');
      setUse24Hour(format !== '12');
    } catch {
      setUse24Hour(true);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadTimeFormat();
    }, [])
  );

  const fetchSession = useCallback(async () => {
    try {
      const data = await sessionApi.getById(id) as Session & { violations_count?: number };
      setSession(data);
    } catch {
      Alert.alert('Error', 'Session not found');
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchSession();
    appGroupApi.getAll().then(r => setAppGroups(r.data as AppGroup[])).catch(() => {});
    if (InstalledApps?.getApps) {
      InstalledApps.getApps().then(apps => {
        const map: Record<string, string> = {};
        for (const app of apps) {
          const icon = app.icon || (app as any).iconUri;
          if (app.id && icon) {
            map[app.id] = icon;
          }
        }
        setAppIconMap(map);
      }).catch(() => {});
    }
  }, [fetchSession]);

  function getFaviconUrl(website: string) {
    const domain = website.replace(/^https?:\/\//, '').split('/')[0];
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  }

  // Header configuration
  useEffect(() => {
    navigation.setOptions({
      title: '',
      headerTitle: '',
      headerRight: () => null,
    });
  }, [navigation]);

  function openEditModal() {
    if (!session) return;
    setEditName(session.name);
    if (session.time_slots && session.time_slots.length > 0) {
      setEditTimeSlots(session.time_slots);
    } else {
      const [sh, sm] = (session.start_time || '08:00').split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = (startMin + (session.duration || 30)) % (24 * 60);
      const eh = Math.floor(endMin / 60);
      const em = endMin % 60;
      setEditTimeSlots([
        {
          start_time: session.start_time || '08:00',
          end_time: `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`,
        },
      ]);
    }
    const sched = (session.schedule as ScheduleType) || ScheduleType.TODAY;
    setEditSchedule(sched);
    if (sched === ScheduleType.RECURRING) {
      setEditScheduleDays((session.schedule_days as Weekday[]) || []);
      setEditScheduledDates([]);
    } else if (sched === ScheduleType.SCHEDULED) {
      setEditScheduledDates((session.schedule_days as string[]) || []);
      setEditScheduleDays([]);
    } else {
      setEditScheduleDays([]);
      setEditScheduledDates([]);
    }
    setEditMobileFocus(session.mobile_focus || false);
    setEditBrowserFocus(session.browser_focus || false);
    setEditGroupId(session.app_group_ids?.[0] ?? null);
    setEditWebsites((session.blocked_websites as string[]) || []);
    setEditModalVisible(true);
  }

  function toggleEditScheduledDate(iso: string) {
    setEditScheduledDates(prev =>
      prev.includes(iso) ? prev.filter(d => d !== iso) : [...prev, iso]
    );
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
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)');
              }
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete session');
            }
          },
        },
      ]
    );
  }

  async function handleSkipSession() {
    if (!session) return;

    try {
      const status = await sessionApi.getSkipStatus();
      if (status && status.skips_remaining <= 0) {
        Alert.alert(
          'Skip Limit Reached',
          `You have used all ${status.monthly_skip_limit} skips for this month. You can adjust your limit in Settings > Preferences.`,
          [{ text: 'OK' }]
        );
        return;
      }

      const remainingText = status ? ` (${status.skips_remaining} skip${status.skips_remaining === 1 ? '' : 's'} left this month)` : '';

      Alert.alert(
        'Skip this session?',
        `This session will be skipped for this occurrence${remainingText}.\n\nIt will not count as a violation and no history will be logged. It will resume automatically on the next scheduled day.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Skip',
            style: 'destructive',
            onPress: async () => {
              try {
                const res = await sessionApi.skip(session.id);
                await refreshSessions();
                const remainingAfter = res.skips_remaining !== undefined ? ` (${res.skips_remaining} skip${res.skips_remaining === 1 ? '' : 's'} remaining this month)` : '';
                Alert.alert('Session Skipped', `The session has been skipped for today${remainingAfter}.`, [
                  {
                    text: 'OK',
                    onPress: () => {
                      if (router.canGoBack()) router.back();
                      else router.replace('/(tabs)');
                    },
                  },
                ]);
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to skip session');
              }
            },
          },
        ]
      );
    } catch {
      // If fetching status failed, fallback to direct skip attempt
      Alert.alert(
        'Skip this session?',
        'This session will be skipped for this occurrence. It will not count as a violation and no history will be logged. It will resume automatically on the next scheduled day.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Skip',
            style: 'destructive',
            onPress: async () => {
              try {
                await sessionApi.skip(session.id);
                await refreshSessions();
                Alert.alert('Session Skipped', 'The session has been skipped for today.', [
                  {
                    text: 'OK',
                    onPress: () => {
                      if (router.canGoBack()) router.back();
                      else router.replace('/(tabs)');
                    },
                  },
                ]);
              } catch (skipErr: any) {
                Alert.alert('Error', skipErr.message || 'Failed to skip session');
              }
            },
          },
        ]
      );
    }
  }

  const skipHandledRef = useRef(false);
  useEffect(() => {
    if (session && action === 'skip' && !skipHandledRef.current) {
      skipHandledRef.current = true;
      handleSkipSession();
    }
  }, [session, action]);

  function handleCancelSession() {
    if (!session) return;
    Alert.alert(
      'Cancel Session',
      `End "${session.name}" now? Your progress will be saved.`,
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'Cancel Session',
          style: 'destructive',
          onPress: async () => {
            try {
              await sessionApi.cancel(session.id);
              await refreshSessions();
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)');
              }
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'Failed to cancel session');
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
    if (!editTimeSlots || editTimeSlots.length === 0) {
      Alert.alert('Error', 'Please add at least one time duration');
      return;
    }

    const primarySlot = editTimeSlots[0];
    const [sh, sm] = primarySlot.start_time.split(':').map(Number);
    const [eh, em] = primarySlot.end_time.split(':').map(Number);
    let slotMinutes = (eh * 60 + em) - (sh * 60 + sm);
    if (slotMinutes <= 0) slotMinutes += 24 * 60;
    const duration = Math.max(1, slotMinutes);

    setSaving(true);
    try {
      await sessionApi.update(id, {
        name: editName.trim(),
        duration,
        start_time: primarySlot.start_time,
        time_slots: editTimeSlots,
        schedule: editSchedule,
        schedule_days:
          editSchedule === ScheduleType.RECURRING
            ? editScheduleDays
            : editSchedule === ScheduleType.SCHEDULED
            ? editScheduledDates
            : [],
        mobile_focus: editMobileFocus,
        browser_focus: editBrowserFocus,
        app_group_ids: editMobileFocus && editGroupId ? [editGroupId] : [],
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
  const isOnBreak = (session as any).is_on_break ?? false;
  const breakEndsAt: string | null = (session as any).break_ends_at ?? null;
  const breakRemaining = Math.floor((session.break_used_seconds != null
    ? Math.max(0, ((session.max_break_minutes ?? 0) * 60) - session.break_used_seconds)
    : (session.max_break_minutes ?? 0) * 60) / 60);
  const activeGreen = '#22B14C';
  const liveRemaining = isActive ? getRemainingSeconds(session) : 0;

  return (
    <>
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: isActive ? 'rgba(34, 177, 76, 0.16)' : theme.surface }]}>
          <Ionicons
            name={isActive ? 'radio-button-on' : 'calendar-outline'}
            size={16}
            color={isActive ? '#22B14C' : theme.textSecondary}
          />
          <Text style={[styles.statusText, { color: isActive ? '#22B14C' : theme.textSecondary }]}>
            {isActive ? 'Active' : session.status.charAt(0).toUpperCase() + session.status.slice(1)}
          </Text>
        </View>

        {isActive && (
          <View style={[styles.liveBanner, { borderColor: '#1B8C3C', backgroundColor: '#22B14C' }]}> 
            <Text style={[styles.liveBannerLabel, { color: '#FFFFFF' }]}>Session running</Text>
            <Text style={[styles.liveBannerName, { color: '#FFFFFF' }]} numberOfLines={1}>{session.name}</Text>
            <Text style={[styles.liveBannerCountdown, { color: '#FFFFFF' }]}>{formatCountdown(liveRemaining)}</Text>
            <Text style={[styles.liveBannerMeta, { color: 'rgba(255, 255, 255, 0.88)' }]}>remaining until this session ends</Text>
          </View>
        )}

        {/* Name */}
        <Text style={[styles.sessionName, { color: theme.text }]}>{session.name}</Text>

        {/* Details Card (borderless) */}
        <View style={[styles.card, { backgroundColor: theme.card, borderWidth: 0 }]}>
          <DetailRow icon="time-outline" label="Duration" value={formatDuration(session.duration)} theme={theme} />
          <DetailRow icon="play-outline" label="Start Time" value={formatTime(session.start_time)} theme={theme} />
          <DetailRow
            icon="calendar-outline"
            label="Schedule"
            value={session.schedule === 'scheduled' ? 'Later' : session.schedule.charAt(0).toUpperCase() + session.schedule.slice(1)}
            theme={theme}
          />

          {/* If recurring: show 7 weekday pills matching create session styling */}
          {session.schedule === 'recurring' && (
            <View style={styles.detailDaysRow}>
              {WEEKDAYS.map((day, index) => {
                const isSelected = ((session.schedule_days as string[]) || []).map(d => d.toLowerCase()).includes(day.key.toLowerCase());
                const prevSelected = index > 0 && ((session.schedule_days as string[]) || []).map(d => d.toLowerCase()).includes(WEEKDAYS[index - 1].key.toLowerCase());
                const nextSelected = index < WEEKDAYS.length - 1 && ((session.schedule_days as string[]) || []).map(d => d.toLowerCase()).includes(WEEKDAYS[index + 1].key.toLowerCase());
                return (
                  <View
                    key={day.key}
                    style={[
                      styles.detailDayBtn,
                      {
                        backgroundColor: isSelected ? theme.accent : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                        borderTopLeftRadius: prevSelected ? 0 : 8,
                        borderBottomLeftRadius: prevSelected ? 0 : 8,
                        borderTopRightRadius: nextSelected ? 0 : 8,
                        borderBottomRightRadius: nextSelected ? 0 : 8,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.detailDayBtnText,
                        {
                          color: isSelected ? (isDark ? '#2F3456' : '#FFFFFF') : theme.textSecondary,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {day.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* If scheduled (Later): show date pills */}
          {session.schedule === 'scheduled' && Array.isArray(session.schedule_days) && session.schedule_days.length > 0 && (
            <View style={styles.detailDatesRow}>
              {session.schedule_days.map((d: string) => (
                <View key={d} style={[styles.detailDatePill, { backgroundColor: `${theme.accent}20` }]}>
                  <Text style={[styles.detailDatePillText, { color: theme.accent }]}>{d}</Text>
                </View>
              ))}
            </View>
          )}

          {(session.violations_count ?? 0) > 0 && (
            <DetailRow icon="warning-outline" label="Violations" value={String(session.violations_count)} theme={theme} color={theme.danger} />
          )}
          {session.allow_breaks && (
            <DetailRow icon="cafe-outline" label="Break Time" value={`${session.max_break_minutes ?? 0} min (${breakRemaining} remaining)`} theme={theme} />
          )}
        </View>

        {/* Focus Modes Card (borderless) */}
        <View style={[styles.card, { backgroundColor: theme.card, borderWidth: 0 }]}>
          <FocusRow icon="phone-portrait-outline" label="Mobile Focus" enabled={session.mobile_focus || false} theme={theme} />
          <FocusRow icon="globe-outline" label="Browser Focus" enabled={session.browser_focus || false} theme={theme} />
        </View>

        {!isEditable && (
          <Text style={[styles.editHint, { color: theme.textSecondary }]}>
            {isActive ? 'Stop the session to edit or delete it' : 'Cannot edit a completed session'}
          </Text>
        )}

        {/* Action Buttons — shown for all non-active sessions (Filled Buttons, Borderless) */}
        {!isActive && (
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[styles.editBtn, { backgroundColor: theme.accent, borderWidth: 0 }]}
              onPress={openEditModal}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={16} color={isDark ? '#2F3456' : '#FFFFFF'} />
              <Text style={[styles.editBtnText, { color: isDark ? '#2F3456' : '#FFFFFF' }]}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteBtn, { backgroundColor: theme.danger, borderWidth: 2, borderColor: theme.dangerBorder }]}
              onPress={handleDelete}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
              <Text style={[styles.deleteBtnText, { color: '#FFFFFF' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Take a Break button — active sessions with allow_breaks, not currently on break (Filled, Borderless) */}
        {isActive && session.allow_breaks && !isOnBreak && (
          <View style={{ paddingHorizontal: 0, marginBottom: 12 }}>
            {breakRemaining > 0 ? (
              <TouchableOpacity
                style={[
                  styles.breakBtn,
                  {
                    backgroundColor: isDark ? 'rgba(74, 222, 128, 0.22)' : 'rgba(34, 197, 94, 0.16)',
                    borderWidth: 0,
                  },
                ]}
                onPress={() => { setBreakPickerMinutes(1); setBreakModalVisible(true); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.breakBtnText, { color: isDark ? BREAK_ACCENT_DARK : BREAK_ACCENT_LIGHT }]}>
                  Take a break
                </Text>
                <Text style={styles.breakBtnSub}>{breakRemaining} min remaining</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.breakBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: 0, opacity: 0.5 }]}>
                <Text style={[styles.breakBtnText, { color: theme.textSecondary }]}>No break time available</Text>
              </View>
            )}
          </View>
        )}

        {/* Break ongoing indicator on session detail (borderless) */}
        {isActive && isOnBreak && (
          <View style={[styles.breakOngoingRow, { backgroundColor: `${activeGreen}15`, borderWidth: 0 }]}> 
            <Text style={[styles.breakOngoingLabel, { color: isDark ? BREAK_ACCENT_DARK : BREAK_ACCENT_LIGHT }]}>
              Break ongoing
            </Text>
            {breakEndsAt && (
              <BreakDetailCountdown breakEndsAt={breakEndsAt} />
            )}
          </View>
        )}

        {/* Cancel Session button — active sessions only (Filled, Borderless) */}
        {isActive && (
          <TouchableOpacity
            style={[styles.cancelSessionBtn, { backgroundColor: theme.danger, borderWidth: 0 }]}
            onPress={handleCancelSession}
            activeOpacity={0.8}
          >
            <Ionicons name="stop-circle-outline" size={16} color="#FFFFFF" />
            <Text style={[styles.cancelSessionBtnText, { color: '#FFFFFF' }]}>Cancel Session</Text>
          </TouchableOpacity>
        )}

        {/* Skip this session button — upcoming or running sessions (Filled, Borderless) */}
        {(isActive || session.status === SessionStatus.SCHEDULED) && (
          <TouchableOpacity
            style={[styles.skipSessionBtn, { backgroundColor: '#D97706', borderWidth: 0 }]}
            onPress={handleSkipSession}
            activeOpacity={0.8}
          >
            <Ionicons name="play-forward-outline" size={16} color="#FFFFFF" />
            <Text style={[styles.skipSessionBtnText, { color: '#FFFFFF' }]}>Skip this session</Text>
          </TouchableOpacity>
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
          <View style={[styles.modalHeader, { justifyContent: 'flex-end' }]}>
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

          <Text style={[styles.label, { color: theme.textSecondary }]}>
            Time durations{use24Hour ? ' (24 hour format)' : ''}
          </Text>
          <TimeSlotPicker
            slots={editTimeSlots}
            onChangeSlots={setEditTimeSlots}
            use24Hour={use24Hour}
            theme={theme}
            maxSlots={5}
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>SCHEDULE</Text>
          <View style={styles.scheduleRow}>
            {[
              { key: ScheduleType.TODAY, label: 'Today' },
              { key: ScheduleType.RECURRING, label: 'Recurring' },
              { key: ScheduleType.SCHEDULED, label: 'Later' },
            ].map(opt => {
              const isSelected = editSchedule === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.scheduleBtn,
                    { backgroundColor: isSelected ? theme.accent : theme.surface },
                  ]}
                  onPress={() => setEditSchedule(opt.key)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.scheduleBtnText,
                      {
                        color: isSelected ? '#FFFFFF' : theme.textSecondary,
                        fontWeight: isSelected ? '600' : '400',
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Recurring: weekday picker */}
          {editSchedule === ScheduleType.RECURRING && (
            <View style={styles.daysRow}>
              {WEEKDAYS.map((day, index) => {
                const isSelected = editScheduleDays.includes(day.key);
                const prevSelected = index > 0 && editScheduleDays.includes(WEEKDAYS[index - 1].key);
                const nextSelected = index < WEEKDAYS.length - 1 && editScheduleDays.includes(WEEKDAYS[index + 1].key);

                return (
                  <TouchableOpacity
                    key={day.key}
                    style={[
                      styles.dayBtn,
                      isSelected && {
                        backgroundColor: theme.accent,
                        borderTopLeftRadius: prevSelected ? 0 : 10,
                        borderBottomLeftRadius: prevSelected ? 0 : 10,
                        borderTopRightRadius: nextSelected ? 0 : 10,
                        borderBottomRightRadius: nextSelected ? 0 : 10,
                      },
                    ]}
                    onPress={() => toggleDay(day.key)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.dayBtnText,
                        {
                          color: isSelected ? '#FFFFFF' : theme.textSecondary,
                          fontWeight: isSelected ? '600' : '400',
                        },
                      ]}
                    >
                      {day.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Later: calendar date picker */}
          {editSchedule === ScheduleType.SCHEDULED && (
            <>
              <MiniCalendar
                selectedDates={editScheduledDates}
                onToggleDate={toggleEditScheduledDate}
                theme={theme}
              />
              {editScheduledDates.length > 0 && (
                <View style={styles.selectedDatesRow}>
                  {editScheduledDates.sort().map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.datePill, { backgroundColor: `${theme.accent}20`, borderColor: theme.accent }]}
                      onPress={() => toggleEditScheduledDate(d)}
                    >
                      <Text style={[styles.datePillText, { color: theme.accent }]}>{d}</Text>
                      <Ionicons name="close" size={12} color={theme.accent} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Mobile Focus Container */}
          <View style={[styles.focusContainer, { backgroundColor: theme.surface }]}>
            <TouchableOpacity
              style={styles.toggleRow}
              activeOpacity={0.7}
              onPress={() => setEditMobileFocus(!editMobileFocus)}
            >
              <View style={styles.toggleLabelRow}>
                <Ionicons name="phone-portrait-outline" size={20} color={editMobileFocus ? theme.accent : theme.textSecondary} />
                <Text style={[styles.toggleLabel, { color: theme.text }]}>Mobile Focus</Text>
              </View>
              <View style={[styles.toggle, editMobileFocus && { backgroundColor: theme.accent }]}>
                <View style={[styles.toggleDot, editMobileFocus && styles.toggleDotActive]} />
              </View>
            </TouchableOpacity>

            {editMobileFocus && (
              <View style={styles.focusContent}>
                <Text style={[styles.subLabel, { color: theme.textSecondary }]}>App Groups to Block</Text>
                {appGroups.length === 0 ? (
                  <Text style={{ fontSize: 13, color: theme.textSecondary, marginVertical: 6 }}>
                    No app groups available
                  </Text>
                ) : (
                  appGroups.map(group => {
                    const isSelected = editGroupId === group.id;
                    const isExpanded = expandedGroupId === group.id;
                    return (
                      <View key={group.id}>
                        <View
                          style={[
                            styles.groupItem,
                            { backgroundColor: isSelected ? `${theme.accent}20` : theme.background },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.groupItemText, { color: theme.text }]}>{group.name}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                            <TouchableOpacity 
                              onPress={() => setExpandedGroupId(isExpanded ? null : group.id)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}
                            >
                              <Text style={[styles.groupItemCount, { color: theme.textSecondary }]}>{group.apps?.length || 0} apps</Text>
                              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setEditGroupId(isSelected ? null : group.id)}>
                              <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isSelected ? theme.accent : theme.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        {isExpanded && group.apps && group.apps.length > 0 && (
                          <View style={[styles.appListContainer, { backgroundColor: theme.background }]}>
                            {group.apps.map((app, index) => {
                              const icon = (app as any).iconUri || appIconMap[app.id];
                              return (
                                <View key={app.id || index} style={[styles.appListItem, index < group.apps.length - 1 && { borderBottomWidth: 1, borderBottomColor: `${theme.border}30` }]}>
                                  {icon ? (
                                    <Image source={{ uri: icon }} style={styles.appItemIcon} />
                                  ) : (
                                    <Ionicons name="apps-outline" size={18} color={theme.textSecondary} />
                                  )}
                                  <Text style={[styles.appListText, { color: theme.text }]}>{app.name}</Text>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>

          {/* Browser Focus Container */}
          <View style={[styles.focusContainer, { backgroundColor: theme.surface }]}>
            <TouchableOpacity
              style={styles.toggleRow}
              activeOpacity={0.7}
              onPress={() => setEditBrowserFocus(!editBrowserFocus)}
            >
              <View style={styles.toggleLabelRow}>
                <Ionicons name="globe-outline" size={20} color={editBrowserFocus ? theme.accent : theme.textSecondary} />
                <Text style={[styles.toggleLabel, { color: theme.text }]}>Browser Focus</Text>
              </View>
              <View style={[styles.toggle, editBrowserFocus && { backgroundColor: theme.accent }]}>
                <View style={[styles.toggleDot, editBrowserFocus && styles.toggleDotActive]} />
              </View>
            </TouchableOpacity>

            {editBrowserFocus && (
              <View style={styles.focusContent}>
                <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Blocked Websites</Text>
                <View style={styles.websiteGrid}>
                  {PREDEFINED_BLOCKED_WEBSITES.map(site => {
                    const isSel = editWebsites.includes(site);
                    const faviconUrl = getFaviconUrl(site);
                    return (
                      <TouchableOpacity
                        key={site}
                        style={[
                          styles.websiteChip,
                          { backgroundColor: isSel ? `${theme.accent}30` : theme.background },
                        ]}
                        onPress={() => toggleWebsite(site)}
                      >
                        <Image source={{ uri: faviconUrl }} style={{ width: 16, height: 16, borderRadius: 3 }} />
                        <Text style={[styles.websiteText, { color: isSel ? theme.accent : theme.text }]}>{site}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

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
  liveBanner: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 18, marginBottom: 16 },
  liveBannerLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  liveBannerName: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  liveBannerCountdown: { fontSize: 42, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 48 },
  liveBannerMeta: { fontSize: 13, fontWeight: '300', marginTop: 4 },
  sessionName: { fontSize: 28, fontWeight: '300', letterSpacing: 0.5, marginBottom: 24 },
  card: { borderRadius: 14, borderWidth: 0, padding: 6, marginBottom: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 0 },
  detailLabel: { flex: 1, fontSize: 14, fontWeight: '300' },
  detailValue: { fontSize: 14, fontWeight: '600' },
  detailDaysRow: { flexDirection: 'row', marginTop: 2, marginBottom: 10, marginHorizontal: 10, borderRadius: 10, overflow: 'hidden' },
  detailDayBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  detailDayBtnText: { fontSize: 12 },
  detailDatesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 10, marginHorizontal: 12 },
  detailDatePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  detailDatePillText: { fontSize: 12, fontWeight: '600' },
  editHint: { textAlign: 'center', fontSize: 13, marginTop: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '500' },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: 8, marginTop: 20 },
  input: { height: 48, borderWidth: 2.5, borderRadius: 10, paddingHorizontal: 16, fontSize: 16, fontWeight: '300' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { width: 70, height: 48, borderWidth: 2.5, borderRadius: 10, textAlign: 'center', fontSize: 18, fontWeight: '300' },
  timeSep: { fontSize: 24, fontWeight: '300' },
  scheduleRow: { flexDirection: 'row', gap: 8 },
  scheduleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  scheduleBtnText: { fontSize: 13 },
  daysRow: { flexDirection: 'row', gap: 0, marginTop: 14, borderRadius: 10, overflow: 'hidden' },
  dayBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', borderWidth: 0 },
  dayBtnText: { fontSize: 13 },
  selectedDatesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  datePillText: { fontSize: 12, fontWeight: '500' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 2, borderWidth: 0 },
  toggleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleLabel: { fontSize: 15, fontWeight: '500' },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#ccc', justifyContent: 'center', paddingHorizontal: 2 },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleDotActive: { alignSelf: 'flex-end' },
  groupItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, marginTop: 8, borderWidth: 0 },
  groupItemText: { fontSize: 15 },
  groupItemCount: { fontSize: 13 },
  websiteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  websiteChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 0 },
  websiteText: { fontSize: 13 },
  subLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 8, marginTop: 12 },
  focusContainer: { marginTop: 14, borderRadius: 14, padding: 14, overflow: 'hidden' },
  focusContent: { marginTop: 12, paddingTop: 4 },
  appListContainer: { marginTop: 6, marginBottom: 8, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 6, borderWidth: 0 },
  appListItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10 },
  appListText: { fontSize: 14, flex: 1 },
  appItemIcon: { width: 22, height: 22, borderRadius: 5 },
  saveBtn: { height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 32 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  actionButtonsContainer: { flexDirection: 'row', marginTop: 24, gap: 12 },
  editBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderWidth: 0, borderRadius: 12 },
  editBtnText: { fontSize: 14, fontWeight: '600' },
  deleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderWidth: 0, borderRadius: 12 },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  breakBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, borderWidth: 0, marginTop: 12 },
  breakBtnText: { fontSize: 15, fontWeight: '600' },
  breakBtnSub: { color: '#8A7A5C', fontSize: 12 },
  breakOngoingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 0, marginTop: 12, marginBottom: 4 },
  breakOngoingLabel: { fontSize: 13, fontWeight: '500', letterSpacing: 0.4 },
  cancelSessionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 0, marginTop: 16 },
  cancelSessionBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  skipSessionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 0, marginTop: 14 },
  skipSessionBtnText: { fontSize: 14, fontWeight: '600' },
});
