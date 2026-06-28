// ============================================================
// Focussive Mobile — App Groups Screen
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
} from 'react-native';
import { useTheme } from '@/utils/theme';
import { appGroupApi } from '@/utils/api';
import { PREDEFINED_APPS } from '@focussive/shared';
import type { AppGroup, AppInfo } from '@focussive/shared';
import { Ionicons } from '@expo/vector-icons';
import InstalledApps from '../../../modules/my-module';

export default function AppGroupsScreen() {
  const theme = useTheme();

  const [groups, setGroups] = useState<AppGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AppGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedApps, setSelectedApps] = useState<AppInfo[]>([]);
  const [deviceApps, setDeviceApps] = useState<AppInfo[]>(PREDEFINED_APPS);

  const fetchGroups = useCallback(async () => {
    try {
      const response = await appGroupApi.getAll();
      setGroups(response.data as AppGroup[]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
    
    async function loadDeviceApps() {
      try {
        if (!InstalledApps) return; // Native module not available yet — use predefined apps
        const apps = await InstalledApps.getApps();
        if (apps && apps.length > 0) {
          setDeviceApps(apps.map(a => ({ id: a.id, name: a.name, icon: 'apps-outline' })));
        }
      } catch {
        // Fallback to predefined apps if native module fails (e.g. in Expo Go before rebuild)
      }
    }
    loadDeviceApps();
  }, [fetchGroups]);

  function openCreateModal() {
    setEditingGroup(null);
    setGroupName('');
    setSelectedApps([]);
    setModalVisible(true);
  }

  function openEditModal(group: AppGroup) {
    setEditingGroup(group);
    setGroupName(group.name);
    setSelectedApps(group.apps || []);
    setModalVisible(true);
  }

  function toggleApp(app: AppInfo) {
    setSelectedApps((prev) => {
      const exists = prev.find((a) => a.id === app.id);
      if (exists) return prev.filter((a) => a.id !== app.id);
      return [...prev, app];
    });
  }

  async function handleSave() {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    try {
      if (editingGroup) {
        await appGroupApi.update(editingGroup.id, { name: groupName.trim(), apps: selectedApps });
      } else {
        await appGroupApi.create({ name: groupName.trim(), apps: selectedApps });
      }
      setModalVisible(false);
      fetchGroups();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save');
    }
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete Group', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await appGroupApi.delete(id);
            fetchGroups();
          } catch {
            Alert.alert('Error', 'Failed to delete group');
          }
        },
      },
    ]);
  }

  function renderGroup({ item }: { item: AppGroup }) {
    return (
      <TouchableOpacity
        style={[styles.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => openEditModal(item)}
      >
        <View style={styles.groupHeader}>
          <Text style={[styles.groupName, { color: theme.text }]}>{item.name}</Text>
          <TouchableOpacity onPress={() => handleDelete(item.id)}>
            <Ionicons name="trash-outline" size={20} color={theme.danger} />
          </TouchableOpacity>
        </View>
        <View style={styles.appList}>
          {(item.apps || []).slice(0, 5).map((app) => (
            <View key={app.id} style={[styles.appChip, { backgroundColor: theme.surface }]}>
              <Ionicons name={app.icon as any || 'apps-outline'} size={14} color={theme.textSecondary} />
              <Text style={[styles.appChipText, { color: theme.textSecondary }]}>{app.name}</Text>
            </View>
          ))}
          {(item.apps || []).length > 5 && (
            <Text style={[styles.moreText, { color: theme.textSecondary }]}>
              +{item.apps.length - 5} more
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={groups}
        renderItem={renderGroup}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="apps-outline" size={48} color={theme.textSecondary} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No app groups</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Create groups of distracting apps to block during sessions
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.accentDark }]}
        onPress={openCreateModal}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Create/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingGroup ? 'Edit Group' : 'New Group'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              placeholder="Group Name"
              placeholderTextColor={theme.textSecondary}
              value={groupName}
              onChangeText={setGroupName}
            />

            <Text style={[styles.appSectionTitle, { color: theme.textSecondary }]}>Select Apps</Text>

            <ScrollView style={styles.appGrid}>
              {deviceApps.map((app) => {
                const isSelected = selectedApps.some((a) => a.id === app.id);
                return (
                  <TouchableOpacity
                    key={app.id}
                    style={[
                      styles.appItem,
                      { borderColor: isSelected ? theme.accent : theme.border },
                      isSelected && { backgroundColor: `${theme.accent}20` },
                    ]}
                    onPress={() => toggleApp(app)}
                  >
                    <Ionicons name={app.icon as any || 'apps-outline'} size={24} color={theme.textSecondary} />
                    <Text style={[styles.appItemName, { color: theme.text }]}>{app.name}</Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color={theme.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: theme.accentDark }]}
              onPress={handleSave}
            >
              <Text style={styles.saveBtnText}>Save Group</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 100 },
  groupCard: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 12 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  groupName: { fontSize: 18, fontWeight: '500' },
  deleteBtn: { fontSize: 18 },
  appList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  appChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
  appChipIcon: { fontSize: 14 },
  appChipText: { fontSize: 12 },
  moreText: { fontSize: 12, alignSelf: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '300', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, fontWeight: '300', textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  fabText: { color: '#FFFFFF', fontSize: 28, fontWeight: '300', lineHeight: 30 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '500' },
  closeBtn: { fontSize: 20, padding: 4 },
  input: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, fontSize: 16, fontWeight: '300', marginBottom: 20 },
  appSectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: 12 },
  appGrid: { maxHeight: 300, marginBottom: 20 },
  appItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8, gap: 12 },
  appItemIcon: { fontSize: 24 },
  appItemName: { fontSize: 15, flex: 1 },
  checkmark: { fontSize: 18, fontWeight: '700' },
  saveBtn: { height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
