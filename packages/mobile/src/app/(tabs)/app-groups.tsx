// ============================================================
// Focussive Mobile — Groups Screen (App Groups + Website Groups)
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSubscription } from '@/context/SubscriptionContext';
import { appGroupApi, websiteGroupApi } from '@/utils/api';
import { PREDEFINED_APPS } from '@focussive/shared';
import type { AppGroup, AppInfo, WebsiteGroup } from '@focussive/shared';
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

export default function GroupsScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const { isPremium, openPaywall } = useSubscription();

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
      10 * 3600000 + 45 * 60000, // 10 hours 45 minutes
      8 * 3600000 + 15 * 60000,  // 8 hours 15 minutes
      6 * 3600000 + 30 * 60000,  // 6 hours 30 minutes
      4 * 3600000 + 10 * 60000,  // 4 hours 10 minutes
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

  // Website groups state
  const [websiteGroups, setWebsiteGroups] = useState<WebsiteGroup[]>([]);
  const [websiteGroupLoading, setWebsiteGroupLoading] = useState(true);
  const [websiteModal, setWebsiteModal] = useState(false);
  const [editingWebsiteGroup, setEditingWebsiteGroup] = useState<WebsiteGroup | null>(null);
  const [websiteGroupName, setWebsiteGroupName] = useState('');
  const [selectedWebsites, setSelectedWebsites] = useState<string[]>([]);
  const [customWebsite, setCustomWebsite] = useState('');

  // ─── Data fetching ────────────────────────────────────────────────────────

  const fetchAppGroups = useCallback(async () => {
    try {
      const r = await appGroupApi.getAll();
      setAppGroups(r.data as AppGroup[]);
    } catch { /* silent */ } finally { setAppGroupLoading(false); }
  }, []);

  const fetchWebsiteGroups = useCallback(async () => {
    try {
      const r = await websiteGroupApi.getAll();
      setWebsiteGroups(r.data as WebsiteGroup[]);
    } catch { /* silent */ } finally { setWebsiteGroupLoading(false); }
  }, []);

  useEffect(() => {
    fetchAppGroups();
    fetchWebsiteGroups();
    async function loadDeviceApps() {
      try {
        if (!InstalledApps) {
          console.warn("InstalledApps module is null, using predefined fallback");
          setupFallbackRecommended(PREDEFINED_APPS);
          return;
        }
        const apps = await InstalledApps.getApps();
        const rawLoaded = apps?.length > 0
          ? apps.map(a => ({ id: a.id, name: a.name, icon: 'apps-outline', iconUri: a.icon }))
          : PREDEFINED_APPS;
        const loaded = rawLoaded.filter(a => !isSystemOrUiApp(a));
        setDeviceApps(loaded);

        // Fetch weekly usage stats if available
        let stats: any[] = [];
        try {
          if (InstalledApps.getWeeklyUsageStats) {
            stats = await InstalledApps.getWeeklyUsageStats();
          }
        } catch { /* ignore */ }

        // Filter out UI apps, One UI Home, launchers, keyboards from usage stats
        const filteredStats = (stats || []).filter(st => !isSystemOrUiApp(st));

        if (filteredStats && filteredStats.length >= 4) {
          const top4 = filteredStats.slice(0, 4).map(st => {
            const matchedApp = loaded.find(a => a.id === st.id);
            return {
              id: st.id,
              name: st.name || matchedApp?.name || st.id,
              icon: 'apps-outline',
              iconUri: st.icon || (matchedApp as any)?.iconUri || (matchedApp as any)?.icon,
              totalTimeMillis: st.totalTimeMillis,
            };
          });
          setRecommendedApps(top4);
        } else if (filteredStats && filteredStats.length > 0) {
          const statsApps = filteredStats.map(st => {
            const matchedApp = loaded.find(a => a.id === st.id);
            return {
              id: st.id,
              name: st.name || matchedApp?.name || st.id,
              icon: 'apps-outline',
              iconUri: st.icon || (matchedApp as any)?.iconUri || (matchedApp as any)?.icon,
              totalTimeMillis: st.totalTimeMillis,
            };
          });
          const existingIds = new Set(statsApps.map(a => a.id));
          const supplement = loaded
            .filter(a => !existingIds.has(a.id))
            .slice(0, Math.max(0, 4 - statsApps.length))
            .map((a, i) => ({
              ...a,
              totalTimeMillis: (3 - i) * 3600000,
            }));
          setRecommendedApps([...statsApps, ...supplement]);
        } else {
          setupFallbackRecommended(loaded);
        }
      } catch (err) {
        console.error("Error loading device apps:", err);
        setupFallbackRecommended(PREDEFINED_APPS);
      }
    }
    loadDeviceApps();
  }, [fetchAppGroups, fetchWebsiteGroups]);

  // ─── App Group Handlers ───────────────────────────────────────────────────

  function openCreateAppGroup() {
    if (!isPremium && appGroups.length >= 2) {
      openPaywall('app_group_limit');
      return;
    }
    setEditingAppGroup(null); setAppGroupName(''); setAppSearchQuery(''); setSelectedApps([]); setAppModal(true);
  }
  function openEditAppGroup(g: AppGroup) {
    setEditingAppGroup(g); setAppGroupName(g.name); setAppSearchQuery(''); setSelectedApps(g.apps || []); setAppModal(true);
  }
  function toggleApp(app: AppInfo) {
    const isSelected = selectedApps.some(a => a.id === app.id);
    if (!isSelected && !isPremium && selectedApps.length >= 3) {
      openPaywall('app_limit_exceeded');
      return;
    }
    setSelectedApps(prev => isSelected ? prev.filter(a => a.id !== app.id) : [...prev, app]);
  }
  async function saveAppGroup() {
    if (!appGroupName.trim()) { Alert.alert('Error', 'Group name required'); return; }
    try {
      const appsToSave = selectedApps.map(app => {
        const found = deviceApps.find(d => d.id === app.id);
        return {
          id: app.id,
          name: app.name,
          icon: 'apps-outline',
          iconUri: (app as any).iconUri || found?.iconUri,
        };
      });
      if (editingAppGroup) {
        await appGroupApi.update(editingAppGroup.id, { name: appGroupName.trim(), apps: appsToSave });
      } else {
        await appGroupApi.create({ name: appGroupName.trim(), apps: appsToSave });
      }
      setAppModal(false);
      fetchAppGroups();
    } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save'); }
  }
  async function deleteAppGroup(id: string) {
    Alert.alert('Delete Group', 'Remove this app group?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await appGroupApi.delete(id); fetchAppGroups(); } catch { Alert.alert('Error', 'Failed to delete'); }
      }},
    ]);
  }

  // ─── Website Group Handlers ───────────────────────────────────────────────

  function openCreateWebsiteGroup() {
    if (!isPremium && websiteGroups.length >= 2) {
      openPaywall('website_group_limit');
      return;
    }
    setEditingWebsiteGroup(null); setWebsiteGroupName(''); setSelectedWebsites([]); setCustomWebsite(''); setWebsiteModal(true);
  }
  function openEditWebsiteGroup(g: WebsiteGroup) {
    setEditingWebsiteGroup(g); setWebsiteGroupName(g.name); setSelectedWebsites(g.websites || []); setCustomWebsite(''); setWebsiteModal(true);
  }
  function toggleWebsite(site: string) {
    const isSelected = selectedWebsites.includes(site);
    if (!isSelected && !isPremium && selectedWebsites.length >= 3) {
      openPaywall('website_limit_exceeded');
      return;
    }
    setSelectedWebsites(prev => isSelected ? prev.filter(s => s !== site) : [...prev, site]);
  }
  function addCustomWebsite() {
    const site = customWebsite.trim().toLowerCase().replace(/^https?:\/\//, '');
    if (!site) return;
    if (!selectedWebsites.includes(site)) {
      if (!isPremium && selectedWebsites.length >= 3) {
        openPaywall('website_limit_exceeded');
        return;
      }
      setSelectedWebsites(prev => [...prev, site]);
    }
    setCustomWebsite('');
  }
  async function saveWebsiteGroup() {
    if (!websiteGroupName.trim()) { Alert.alert('Error', 'Group name required'); return; }
    try {
      if (editingWebsiteGroup) {
        await websiteGroupApi.update(editingWebsiteGroup.id, { name: websiteGroupName.trim(), websites: selectedWebsites });
      } else {
        await websiteGroupApi.create({ name: websiteGroupName.trim(), websites: selectedWebsites });
      }
      setWebsiteModal(false);
      fetchWebsiteGroups();
    } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save'); }
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
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top + 28, 48) }]}>

        {!isPremium && (
          <TouchableOpacity
            style={[
              styles.freeTierNotice,
              {
                backgroundColor: isDark ? 'rgba(139, 167, 148, 0.12)' : 'rgba(88, 112, 66, 0.08)',
                borderColor: theme.border,
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
          <TouchableOpacity onPress={openCreateAppGroup} style={[styles.addBtn, { borderColor: theme.accent }]}>
            <Ionicons name="add" size={16} color={theme.accent} />
            <Text style={[styles.addBtnText, { color: theme.accent }]}>New</Text>
          </TouchableOpacity>
        </View>

        {appGroupLoading ? (
          <ActivityIndicator size="small" color={theme.accent} style={{ marginVertical: 20 }} />
        ) : appGroups.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="phone-portrait-outline" size={28} color={theme.textSecondary} />
            <Text style={[styles.emptyCardText, { color: theme.textSecondary }]}>No app groups yet</Text>
          </View>
        ) : appGroups.map(group => (
          <View key={group.id} style={[styles.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
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

        {/* ── Divider ── */}
        <View style={[styles.divider, { borderColor: theme.border }]} />

        {/* ── Website Groups ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>WEBSITE GROUPS</Text>
          <TouchableOpacity onPress={openCreateWebsiteGroup} style={[styles.addBtn, { borderColor: theme.accent }]}>
            <Ionicons name="add" size={16} color={theme.accent} />
            <Text style={[styles.addBtnText, { color: theme.accent }]}>New</Text>
          </TouchableOpacity>
        </View>

        {websiteGroupLoading ? (
          <ActivityIndicator size="small" color={theme.accent} style={{ marginVertical: 20 }} />
        ) : websiteGroups.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="globe-outline" size={28} color={theme.textSecondary} />
            <Text style={[styles.emptyCardText, { color: theme.textSecondary }]}>No website groups</Text>
          </View>
        ) : websiteGroups.map(group => (
          <View key={group.id} style={[styles.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
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

        <View style={{ height: 100 }} />
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
                <Text style={[styles.recommendedHeader, { color: theme.textSecondary }]}>
                  Recommended apps (based on usage)
                </Text>
                <View style={{ gap: 8, marginTop: 8 }}>
                  {recommendedApps.map(app => {
                    const isSel = selectedApps.some(a => a.id === app.id);
                    return (
                      <TouchableOpacity
                        key={`rec-${app.id}`}
                        style={[
                          styles.listItem,
                          {
                            backgroundColor: isSel ? `${theme.accent}30` : theme.surface,
                          },
                        ]}
                        onPress={() => toggleApp(app)}
                        activeOpacity={0.7}
                      >
                        {app.iconUri
                          ? <Image source={{ uri: app.iconUri }} style={styles.appIcon} />
                          : <Ionicons name="apps-outline" size={24} color={theme.textSecondary} />}
                        <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', marginLeft: 4 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text, marginBottom: 2 }} numberOfLines={1}>
                            {app.name}
                          </Text>
                          <Text style={[styles.usageSubtext, { color: theme.textSecondary }]} numberOfLines={1}>
                            {formatWeeklyUsage(app.totalTimeMillis)}
                          </Text>
                        </View>
                        {isSel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <TextInput
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  borderWidth: 2,
                  marginTop: 2,
                  marginBottom: 10,
                },
              ]}
              placeholder="Search apps"
              placeholderTextColor={isDark ? theme.textSecondary : '#94A3B8'}
              value={appSearchQuery}
              onChangeText={setAppSearchQuery}
            />

            {deviceApps
              .filter(app => app.name.toLowerCase().includes(appSearchQuery.toLowerCase()))
              .map(app => {
                const isSel = selectedApps.some(a => a.id === app.id);
                return (
                  <TouchableOpacity
                    key={app.id}
                    style={[
                      styles.cleanListItem,
                      isSel && { backgroundColor: `${theme.accent}20` },
                    ]}
                    onPress={() => toggleApp(app)}
                    activeOpacity={0.7}
                  >
                    {(app as any).iconUri
                      ? <Image source={{ uri: (app as any).iconUri }} style={styles.appIcon} />
                      : <Ionicons name="apps-outline" size={24} color={theme.textSecondary} />}
                    <Text style={{ flex: 1, fontSize: 15, color: theme.text, marginLeft: 4 }}>{app.name}</Text>
                    {isSel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
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
              <Text style={[styles.modalTitle, { color: theme.text }]}>{editingWebsiteGroup ? 'Edit Group' : 'New Website Group'}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                {selectedWebsites.length} sites selected {!isPremium ? '(Free limit: 3)' : '(Unlimited)'}
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
  scrollContent: { padding: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  addBtnText: { fontSize: 13, fontWeight: '500' },
  groupCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
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
  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8, marginBottom: 10 },
  emptyCardText: { fontSize: 14 },
  divider: { borderTopWidth: 1, marginVertical: 20 },
  modalContainer: { flex: 1, padding: 20, paddingTop: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: '500' },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: 8, marginTop: 16 },
  recommendedHeader: { fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  usageSubtext: { fontSize: 11, marginTop: 2 },
  input: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, fontSize: 16, fontWeight: '300', marginBottom: 4 },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  customInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 14 },
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
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  freeNoticeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
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
