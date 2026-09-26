// ============================================================
// Focussive Mobile — Create Session Screen
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/utils/theme';
import { sessionApi, appGroupApi, websiteGroupApi } from '@/utils/api';
import { useSessions } from '@/context/SessionContext';
import { ScheduleType, Weekday } from '@focussive/shared';
import type { AppGroup, WebsiteGroup, SessionTimeSlot } from '@focussive/shared';
import { Ionicons } from '@expo/vector-icons';
import { hasRequiredPermissions, requestUsageStatsPermission, requestOverlayPermission } from '@focussive/app-blocker';
import InstalledApps from '@focussive/installed-apps';
import TimeSlotPicker from '@/components/TimeSlotPicker';
import MiniCalendar from '@/components/MiniCalendar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

const ALL_WEEKDAYS: Weekday[] = [
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
  Weekday.SATURDAY,
  Weekday.SUNDAY,
];

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CreateSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshSessions } = useSessions();

  const [name, setName] = useState('');
  const [timeSlots, setTimeSlots] = useState<SessionTimeSlot[]>([
    { start_time: '08:00', end_time: '09:00' },
  ]);
  const [use24Hour, setUse24Hour] = useState(false);
  const [scheduleTab, setScheduleTab] = useState<'everyday' | 'recurring' | 'scheduled'>('everyday');
  const [recurringDays, setRecurringDays] = useState<Weekday[]>(ALL_WEEKDAYS);   // for EVERYDAY & RECURRING
  const [scheduledDates, setScheduledDates] = useState<string[]>([]);   // for SCHEDULED (One time)
  const [mobileFocus, setMobileFocus] = useState(false);
  const [browserFocus, setBrowserFocus] = useState(false);
  const [appGroups, setAppGroups] = useState<AppGroup[]>([]);
  const [selectedAppGroupIds, setSelectedAppGroupIds] = useState<string[]>([]);
  const [expandedAppGroupId, setExpandedAppGroupId] = useState<string | null>(null);
  const [websiteGroups, setWebsiteGroups] = useState<WebsiteGroup[]>([]);
  const [selectedWebsiteGroupIds, setSelectedWebsiteGroupIds] = useState<string[]>([]);
  const [expandedWebsiteGroupId, setExpandedWebsiteGroupId] = useState<string | null>(null);
  const [extraWebsites, setExtraWebsites] = useState<string[]>([]);
  const [customWebsite, setCustomWebsite] = useState('');
  const [loading, setLoading] = useState(false);
  const [allowBreaks, setAllowBreaks] = useState(false);
  const [maxBreakMinutes, setMaxBreakMinutes] = useState('10');
  const [appIconMap, setAppIconMap] = useState<Record<string, string>>({});

  useEffect(() => {
    appGroupApi.getAll().then(r => setAppGroups(r.data as AppGroup[])).catch(() => {});
    websiteGroupApi.getAll().then(r => setWebsiteGroups(r.data as WebsiteGroup[])).catch(() => {});
    loadTimeFormat();
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTimeFormat();
    }, [])
  );

  function getFaviconUrl(website: string) {
    const domain = website.replace(/^https?:\/\//, '').split('/')[0];
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  }

  async function loadTimeFormat() {
    try {
      const format = await AsyncStorage.getItem('time_format');
      setUse24Hour(format === '24');
    } catch {
      setUse24Hour(false);
    }
  }

  function handleSelectScheduleTab(tab: 'everyday' | 'recurring' | 'scheduled') {
    setScheduleTab(tab);
    if (tab === 'everyday') {
      setRecurringDays(ALL_WEEKDAYS);
    } else if (tab === 'recurring') {
      if (recurringDays.length === 0) {
        setRecurringDays(ALL_WEEKDAYS);
      }
    } else if (tab === 'scheduled') {
      if (scheduledDates.length === 0) {
        const today = new Date();
        const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        setScheduledDates([todayISO]);
      }
    }
  }

  function toggleRecurringDay(day: Weekday) {
    setRecurringDays(prev => {
      const next = prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day];
      if (next.length === 7) {
        setScheduleTab('everyday');
      } else {
        setScheduleTab('recurring');
      }
      return next;
    });
  }
  function toggleScheduledDate(iso: string) {
    setScheduledDates(prev => prev.includes(iso) ? prev.filter(d => d !== iso) : [...prev, iso]);
  }
  function toggleAppGroup(id: string) {
    setSelectedAppGroupIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
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

    if (!timeSlots || timeSlots.length === 0) {
      Alert.alert('Error', 'Please add at least one time duration');
      return;
    }

    const primarySlot = timeSlots[0];
    const [sh, sm] = primarySlot.start_time.split(':').map(Number);
    const [eh, em] = primarySlot.end_time.split(':').map(Number);
    let slotMinutes = (eh * 60 + em) - (sh * 60 + sm);
    if (slotMinutes <= 0) slotMinutes += 24 * 60;
    const duration = Math.max(1, slotMinutes);
    const startTime = primarySlot.start_time;

    if (scheduleTab !== 'scheduled' && recurringDays.length === 0) {
      Alert.alert('Error', 'Select at least one day for recurring sessions');
      return;
    }
    if (scheduleTab === 'scheduled' && scheduledDates.length === 0) {
      Alert.alert('Error', 'Select at least one date');
      return;
    }

    if (mobileFocus) {
      if (selectedAppGroupIds.length === 0) {
        Alert.alert('Error', 'Select at least one app group to block for mobile focus');
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
        schedule: scheduleTab === 'scheduled' ? ScheduleType.SCHEDULED : ScheduleType.RECURRING,
        schedule_days: scheduleTab === 'scheduled'
          ? scheduledDates
          : recurringDays,
        start_time: startTime,
        time_slots: timeSlots,
        mobile_focus: mobileFocus,
        browser_focus: browserFocus,
        app_group_ids: mobileFocus ? selectedAppGroupIds : [],
        blocked_websites: browserFocus ? allBlockedWebsites : [],
        website_group_ids: browserFocus ? selectedWebsiteGroupIds : [],
        allow_breaks: allowBreaks,
        max_break_minutes: allowBreaks ? (parseInt(maxBreakMinutes) || 10) : undefined,
      });
      await refreshSessions();
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Header with Close Button on Top Right */}
      <View style={[styles.topHeader, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)');
            }
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.closeBtn}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Session Name */}
        <Text style={[styles.label, { color: theme.textSecondary, marginTop: 4 }]}>SESSION NAME</Text>
        <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
        placeholder="e.g. Deep Work, Study, Writing..."
        placeholderTextColor={theme.textSecondary}
        value={name} onChangeText={setName}
      />

      {/* Time durations */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        Time durations{use24Hour ? ' (24 hour format)' : ''}
      </Text>
      <TimeSlotPicker
        slots={timeSlots}
        onChangeSlots={setTimeSlots}
        use24Hour={use24Hour}
        theme={theme}
        maxSlots={5}
      />

      {/* Schedule Type */}
      <Text style={[styles.label, { color: theme.textSecondary }]}>SCHEDULE</Text>
      <View style={styles.scheduleRow}>
        {([
          { key: 'everyday', label: 'Everyday' },
          { key: 'recurring', label: 'Recurring' },
          { key: 'scheduled', label: 'One time' },
        ] as const).map(opt => {
          const isSelected = scheduleTab === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.scheduleBtn,
                { backgroundColor: isSelected ? theme.accent : theme.surface },
              ]}
              onPress={() => handleSelectScheduleTab(opt.key)}
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

      {/* Everyday / Recurring: weekday picker */}
      {(scheduleTab === 'everyday' || scheduleTab === 'recurring') && (
        <View style={styles.daysRow}>
          {WEEKDAYS.map((day, index) => {
            const isSelected = recurringDays.includes(day.key);
            const prevSelected = index > 0 && recurringDays.includes(WEEKDAYS[index - 1].key);
            const nextSelected = index < WEEKDAYS.length - 1 && recurringDays.includes(WEEKDAYS[index + 1].key);

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
                onPress={() => toggleRecurringDay(day.key)}
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

      {/* One time: calendar date picker */}
      {scheduleTab === 'scheduled' && (
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

      {/* Mobile Focus Container */}
      <View style={[styles.focusContainer, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={styles.toggleRow}
          activeOpacity={0.7}
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
                return;
              }
            }
            setMobileFocus(!mobileFocus);
          }}
        >
          <View style={styles.toggleLabelRow}>
            <Ionicons name="phone-portrait-outline" size={20} color={mobileFocus ? theme.accent : theme.textSecondary} />
            <Text style={[styles.toggleLabel, { color: theme.text }]}>Mobile Focus</Text>
          </View>
          <View style={[styles.toggle, mobileFocus && { backgroundColor: theme.accent }]}>
            <View style={[styles.toggleDot, mobileFocus && styles.toggleDotActive]} />
          </View>
        </TouchableOpacity>

        {mobileFocus && (
          <View style={styles.focusContent}>
            <Text style={[styles.subLabel, { color: theme.textSecondary }]}>App Groups to Block</Text>
            {appGroups.length === 0 ? (
              <Text style={{ fontSize: 13, color: theme.textSecondary, marginVertical: 6 }}>
                No app groups created yet. You can create them in the Groups tab.
              </Text>
            ) : (
              appGroups.map(group => {
                const isSelected = selectedAppGroupIds.includes(group.id);
                const isExpanded = expandedAppGroupId === group.id;
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
                          onPress={() => setExpandedAppGroupId(isExpanded ? null : group.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}
                        >
                          <Text style={[styles.groupItemCount, { color: theme.textSecondary }]}>{group.apps?.length || 0} apps</Text>
                          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => toggleAppGroup(group.id)}>
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
          onPress={() => setBrowserFocus(!browserFocus)}
        >
          <View style={styles.toggleLabelRow}>
            <Ionicons name="globe-outline" size={20} color={browserFocus ? theme.accent : theme.textSecondary} />
            <Text style={[styles.toggleLabel, { color: theme.text }]}>Browser Focus</Text>
          </View>
          <View style={[styles.toggle, browserFocus && { backgroundColor: theme.accent }]}>
            <View style={[styles.toggleDot, browserFocus && styles.toggleDotActive]} />
          </View>
        </TouchableOpacity>

        {browserFocus && (
          <View style={styles.focusContent}>
            {/* Website Groups */}
            {websiteGroups.length > 0 && (
              <>
                <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Website Groups</Text>
                {websiteGroups.map(group => {
                  const isSelected = selectedWebsiteGroupIds.includes(group.id);
                  const isExpanded = expandedWebsiteGroupId === group.id;
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
                            onPress={() => setExpandedWebsiteGroupId(isExpanded ? null : group.id)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}
                          >
                            <Text style={[styles.groupItemCount, { color: theme.textSecondary }]}>{group.websites?.length || 0} sites</Text>
                            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => toggleWebsiteGroup(group.id)}>
                            <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isSelected ? theme.accent : theme.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {isExpanded && group.websites && group.websites.length > 0 && (
                        <View style={[styles.appListContainer, { backgroundColor: theme.background }]}>
                          {group.websites.map((website, index) => {
                            const faviconUrl = getFaviconUrl(website);
                            return (
                              <View key={`${group.id}-${website}-${index}`} style={[styles.appListItem, index < group.websites.length - 1 && { borderBottomWidth: 1, borderBottomColor: `${theme.border}30` }]}>
                                <Image source={{ uri: faviconUrl }} style={styles.websiteFavicon} />
                                <Text style={[styles.appListText, { color: theme.text }]}>{website}</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}

            {/* Additional individual websites */}
            <Text style={[styles.subLabel, { color: theme.textSecondary, marginTop: 14 }]}>Additional Websites</Text>
            <View style={styles.customRow}>
              <TextInput
                style={[styles.customInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
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
                {extraWebsites.map((site, idx) => {
                  const faviconUrl = getFaviconUrl(site);
                  return (
                    <TouchableOpacity
                      key={`extra-${site}-${idx}`}
                      style={[styles.sitePill, { backgroundColor: theme.background, borderColor: 'transparent' }]}
                      onPress={() => removeExtraWebsite(site)}
                    >
                      <Image source={{ uri: faviconUrl }} style={{ width: 14, height: 14, borderRadius: 3 }} />
                      <Text style={[styles.sitePillText, { color: theme.text }]}>{site}</Text>
                      <Ionicons name="close" size={12} color={theme.textSecondary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Allow Breaks Container */}
      <View style={[styles.focusContainer, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={styles.toggleRow}
          activeOpacity={0.7}
          onPress={() => setAllowBreaks(!allowBreaks)}
        >
          <View style={styles.toggleLabelRow}>
            <Ionicons name="cafe-outline" size={20} color={allowBreaks ? theme.accent : theme.textSecondary} />
            <View>
              <Text style={[styles.toggleLabel, { color: theme.text }]}>Allow Breaks</Text>
              <Text style={[{ fontSize: 12, color: theme.textSecondary, marginTop: 2, lineHeight: 16 }]}>
                Breaks don't count as{'\n'}distracted time.
              </Text>
            </View>
          </View>
          <View style={[styles.toggle, allowBreaks && { backgroundColor: theme.accent }]}>
            <View style={[styles.toggleDot, allowBreaks && styles.toggleDotActive]} />
          </View>
        </TouchableOpacity>

        {allowBreaks && (
          <View style={[styles.focusContent, { paddingTop: 12 }]}>
            <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Max Break Time (minutes)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <TextInput
                style={[styles.compactTimeInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                placeholder="10"
                placeholderTextColor={theme.textSecondary}
                value={maxBreakMinutes}
                onChangeText={setMaxBreakMinutes}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>min</Text>
            </View>
          </View>
        )}
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  closeBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: 8, marginTop: 20 },
  subLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 8, marginTop: 12 },
  input: { height: 48, borderWidth: 2.5, borderRadius: 10, paddingHorizontal: 16, fontSize: 16, fontWeight: '300' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { width: 70, height: 48, borderWidth: 2.5, borderRadius: 10, textAlign: 'center', fontSize: 18, fontWeight: '300' },
  compactTimeInput: { width: 80, height: 44, borderWidth: 2.5, borderRadius: 10, textAlign: 'center', fontSize: 16, fontWeight: '500' },
  timeSep: { fontSize: 24, fontWeight: '300' },
  ampmRow: { flexDirection: 'row', gap: 4, marginLeft: 8 },
  ampmBtn: { width: 52, height: 48, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  ampmText: { fontSize: 14, fontWeight: '500' },
  scheduleRow: { flexDirection: 'row', gap: 8 },
  scheduleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  scheduleBtnText: { fontSize: 13 },
  daysRow: { flexDirection: 'row', gap: 0, marginTop: 14, borderRadius: 10, overflow: 'hidden' },
  dayBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', borderWidth: 0 },
  dayBtnText: { fontSize: 13 },
  selectedDatesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
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
  customRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  customInput: { flex: 1, height: 44, borderRadius: 10, paddingHorizontal: 14, fontSize: 14, borderWidth: 2.5 },
  addIconBtn: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  sitePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 0 },
  sitePillText: { fontSize: 12 },
  appListContainer: { marginTop: 6, marginBottom: 8, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 6, borderWidth: 0 },
  appListItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10 },
  appListText: { fontSize: 14, flex: 1 },
  appItemIcon: { width: 22, height: 22, borderRadius: 5 },
  websiteFavicon: { width: 20, height: 20, borderRadius: 4 },
  createBtn: { height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 32 },
  createBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  focusContainer: { marginTop: 14, borderRadius: 14, padding: 14, overflow: 'hidden' },
  focusContent: { marginTop: 12, paddingTop: 4 },
});
