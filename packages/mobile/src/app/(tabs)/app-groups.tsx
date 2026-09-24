// ============================================================
// Focussive Mobile — Rules Screen (Sessions + Groups)
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Image,
  SectionList,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSubscription } from '@/context/SubscriptionContext';
import { useSessions } from '@/context/SessionContext';
import { appGroupApi, websiteGroupApi } from '@/utils/api';
import {
  PREDEFINED_APPS,
  formatTime,
  formatDuration,
  formatDate,
  SessionStatus,
} from '@focussive/shared';
import type { AppGroup, AppInfo, WebsiteGroup, Session } from '@focussive/shared';
import { Ionicons } from '@expo/vector-icons';
import InstalledApps from '@focussive/installed-apps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isSystemOrUiApp } from '@/utils/appFilter';

const COMMON_WEBSITES = [
  'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com',
  'reddit.com', 'pinterest.com', 'youtube.com', 'netflix.com', 'discord.com',
  'snapchat.com', 'twitch.tv', 'linkedin.com', 'tumblr.com', '9gag.com',
  'whatsapp.com', 'telegram.org', 'spotify.com',
];

export default function RulesScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { isPremium, openPaywall } = useSubscription();
  const { allSessions, isLoading: sessionsLoading, refreshSessions } = useSessions();

  // Top tab: 'sessions' | 'groups'
  const [activeTab, setActiveTab] = useState<'sessions' | 'groups'>('sessions');

  useEffect(() => {
    if (params?.tab === 'sessions' || params?.tab === 'groups') {
      setActiveTab(params.tab);
    }
  }, [params?.tab]);

  const [refreshing, setRefreshing] = useState(false);

  // App groups state
  const [appGroups, setAppGroups] = useState<AppGroup[]>([]);
  const [appGroupLoading, setAppGroupLoading] = useState(true);
  const [appModal, setAppModal] = useState(false);
  const [editingAppGroup, setEditingAppGroup] = useState<AppGroup | null>(null);
  const [appGroupName, setAppGroupName] = useState('');
  const [appSearchQuery, setAppSearchQuery] = useState('');
  const [selectedApps, setSelectedApps] = useState<AppInfo[]>([]);
  const [deviceApps, setDeviceApps] = useState<(AppInfo & { iconUri?: string })[]>(PREDEFINED_APPS);
  const [recommendedApps, setRecommendedApps] = useState<(AppInfo & { iconUri?: string; totalTimeMillis: number })[]>([]);

  // Website groups state
  const [websiteGroups, setWebsiteGroups] = useState<WebsiteGroup[]>([]);
  const [websiteGroupLoading, setWebsiteGroupLoading] = useState(true);
  const [websiteModal, setWebsiteModal] = useState(false);
  const [editingWebsiteGroup, setEditingWebsiteGroup] = useState<WebsiteGroup | null>(null);
  const [websiteGroupName, setWebsiteGroupName] = useState('');
  const [selectedWebsites, setSelectedWebsites] = useState<string[]>([]);
  const [customWebsite, setCustomWebsite] = useState('');

  // Sort sessions latest first
  const sortedSessions = useMemo(() => {
    return [...allSessions].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime() || 0;
      const timeB = new Date(b.created_at).getTime() || 0;
      return timeB - timeA;
    });
  }, [allSessions]);

const WEEKDAY_ITEMS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
];

function isDayActiveForSession(dayKey: string, session: Session): boolean {
  if (session.schedule === 'today') {
    const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return dayMap[new Date().getDay()] === dayKey;
  }
  const days = session.schedule_days;
  if (!Array.isArray(days) || days.length === 0) {
    return session.schedule === 'recurring';
  }
  const lowerDays = days.map(d => String(d).toLowerCase());
  return lowerDays.some(d => d.startsWith(dayKey.slice(0, 3)));
}

  function getStatusBadge(status: string) {
    switch (status) {
      case SessionStatus.ACTIVE:
        return { label: 'Active', bg: 'rgba(34, 197, 94, 0.16)', text: '#22C55E', icon: 'radio-button-on' };
      case SessionStatus.SCHEDULED:
        return { label: 'Scheduled', bg: `${theme.accent}15`, text: theme.textSecondary, icon: 'calendar-outline' };
      case SessionStatus.COMPLETED:
        return { label: 'Completed', bg: theme.surface, text: theme.textSecondary, icon: 'checkmark-circle-outline' };
      case SessionStatus.CANCELLED:
        return { label: 'Cancelled', bg: theme.dangerBg, text: theme.danger, icon: 'close-circle-outline' };
      default:
        return { label: status, bg: theme.surface, text: theme.textSecondary, icon: 'time-outline' };
    }
  }

  function formatWeeklyUsage(millis: number): string {
    const totalMinutes = Math.floor(millis / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) {
      return `${hours} hours ${minutes} minutes used last week`;
    } else if (hours > 0) {
      return `${hours} hours used last week`;
    } else {
      return `${minutes} minutes used last week`;
    }
  }

  function setupFallbackRecommended(appsList: (AppInfo & { iconUri?: string })[]) {
    const fallbackDurations = [
      10 * 3600000 + 45 * 60000,
      8 * 3600000 + 15 * 60000,
      6 * 3600000 + 30 * 60000,
      4 * 3600000 + 10 * 60000,
    ];
    const popularIds = [
      'youtube', 'instagram', 'chrome', 'facebook', 'tiktok', 'reddit', 'twitter', 'discord', 'netflix'
    ];
    const nonUiApps = appsList.filter(a => !isSystemOrUiApp(a));
    const candidates = [
      ...nonUiApps.filter(a => popularIds.some(p => a.id.toLowerCase().includes(p) || a.name.toLowerCase().includes(p))),
      ...nonUiApps,
    ];
    const unique = Array.from(new Map(candidates.map(c => [c.id, c])).values());
    const top4 = unique.slice(0, 4).map((app, index) => ({
      ...app,
      totalTimeMillis: fallbackDurations[index] || (3 * 3600000),
    }));
    setRecommendedApps(top4);
  }

  // ─── Data fetching ────────────────────────────────────────────────────────

  const fetchAppGroups = useCallback(async () => {
    try {
      const res = await appGroupApi.getAll();
      setAppGroups((res.data as AppGroup[]) || []);
    } catch {
      // ignore
    } finally {
      setAppGroupLoading(false);
    }
  }, []);

  const fetchWebsiteGroups = useCallback(async () => {
    try {
      const res = await websiteGroupApi.getAll();
      setWebsiteGroups((res.data as WebsiteGroup[]) || []);
    } catch {
      // ignore
    } finally {
      setWebsiteGroupLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchAppGroups(),
      fetchWebsiteGroups(),
      refreshSessions(),
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchAppGroups();
    fetchWebsiteGroups();

    // Fetch installed apps with icons on Android
    async function loadInstalledApps() {
      try {
        if (InstalledApps?.getApps) {
          const raw = await InstalledApps.getApps();
          if (raw && raw.length > 0) {
            const mapped: (AppInfo & { iconUri?: string })[] = raw.map((a) => ({
              id: a.id,
              name: a.name,
              iconUri: a.icon ? (a.icon.startsWith('data:') ? a.icon : `data:image/png;base64,${a.icon}`) : undefined,
            }));
            const filtered = mapped.filter(a => !isSystemOrUiApp(a));
            setDeviceApps(filtered);

            if (InstalledApps.getWeeklyUsageStats) {
              try {
                const usageRaw = await InstalledApps.getWeeklyUsageStats();
                if (usageRaw && usageRaw.length > 0) {
                  const usageMap = new Map<string, number>(usageRaw.map((u) => [u.id, u.totalTimeMillis]));
                  const withUsage = filtered
                    .filter(a => usageMap.has(a.id) && (usageMap.get(a.id) || 0) > 0)
                    .map(a => ({
                      ...a,
                      totalTimeMillis: usageMap.get(a.id) || 0,
                    }))
                    .sort((a, b) => b.totalTimeMillis - a.totalTimeMillis);

                  if (withUsage.length >= 4) {
                    setRecommendedApps(withUsage.slice(0, 4));
                  } else {
                    setupFallbackRecommended(filtered);
                  }
                } else {
                  setupFallbackRecommended(filtered);
                }
              } catch {
                setupFallbackRecommended(filtered);
              }
            } else {
              setupFallbackRecommended(filtered);
            }
          }
        }
      } catch {
        // Fallback to predefined apps
      }
    }
    loadInstalledApps();
  }, [fetchAppGroups, fetchWebsiteGroups]);

  // ─── App Group CRUD ───────────────────────────────────────────────────────

  function openCreateAppGroup() {
    if (!isPremium && appGroups.length >= 2) {
      openPaywall('groups_limit');
      return;
    }
    setEditingAppGroup(null);
    setAppGroupName('');
    setSelectedApps([]);
    setAppModal(true);
  }

  function openEditAppGroup(group: AppGroup) {
    setEditingAppGroup(group);
    setAppGroupName(group.name);
    setSelectedApps(group.apps || []);
    setAppModal(true);
  }

  function toggleApp(app: AppInfo) {
    const isSelected = selectedApps.some(a => a.id === app.id);
    if (!isSelected && !isPremium && selectedApps.length >= 3) {
      openPaywall('groups_limit');
      return;
    }
    setSelectedApps(prev =>
      isSelected ? prev.filter(a => a.id !== app.id) : [...prev, app]
    );
  }

  async function saveAppGroup() {
    if (!appGroupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }
    if (selectedApps.length === 0) {
      Alert.alert('Error', 'Please select at least one app');
      return;
    }
    try {
      if (editingAppGroup) {
        await appGroupApi.update(editingAppGroup.id, {
          name: appGroupName.trim(),
          apps: selectedApps,
        });
      } else {
        await appGroupApi.create({
          name: appGroupName.trim(),
          apps: selectedApps,
        });
      }
      setAppModal(false);
      fetchAppGroups();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save app group');
    }
  }

  async function deleteAppGroup(id: string) {
    Alert.alert('Delete Group', 'Remove this app group?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await appGroupApi.delete(id); fetchAppGroups(); } catch { Alert.alert('Error', 'Failed to delete'); }
      }},
    ]);
  }

  // ─── Website Group CRUD ───────────────────────────────────────────────────

  function openCreateWebsiteGroup() {
    if (!isPremium && websiteGroups.length >= 2) {
      openPaywall('groups_limit');
      return;
    }
    setEditingWebsiteGroup(null);
    setWebsiteGroupName('');
    setSelectedWebsites([]);
    setCustomWebsite('');
    setWebsiteModal(true);
  }

  function openEditWebsiteGroup(group: WebsiteGroup) {
    setEditingWebsiteGroup(group);
    setWebsiteGroupName(group.name);
    setSelectedWebsites(group.websites || []);
    setCustomWebsite('');
    setWebsiteModal(true);
  }

  function toggleWebsite(site: string) {
    const isSelected = selectedWebsites.includes(site);
    if (!isSelected && !isPremium && selectedWebsites.length >= 3) {
      openPaywall('groups_limit');
      return;
    }
    setSelectedWebsites(prev =>
      isSelected ? prev.filter(s => s !== site) : [...prev, site]
    );
  }

  function addCustomWebsite() {
    const site = customWebsite.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!site) return;
    if (selectedWebsites.includes(site)) {
      Alert.alert('Info', 'Website already added');
      return;
    }
    if (!isPremium && selectedWebsites.length >= 3) {
      openPaywall('groups_limit');
      return;
    }
    setSelectedWebsites(prev => [...prev, site]);
    setCustomWebsite('');
  }

  async function saveWebsiteGroup() {
    if (!websiteGroupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }
    if (selectedWebsites.length === 0) {
      Alert.alert('Error', 'Please select at least one website');
      return;
    }
    try {
      if (editingWebsiteGroup) {
        await websiteGroupApi.update(editingWebsiteGroup.id, {
          name: websiteGroupName.trim(),
          websites: selectedWebsites,
        });
      } else {
        await websiteGroupApi.create({
          name: websiteGroupName.trim(),
          websites: selectedWebsites,
        });
      }
      setWebsiteModal(false);
      fetchWebsiteGroups();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save website group');
    }
  }

  async function deleteWebsiteGroup(id: string) {
    Alert.alert('Delete Group', 'Remove this website group?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await websiteGroupApi.delete(id); fetchWebsiteGroups(); } catch { Alert.alert('Error', 'Failed to delete'); }
      }},
    ]);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Segmented Control: "sessions" and "groups" in a single bordered container */}
      <View style={[styles.topBarWrapper, { paddingTop: Math.max(insets.top + 16, 36) }]}>
        <View
          style={[
            styles.segmentContainer,
            {
              borderColor: theme.accent,
              backgroundColor: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.04)',
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.segmentTab,
              styles.segmentTabLeft,
              activeTab === 'sessions' && {
                backgroundColor: theme.accent,
              },
            ]}
            onPress={() => setActiveTab('sessions')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentText,
                {
                  color:
                    activeTab === 'sessions'
                      ? (isDark ? '#2F3456' : '#FFFFFF')
                      : theme.accent,
                  fontWeight: activeTab === 'sessions' ? '700' : '600',
                },
              ]}
            >
              Sessions
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentTab,
              styles.segmentTabRight,
              activeTab === 'groups' && {
                backgroundColor: theme.accent,
              },
            ]}
            onPress={() => setActiveTab('groups')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentText,
                {
                  color:
                    activeTab === 'groups'
                      ? (isDark ? '#2F3456' : '#FFFFFF')
                      : theme.accent,
                  fontWeight: activeTab === 'groups' ? '700' : '600',
                },
              ]}
            >
              Groups
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || (activeTab === 'sessions' && sessionsLoading)}
            onRefresh={handleRefresh}
            tintColor={theme.accent}
          />
        }
      >
        {activeTab === 'sessions' ? (
          /* ── Sessions Tab ── */
          <View style={styles.tabContent}>
            {/* Create New Session Button on top */}
            <TouchableOpacity
              style={[
                styles.createSessionTopBtn,
                { backgroundColor: theme.accentDark },
              ]}
              onPress={() => router.push('/session/create' as never)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.createSessionTopBtnText}>Create new session</Text>
            </TouchableOpacity>

            {sessionsLoading ? (
              <ActivityIndicator size="small" color={theme.accent} style={{ marginVertical: 32 }} />
            ) : sortedSessions.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
                <Ionicons name="bulb-outline" size={36} color={theme.textSecondary} />
                <Text style={[styles.emptyCardText, { color: theme.textSecondary }]}>
                  No sessions created yet
                </Text>
              </View>
            ) : (
              sortedSessions.map((session) => {
                const badge = getStatusBadge(session.status);
                return (
                  <TouchableOpacity
                    key={session.id}
                    style={[styles.sessionCard, { backgroundColor: theme.card }]}
                    onPress={() => router.push(`/session/${session.id}` as never)}
                    activeOpacity={0.7}
                  >
                    {/* Card Header: Name + Status Badge */}
                    <View style={styles.sessionCardHeader}>
                      <Text style={[styles.sessionName, { color: theme.text }]} numberOfLines={1}>
                        {session.name}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Ionicons name={badge.icon as any} size={12} color={badge.text} style={{ marginRight: 4 }} />
                        <Text style={[styles.statusText, { color: badge.text }]}>
                          {badge.label}
                        </Text>
                      </View>
                    </View>

                    {/* Time & Duration */}
                    <View style={styles.sessionMetaRow}>
                      <Ionicons name="time-outline" size={14} color={theme.textSecondary} style={{ marginRight: 6 }} />
                      <Text style={[styles.sessionMetaText, { color: theme.text }]}>
                        {formatTime(session.start_time)} · {formatDuration(session.duration)}
                      </Text>
                    </View>

                    {/* Weekday strip (compact connected days, removing "recurring" wording) */}
                    <View style={styles.cardDaysRow}>
                      {WEEKDAY_ITEMS.map((day, idx) => {
                        const isSelected = isDayActiveForSession(day.key, session);
                        const prevSelected = idx > 0 && isDayActiveForSession(WEEKDAY_ITEMS[idx - 1].key, session);
                        const nextSelected = idx < WEEKDAY_ITEMS.length - 1 && isDayActiveForSession(WEEKDAY_ITEMS[idx + 1].key, session);

                        return (
                          <View
                            key={day.key}
                            style={[
                              styles.cardDayBtn,
                              {
                                backgroundColor: isSelected
                                  ? theme.accent
                                  : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                                borderTopLeftRadius: prevSelected ? 0 : 5,
                                borderBottomLeftRadius: prevSelected ? 0 : 5,
                                borderTopRightRadius: nextSelected ? 0 : 5,
                                borderBottomRightRadius: nextSelected ? 0 : 5,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.cardDayBtnText,
                                {
                                  color: isSelected ? '#FFFFFF' : theme.textSecondary,
                                  fontWeight: isSelected ? '700' : '400',
                                },
                              ]}
                            >
                              {day.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* Footer: Focus pills (both Mobile & Browser, active filled dark, breaks removed) & Created At */}
                    <View style={styles.sessionCardFooter}>
                      <View style={styles.focusPills}>
                        <View
                          style={[
                            styles.focusPill,
                            {
                              backgroundColor: session.mobile_focus
                                ? (isDark ? '#2D324D' : '#1E2235')
                                : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                            },
                          ]}
                        >
                          <Ionicons
                            name="phone-portrait-outline"
                            size={10}
                            color={session.mobile_focus ? '#FFFFFF' : theme.textSecondary}
                            style={{ marginRight: 3 }}
                          />
                          <Text
                            style={[
                              styles.focusPillText,
                              { color: session.mobile_focus ? '#FFFFFF' : theme.textSecondary },
                            ]}
                          >
                            Mobile
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.focusPill,
                            {
                              backgroundColor: session.browser_focus
                                ? (isDark ? '#2D324D' : '#1E2235')
                                : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                            },
                          ]}
                        >
                          <Ionicons
                            name="globe-outline"
                            size={10}
                            color={session.browser_focus ? '#FFFFFF' : theme.textSecondary}
                            style={{ marginRight: 3 }}
                          />
                          <Text
                            style={[
                              styles.focusPillText,
                              { color: session.browser_focus ? '#FFFFFF' : theme.textSecondary },
                            ]}
                          >
                            Browser
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.sessionDateText, { color: theme.textSecondary }]}>
                        Created {formatDate(session.created_at)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        ) : (
          /* ── Groups Tab ── */
          <View style={styles.tabContent}>
            {!isPremium && (
              <TouchableOpacity
                style={[
                  styles.freeTierNotice,
                  {
                    backgroundColor: isDark ? 'rgba(139, 167, 148, 0.12)' : 'rgba(88, 112, 66, 0.08)',
                  },
                ]}
                onPress={() => openPaywall('groups_banner')}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.freeNoticeTitle, { color: theme.text }]}>Free Tier Limits</Text>
                  <Text style={[styles.freeNoticeSubtitle, { color: theme.textSecondary }]}>
                    Max 2 groups & 3 apps/sites each. Tap to unlock Unlimited with Pro.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            )}

            {/* ── App Groups ── */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>APP GROUPS</Text>
              <TouchableOpacity
                onPress={openCreateAppGroup}
                style={[styles.addBtn, { backgroundColor: `${theme.accent}20` }]}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={16} color={theme.accent} />
                <Text style={[styles.addBtnText, { color: theme.accent }]}>New</Text>
              </TouchableOpacity>
            </View>

            {appGroupLoading ? (
              <ActivityIndicator size="small" color={theme.accent} style={{ marginVertical: 20 }} />
            ) : appGroups.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
                <Ionicons name="phone-portrait-outline" size={28} color={theme.textSecondary} />
                <Text style={[styles.emptyCardText, { color: theme.textSecondary }]}>No app groups yet</Text>
              </View>
            ) : appGroups.map(group => (
              <View key={group.id} style={[styles.groupCard, { backgroundColor: theme.card }]}>
                <View style={styles.groupHeader}>
                  <Text style={[styles.groupName, { color: theme.text }]}>{group.name}</Text>
                  <View style={styles.groupActions}>
                    <TouchableOpacity onPress={() => openEditAppGroup(group)} style={[styles.actionBtn, { backgroundColor: theme.surface }]}>
                      <Ionicons name="create-outline" size={16} color={theme.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteAppGroup(group.id)} style={[styles.actionBtn, { backgroundColor: theme.danger }]}>
                      <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.chipRow}>
                  {(group.apps || []).slice(0, 5).map(app => (
                    <View key={app.id} style={[styles.chip, { backgroundColor: theme.surface }]}>
                      {(app as any).iconUri
                        ? <Image source={{ uri: (app as any).iconUri }} style={{ width: 14, height: 14, borderRadius: 3 }} />
                        : <Ionicons name="apps-outline" size={12} color={theme.textSecondary} />}
                      <Text style={[styles.chipText, { color: theme.textSecondary }]}>{app.name}</Text>
                    </View>
                  ))}
                  {(group.apps || []).length > 5 && (
                    <Text style={[styles.moreText, { color: theme.textSecondary }]}>+{group.apps.length - 5} more</Text>
                  )}
                </View>
              </View>
            ))}

            {/* Subtle Spacing */}
            <View style={{ height: 16 }} />

            {/* ── Website Groups ── */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>WEBSITE GROUPS</Text>
              <TouchableOpacity
                onPress={openCreateWebsiteGroup}
                style={[styles.addBtn, { backgroundColor: `${theme.accent}20` }]}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={16} color={theme.accent} />
                <Text style={[styles.addBtnText, { color: theme.accent }]}>New</Text>
              </TouchableOpacity>
            </View>

            {websiteGroupLoading ? (
              <ActivityIndicator size="small" color={theme.accent} style={{ marginVertical: 20 }} />
            ) : websiteGroups.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
                <Ionicons name="globe-outline" size={28} color={theme.textSecondary} />
                <Text style={[styles.emptyCardText, { color: theme.textSecondary }]}>No website groups</Text>
              </View>
            ) : websiteGroups.map(group => (
              <View key={group.id} style={[styles.groupCard, { backgroundColor: theme.card }]}>
                <View style={styles.groupHeader}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.groupName, { color: theme.text }]}>{group.name}</Text>
                    {group.is_default && (
                      <View style={[styles.defaultBadge, { backgroundColor: `${theme.accent}20` }]}>
                        <Text style={[styles.defaultBadgeText, { color: theme.accent }]}>default</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.groupActions}>
                    <TouchableOpacity onPress={() => openEditWebsiteGroup(group)} style={[styles.actionBtn, { backgroundColor: theme.surface }]}>
                      <Ionicons name="create-outline" size={16} color={theme.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteWebsiteGroup(group.id)} style={[styles.actionBtn, { backgroundColor: theme.danger }]}>
                      <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.chipRow}>
                  {(group.websites || []).slice(0, 5).map(site => {
                    const domain = site.replace(/^https?:\/\//, '').split('/')[0];
                    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
                    return (
                      <View key={site} style={[styles.chip, { backgroundColor: theme.surface }]}>
                        <Image source={{ uri: faviconUrl }} style={{ width: 12, height: 12, borderRadius: 2 }} />
                        <Text style={[styles.chipText, { color: theme.textSecondary }]}>{site}</Text>
                      </View>
                    );
                  })}
                  {(group.websites || []).length > 5 && (
                    <Text style={[styles.moreText, { color: theme.textSecondary }]}>+{group.websites.length - 5} more</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── App Group Modal ── */}
      <Modal visible={appModal} animationType="slide">
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{editingAppGroup ? 'Edit Group' : 'Select apps'}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                {selectedApps.length} apps selected {!isPremium ? '(Free limit: 3)' : '(Unlimited)'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setAppModal(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border, marginBottom: 12 }]}
            placeholder="Group Name" placeholderTextColor={theme.textSecondary}
            value={appGroupName} onChangeText={setAppGroupName}
          />

          <ScrollView
            style={styles.listArea}
            contentContainerStyle={{ paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Recommended Apps (based on usage) — top 4 apps */}
            {recommendedApps.length > 0 && (
              <View style={{ marginTop: 2, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 2 }}>
                  <Ionicons name="sparkles" size={14} color={theme.accent} />
                  <Text style={[styles.recommendedHeader, { color: theme.accent }]}>RECOMMENDED BASED ON USAGE</Text>
                </View>
                {recommendedApps.map(app => {
                  const isSel = selectedApps.some(a => a.id === app.id);
                  return (
                    <TouchableOpacity
                      key={`rec-${app.id}`}
                      style={[
                        styles.listItem,
                        {
                          backgroundColor: isSel
                            ? (isDark ? 'rgba(139, 167, 148, 0.28)' : 'rgba(88, 112, 66, 0.22)')
                            : theme.surface,
                        },
                      ]}
                      onPress={() => toggleApp(app)}
                      activeOpacity={0.7}
                    >
                      {app.iconUri ? (
                        <Image source={{ uri: app.iconUri }} style={styles.appIcon} />
                      ) : (
                        <View style={[styles.appIcon, { backgroundColor: `${theme.accent}30`, justifyContent: 'center', alignItems: 'center' }]}>
                          <Ionicons name="apps-outline" size={16} color={theme.accent} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.listItemText, { color: theme.text, fontWeight: '500' }]}>{app.name}</Text>
                        <Text style={[styles.usageSubtext, { color: theme.textSecondary }]}>
                          {formatWeeklyUsage(app.totalTimeMillis)}
                        </Text>
                      </View>
                      <Ionicons
                        name={isSel ? 'checkmark-circle' : 'add-circle-outline'}
                        size={22}
                        color={isSel ? theme.accent : theme.textSecondary}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Search Input for All Apps */}
            <View style={{ marginBottom: 12 }}>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    marginBottom: 0,
                    fontSize: 14,
                    height: 42,
                  },
                ]}
                placeholder="Search all installed apps..."
                placeholderTextColor={theme.textSecondary}
                value={appSearchQuery}
                onChangeText={setAppSearchQuery}
                clearButtonMode="while-editing"
              />
            </View>

            {/* All Installed Apps List */}
            <Text style={[styles.label, { color: theme.textSecondary, marginBottom: 8, marginTop: 4 }]}>
              {appSearchQuery ? 'SEARCH RESULTS' : 'ALL APPS'}
            </Text>

            {deviceApps
              .filter(app => !appSearchQuery || app.name.toLowerCase().includes(appSearchQuery.toLowerCase()))
              .map(app => {
                const isSel = selectedApps.some(a => a.id === app.id);
                return (
                  <TouchableOpacity
                    key={`all-${app.id}`}
                    style={[
                      styles.cleanListItem,
                      {
                        backgroundColor: isSel
                          ? (isDark ? 'rgba(139, 167, 148, 0.22)' : 'rgba(88, 112, 66, 0.16)')
                          : 'transparent',
                      },
                    ]}
                    onPress={() => toggleApp(app)}
                    activeOpacity={0.7}
                  >
                    {app.iconUri ? (
                      <Image source={{ uri: app.iconUri }} style={styles.appIcon} />
                    ) : (
                      <View style={[styles.appIcon, { backgroundColor: `${theme.accent}30`, justifyContent: 'center', alignItems: 'center' }]}>
                        <Ionicons name="apps-outline" size={16} color={theme.accent} />
                      </View>
                    )}
                    <Text style={[styles.listItemText, { color: theme.text, fontSize: 14 }]}>{app.name}</Text>
                    <Ionicons
                      name={isSel ? 'checkmark-circle' : 'add-circle-outline'}
                      size={20}
                      color={isSel ? theme.accent : theme.textSecondary}
                    />
                  </TouchableOpacity>
                );
              })}
          </ScrollView>

          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.accentDark }]} onPress={saveAppGroup}>
            <Text style={styles.saveBtnText}>Save Group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: theme.surface }]} onPress={() => setAppModal(false)}>
            <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Website Group Modal ── */}
      <Modal visible={websiteModal} animationType="slide">
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{editingWebsiteGroup ? 'Edit Group' : 'Select websites'}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                {selectedWebsites.length} websites selected {!isPremium ? '(Free limit: 3)' : '(Unlimited)'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setWebsiteModal(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
            placeholder="Group Name" placeholderTextColor={theme.textSecondary}
            value={websiteGroupName} onChangeText={setWebsiteGroupName}
          />
          {/* Custom website input */}
          <View style={styles.customRow}>
            <TextInput
              style={[styles.customInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              placeholder="Add website (e.g. example.com)" placeholderTextColor={theme.textSecondary}
              value={customWebsite} onChangeText={setCustomWebsite}
              autoCapitalize="none" keyboardType="url"
              onSubmitEditing={addCustomWebsite}
            />
            <TouchableOpacity onPress={addCustomWebsite} style={[styles.addIconBtn, { backgroundColor: theme.accent }]}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.label, { color: theme.textSecondary }]}>COMMON WEBSITES</Text>
          <ScrollView style={styles.listArea}>
            {/* Selected custom sites not in common list */}
            {selectedWebsites.filter(s => !COMMON_WEBSITES.includes(s)).map(site => {
              const domain = site.replace(/^https?:\/\//, '').split('/')[0];
              const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
              return (
                <TouchableOpacity
                  key={site}
                  style={[styles.listItem, { backgroundColor: `${theme.accent}30` }]}
                  onPress={() => toggleWebsite(site)}
                >
                  <Image source={{ uri: faviconUrl }} style={{ width: 20, height: 20, borderRadius: 4 }} />
                  <Text style={[styles.listItemText, { color: theme.text }]}>{site}</Text>
                  <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
                </TouchableOpacity>
              );
            })}
            {COMMON_WEBSITES.map(site => {
              const isSel = selectedWebsites.includes(site);
              const domain = site.replace(/^https?:\/\//, '').split('/')[0];
              const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
              return (
                <TouchableOpacity
                  key={site}
                  style={[styles.listItem, { backgroundColor: isSel ? `${theme.accent}30` : theme.surface }]}
                  onPress={() => toggleWebsite(site)}
                >
                  <Image source={{ uri: faviconUrl }} style={{ width: 20, height: 20, borderRadius: 4 }} />
                  <Text style={[styles.listItemText, { color: theme.text }]}>{site}</Text>
                  {isSel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.accentDark }]} onPress={saveWebsiteGroup}>
            <Text style={styles.saveBtnText}>Save Group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: theme.surface }]} onPress={() => setWebsiteModal(false)}>
            <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBarWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 10,
    marginVertical: -2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabLeft: {
    marginLeft: -2,
    borderTopLeftRadius: 10.5,
    borderBottomLeftRadius: 10.5,
  },
  segmentTabRight: {
    marginRight: -2,
    borderTopRightRadius: 10.5,
    borderBottomRightRadius: 10.5,
  },
  segmentText: {
    fontSize: 14,
    letterSpacing: 0.3,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
  },
  tabContent: {
    width: '100%',
  },

  // Sessions Tab Styles (no thin border lines)
  createSessionTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 0,
  },
  createSessionTopBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  sessionCard: {
    borderRadius: 14,
    borderWidth: 0,
    padding: 16,
    marginBottom: 12,
  },
  sessionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  sessionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sessionMetaText: {
    fontSize: 13,
    fontWeight: '400',
  },
  cardDaysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  cardDayBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardDayBtnText: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  sessionCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
  },
  focusPills: {
    flexDirection: 'row',
    gap: 6,
  },
  focusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  focusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sessionDateText: {
    fontSize: 11,
  },

  // Groups Tab Styles (no thin border lines)
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 0 },
  addBtnText: { fontSize: 13, fontWeight: '600' },
  groupCard: { borderRadius: 14, borderWidth: 0, padding: 14, marginBottom: 12 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  groupName: { fontSize: 16, fontWeight: '500' },
  groupActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  chipText: { fontSize: 11 },
  moreText: { fontSize: 11, alignSelf: 'center' },
  defaultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  defaultBadgeText: { fontSize: 11, fontWeight: '500' },
  emptyCard: { borderRadius: 14, borderWidth: 0, padding: 24, alignItems: 'center', gap: 8, marginBottom: 12 },
  emptyCardText: { fontSize: 14 },
  modalContainer: { flex: 1, padding: 20, paddingTop: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: '500' },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: 8, marginTop: 16 },
  recommendedHeader: { fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  usageSubtext: { fontSize: 11, marginTop: 2 },
  input: { height: 48, borderWidth: 2.5, borderRadius: 10, paddingHorizontal: 16, fontSize: 16, fontWeight: '300', marginBottom: 4 },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  customInput: { flex: 1, height: 44, borderWidth: 2.5, borderRadius: 10, paddingHorizontal: 14, fontSize: 14 },
  addIconBtn: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  listArea: { flex: 1, marginBottom: 12 },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 0, marginBottom: 8, gap: 12 },
  cleanListItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, marginBottom: 4, gap: 10 },
  listItemText: { flex: 1, fontSize: 15 },
  appIcon: { width: 28, height: 28, borderRadius: 6 },
  saveBtn: { height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  cancelBtn: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  cancelBtnText: { fontSize: 15, fontWeight: '500' },
  freeTierNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 0,
    marginBottom: 16,
    gap: 12,
  },
  freeNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  freeNoticeSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
});
