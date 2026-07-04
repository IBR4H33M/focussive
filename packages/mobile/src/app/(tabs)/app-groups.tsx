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
import { useTheme } from '@/utils/theme';
import { appGroupApi, websiteGroupApi } from '@/utils/api';
import { PREDEFINED_APPS } from '@focussive/shared';
import type { AppGroup, AppInfo, WebsiteGroup } from '@focussive/shared';
import { Ionicons } from '@expo/vector-icons';
import InstalledApps from '@focussive/installed-apps';

const COMMON_WEBSITES = [
  'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com',
  'reddit.com', 'pinterest.com', 'youtube.com', 'netflix.com', 'discord.com',
  'snapchat.com', 'twitch.tv', 'linkedin.com', 'tumblr.com', '9gag.com',
  'whatsapp.com', 'telegram.org', 'spotify.com',
];

export default function GroupsScreen() {
  const theme = useTheme();

  // App groups state
  const [appGroups, setAppGroups] = useState<AppGroup[]>([]);
  const [appGroupLoading, setAppGroupLoading] = useState(true);
  const [appModal, setAppModal] = useState(false);
  const [editingAppGroup, setEditingAppGroup] = useState<AppGroup | null>(null);
  const [appGroupName, setAppGroupName] = useState('');
  const [appSearchQuery, setAppSearchQuery] = useState('');
  const [selectedApps, setSelectedApps] = useState<AppInfo[]>([]);
  const [deviceApps, setDeviceApps] = useState<(AppInfo & { iconUri?: string })[]>(PREDEFINED_APPS);

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
          return;
        }
        const apps = await InstalledApps.getApps();
        if (apps?.length > 0) {
          setDeviceApps(apps.map(a => ({ id: a.id, name: a.name, icon: 'apps-outline', iconUri: a.icon })));
        }
      } catch (err) {
        console.error("Error loading device apps:", err);
      }
    }
    loadDeviceApps();
  }, [fetchAppGroups, fetchWebsiteGroups]);

  // ─── App Group Handlers ───────────────────────────────────────────────────

  function openCreateAppGroup() {
    setEditingAppGroup(null); setAppGroupName(''); setAppSearchQuery(''); setSelectedApps([]); setAppModal(true);
  }
  function openEditAppGroup(g: AppGroup) {
    setEditingAppGroup(g); setAppGroupName(g.name); setAppSearchQuery(''); setSelectedApps(g.apps || []); setAppModal(true);
  }
  function toggleApp(app: AppInfo) {
    setSelectedApps(prev => prev.some(a => a.id === app.id) ? prev.filter(a => a.id !== app.id) : [...prev, app]);
  }
  async function saveAppGroup() {
    if (!appGroupName.trim()) { Alert.alert('Error', 'Group name required'); return; }
    try {
      if (editingAppGroup) {
        await appGroupApi.update(editingAppGroup.id, { name: appGroupName.trim(), apps: selectedApps });
      } else {
        await appGroupApi.create({ name: appGroupName.trim(), apps: selectedApps });
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
    setEditingWebsiteGroup(null); setWebsiteGroupName(''); setSelectedWebsites([]); setCustomWebsite(''); setWebsiteModal(true);
  }
  function openEditWebsiteGroup(g: WebsiteGroup) {
    setEditingWebsiteGroup(g); setWebsiteGroupName(g.name); setSelectedWebsites(g.websites || []); setCustomWebsite(''); setWebsiteModal(true);
  }
  function toggleWebsite(site: string) {
    setSelectedWebsites(prev => prev.includes(site) ? prev.filter(s => s !== site) : [...prev, site]);
  }
  function addCustomWebsite() {
    const site = customWebsite.trim().toLowerCase().replace(/^https?:\/\//, '');
    if (!site) return;
    if (!selectedWebsites.includes(site)) setSelectedWebsites(prev => [...prev, site]);
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
      <ScrollView contentContainerStyle={styles.scrollContent}>

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
                <TouchableOpacity onPress={() => openEditAppGroup(group)} style={styles.actionBtn}>
                  <Ionicons name="create-outline" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteAppGroup(group.id)} style={styles.actionBtn}>
                  <Ionicons name="trash-outline" size={18} color={theme.danger} />
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
                <TouchableOpacity onPress={() => openEditWebsiteGroup(group)} style={styles.actionBtn}>
                  <Ionicons name="create-outline" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteWebsiteGroup(group.id)} style={styles.actionBtn}>
                  <Ionicons name="trash-outline" size={18} color={theme.danger} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.chipRow}>
              {(group.websites || []).slice(0, 5).map(site => (
                <View key={site} style={[styles.chip, { backgroundColor: theme.surface }]}>
                  <Ionicons name="globe-outline" size={12} color={theme.textSecondary} />
                  <Text style={[styles.chipText, { color: theme.textSecondary }]}>{site}</Text>
                </View>
              ))}
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
            <Text style={[styles.modalTitle, { color: theme.text }]}>{editingAppGroup ? 'Edit Group' : 'New App Group'}</Text>
            <TouchableOpacity onPress={() => setAppModal(false)}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
            placeholder="Group Name" placeholderTextColor={theme.textSecondary}
            value={appGroupName} onChangeText={setAppGroupName}
          />
          <Text style={[styles.label, { color: theme.textSecondary }]}>SELECT APPS</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
            placeholder="Search Apps" placeholderTextColor={theme.textSecondary}
            value={appSearchQuery} onChangeText={setAppSearchQuery}
          />
          <ScrollView style={styles.listArea}>
            {deviceApps
              .filter(app => app.name.toLowerCase().includes(appSearchQuery.toLowerCase()))
              .map(app => {
              const isSel = selectedApps.some(a => a.id === app.id);
              return (
                <TouchableOpacity
                  key={app.id}
                  style={[styles.listItem, { borderColor: isSel ? theme.accent : theme.border }, isSel && { backgroundColor: `${theme.accent}15` }]}
                  onPress={() => toggleApp(app)}
                >
                  {(app as any).iconUri
                    ? <Image source={{ uri: (app as any).iconUri }} style={styles.appIcon} />
                    : <Ionicons name="apps-outline" size={24} color={theme.textSecondary} />}
                  <Text style={[styles.listItemText, { color: theme.text }]}>{app.name}</Text>
                  {isSel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.accentDark }]} onPress={saveAppGroup}>
            <Text style={styles.saveBtnText}>Save Group</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Website Group Modal ── */}
      <Modal visible={websiteModal} animationType="slide">
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{editingWebsiteGroup ? 'Edit Group' : 'New Website Group'}</Text>
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
            {selectedWebsites.filter(s => !COMMON_WEBSITES.includes(s)).map(site => (
              <TouchableOpacity
                key={site}
                style={[styles.listItem, { borderColor: theme.accent, backgroundColor: `${theme.accent}15` }]}
                onPress={() => toggleWebsite(site)}
              >
                <Ionicons name="globe-outline" size={20} color={theme.accent} />
                <Text style={[styles.listItemText, { color: theme.text }]}>{site}</Text>
                <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
              </TouchableOpacity>
            ))}
            {COMMON_WEBSITES.map(site => {
              const isSel = selectedWebsites.includes(site);
              return (
                <TouchableOpacity
                  key={site}
                  style={[styles.listItem, { borderColor: isSel ? theme.accent : theme.border }, isSel && { backgroundColor: `${theme.accent}15` }]}
                  onPress={() => toggleWebsite(site)}
                >
                  <Ionicons name="globe-outline" size={20} color={isSel ? theme.accent : theme.textSecondary} />
                  <Text style={[styles.listItemText, { color: theme.text }]}>{site}</Text>
                  {isSel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.accentDark }]} onPress={saveWebsiteGroup}>
            <Text style={styles.saveBtnText}>Save Group</Text>
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
  actionBtn: { padding: 4 },
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
  input: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, fontSize: 16, fontWeight: '300', marginBottom: 4 },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  customInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 14 },
  addIconBtn: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  listArea: { flex: 1, marginBottom: 12 },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8, gap: 12 },
  listItemText: { flex: 1, fontSize: 15 },
  appIcon: { width: 28, height: 28, borderRadius: 6 },
  saveBtn: { height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
