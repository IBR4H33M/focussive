// ============================================================
// Focussive Mobile — Settings Screen
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useTheme } from '@/utils/theme';
import { useAuth } from '@/context/AuthContext';
import { userApi } from '@/utils/api';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen() {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<{ name: string; email: string; age?: number } | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const data = await userApi.getProfile() as { name: string; email: string; age?: number };
      setProfile(data);
    } catch {
      // Use auth context user as fallback
    }
  }

  function openEditModal() {
    setEditName(profile?.name || user?.name || '');
    setEditAge(profile?.age?.toString() || '');
    setEditModalVisible(true);
  }

  async function handleSaveProfile() {
    try {
      await userApi.updateProfile({
        name: editName.trim() || undefined,
        age: editAge ? parseInt(editAge, 10) : undefined,
      });
      setEditModalVisible(false);
      fetchProfile();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update');
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'All fields are required');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }
    try {
      await userApi.updatePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: confirmPassword,
      });
      setPasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Success', 'Password updated');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to change password');
    }
  }

  async function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login' as never);
        },
      },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await userApi.deleteAccount();
              await logout();
              router.replace('/(auth)/login' as never);
            } catch {
              Alert.alert('Error', 'Failed to delete account');
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Profile Section */}
      <View style={[styles.section, { borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>PROFILE</Text>

        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
            <Text style={styles.avatarText}>
              {(profile?.name || user?.name || 'U')[0]?.toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: theme.text }]}>
              {profile?.name || user?.name}
            </Text>
            <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
              {profile?.email || user?.email}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.menuItem, { borderColor: theme.border }]}
          onPress={openEditModal}
        >
          <Text style={[styles.menuText, { color: theme.text }]}>Edit Profile</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuItem, { borderColor: theme.border }]}
          onPress={() => setPasswordModalVisible(true)}
        >
          <Text style={[styles.menuText, { color: theme.text }]}>Change Password</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuItem, { borderColor: theme.border }]}
          onPress={() => router.push('/(auth)/extension-qr' as never)}
        >
          <Text style={[styles.menuText, { color: theme.text }]}>Connect Extension</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Data */}
      <View style={[styles.section, { borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>DATA</Text>

        <TouchableOpacity
          style={[styles.menuItem, { borderColor: theme.border }]}
          onPress={() => router.push('/history/manage' as never)}
        >
          <Text style={[styles.menuText, { color: theme.text }]}>Manage History</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Actions */}
      <View style={[styles.section, { borderColor: theme.border }]}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={[styles.logoutText, { color: theme.danger }]}>Log Out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
          <Text style={[styles.deleteText, { color: theme.danger }]}>Delete Account</Text>
        </TouchableOpacity>
      </View>

      {/* Version */}
      <Text style={[styles.version, { color: theme.textSecondary }]}>Focussive v1.0.0</Text>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Profile</Text>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              placeholder="Name"
              placeholderTextColor={theme.textSecondary}
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              placeholder="Age"
              placeholderTextColor={theme.textSecondary}
              value={editAge}
              onChangeText={setEditAge}
              keyboardType="numeric"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { borderColor: theme.border }]} onPress={() => setEditModalVisible(false)}>
                <Text style={{ color: theme.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.accentDark }]} onPress={handleSaveProfile}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={passwordModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Change Password</Text>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              placeholder="Current Password"
              placeholderTextColor={theme.textSecondary}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
            />
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              placeholder="New Password"
              placeholderTextColor={theme.textSecondary}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              placeholder="Confirm New Password"
              placeholderTextColor={theme.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { borderColor: theme.border }]} onPress={() => setPasswordModalVisible(false)}>
                <Text style={{ color: theme.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.accentDark }]} onPress={handleChangePassword}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 22, fontWeight: '600', color: '#1a1a1a' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '500' },
  profileEmail: { fontSize: 14, fontWeight: '300', marginTop: 2 },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
  menuText: { fontSize: 16, fontWeight: '300' },
  menuArrow: { fontSize: 22, fontWeight: '300' },
  logoutBtn: { paddingVertical: 16 },
  logoutText: { fontSize: 16, fontWeight: '500' },
  deleteBtn: { paddingVertical: 16 },
  deleteText: { fontSize: 14, fontWeight: '300', opacity: 0.7 },
  version: { textAlign: 'center', fontSize: 12, marginTop: 16, marginBottom: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { borderRadius: 16, borderWidth: 1, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '500', marginBottom: 20 },
  input: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, fontSize: 16, fontWeight: '300', marginBottom: 12 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
});
