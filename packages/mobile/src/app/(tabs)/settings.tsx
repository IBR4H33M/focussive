// ============================================================
// Focussive Mobile — Settings Screen
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useTheme } from '@/utils/theme';
import { useAuth } from '@/context/AuthContext';
import { userApi, sessionApi } from '@/utils/api';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  hasUsageStatsPermission,
  hasOverlayPermission,
  requestUsageStatsPermission,
  requestOverlayPermission,
  hasExactAlarmPermission,
  requestExactAlarmPermission,
} from '@focussive/app-blocker';
import { useThemeContext, type ThemePreference } from '@/utils/theme';
import { getReminderMinutes, setReminderMinutes, scheduleSessionReminders } from '@/utils/sessionReminders';
import { useSessions } from '@/context/SessionContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── TimeFormatToggle ─────────────────────────────────────────────────────────
function TimeFormatToggle({
  use24Hour,
  onToggle,
  theme,
}: {
  use24Hour: boolean;
  onToggle: () => void;
  theme: any;
}) {
  const slideAnim = React.useRef(new Animated.Value(use24Hour ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: use24Hour ? 1 : 0,
      useNativeDriver: true,
      tension: 180,
      friction: 20,
    }).start();
  }, [use24Hour]);

  const PILL_W = 52;

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, PILL_W + 2],
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.surface,
        borderRadius: 10,
        paddingHorizontal: 2,
        paddingVertical: 2,
        paddingBottom: 6,
        position: 'relative',
        width: PILL_W * 2 + 4,
        height: 40,
      }}
    >
      {/* Sliding accent pill */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 2,
          left: 0,
          width: PILL_W,
          height: 32,
          borderRadius: 8,
          backgroundColor: theme.accentDark,
          transform: [{ translateX }],
        }}
      />

      {/* 12H */}
      <TouchableOpacity
        onPress={() => { if (use24Hour) onToggle(); }}
        style={{ width: PILL_W, height: 32, justifyContent: 'center', alignItems: 'center', zIndex: 1 }}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: !use24Hour ? '#FFFFFF' : theme.textSecondary }}>
          12H
        </Text>
      </TouchableOpacity>

      {/* 24H */}
      <TouchableOpacity
        onPress={() => { if (!use24Hour) onToggle(); }}
        style={{ width: PILL_W, height: 32, justifyContent: 'center', alignItems: 'center', zIndex: 1 }}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: use24Hour ? '#FFFFFF' : theme.textSecondary }}>
          24H
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── ThemeModeToggle ─────────────────────────────────────────────────────────
function ThemeModeToggle({
  preference,
  onSelect,
  theme,
}: {
  preference: ThemePreference;
  onSelect: (p: ThemePreference) => void;
  theme: any;
}) {
  const options: { key: ThemePreference; label: string }[] = [
    { key: 'system', label: 'System' },
    { key: 'light', label: 'Light' },
    { key: 'dark', label: 'Dark' },
  ];
  const isSystem = preference === 'system';

  return (
    <View style={{ flexDirection: 'row', backgroundColor: theme.surface, borderRadius: 10, paddingHorizontal: 2, paddingVertical: 2, paddingBottom: 6, gap: 2 }}>
      {options.map((opt) => {
        const active = preference === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: 8,
              alignItems: 'center',
              backgroundColor: active ? theme.accentDark : 'transparent',
              opacity: isSystem && opt.key !== 'system' ? 0.35 : 1,
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFFFFF' : theme.textSecondary }}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const themeCtx = useThemeContext();
  const { user, logout } = useAuth();
  const { allSessions, activeSessions } = useSessions();
  const router = useRouter();
  const params = useLocalSearchParams<{ expandPermissions?: string }>();

  const [profile, setProfile] = useState<{ name: string; email: string; age?: number } | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [use24Hour, setUse24Hour] = useState(true);

  // Session reminder state
  const [reminderMinutes, setReminderMinutesState] = useState(15);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [reminderInputValue, setReminderInputValue] = useState('15');

  // Permission accordion state
  const [permAccordionOpen, setPermAccordionOpen] = useState(params.expandPermissions === 'true');
  const [hasUsageStats, setHasUsageStats] = useState<boolean | null>(null);
  const [hasOverlay, setHasOverlay] = useState<boolean | null>(null);
  const [hasExactAlarm, setHasExactAlarm] = useState<boolean | null>(null);
  const [hasNotifications, setHasNotifications] = useState<boolean | null>(null);
  const accordionAnim = useRef(new Animated.Value(params.expandPermissions === 'true' ? 1 : 0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const permissionsRef = useRef<View>(null);

  // Backend connectivity check state
  const [versionTapCount, setVersionTapCount] = useState(0);
  const [backendStatus, setBackendStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const [lastCheckedTime, setLastCheckedTime] = useState<string | null>(null);
  const [spinnerChar, setSpinnerChar] = useState('/');
  const spinnerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const allPermsGranted =
    hasUsageStats === true && hasOverlay === true && hasExactAlarm === true && hasNotifications === true;
  const permsMissing =
    hasUsageStats === false || hasOverlay === false || hasExactAlarm === false || hasNotifications === false;

  useEffect(() => {
    fetchProfile();
    loadTimeFormat();
    checkPermissionStatuses();
    loadReminderMinutes();
  }, []);

  // Scroll to permissions section if coming from permission modal
  useEffect(() => {
    if (params.expandPermissions === 'true' && permissionsRef.current && scrollViewRef.current) {
      setTimeout(() => {
        permissionsRef.current?.measureInWindow((x, y) => {
          scrollViewRef.current?.scrollTo({ y: y - 60, animated: true });
        });
      }, 100);
    }
  }, [params.expandPermissions]);

  // Auto-check permissions when returning to Settings
  useFocusEffect(
    React.useCallback(() => {
      checkPermissionStatuses();
    }, [])
  );

  // Cleanup spinner interval on unmount
  useEffect(() => {
    return () => {
      if (spinnerIntervalRef.current) clearInterval(spinnerIntervalRef.current);
    };
  }, []);

  async function checkPermissionStatuses() {
    try {
      const [usage, overlay, exactAlarm, notifPerm] = await Promise.all([
        hasUsageStatsPermission(),
        hasOverlayPermission(),
        hasExactAlarmPermission(),
        (async () => {
          try {
            const perms = await Notifications.getPermissionsAsync();
            return perms.granted;
          } catch {
            return null;
          }
        })(),
      ]);
      setHasUsageStats(usage);
      setHasOverlay(overlay);
      setHasExactAlarm(exactAlarm);
      setHasNotifications(notifPerm);
    } catch {
      // Not Android or module unavailable
    }
  }

  async function loadReminderMinutes() {
    const mins = await getReminderMinutes();
    setReminderMinutesState(mins);
    setReminderInputValue(String(mins));
  }

  async function saveReminderMinutes() {
    const parsed = parseInt(reminderInputValue, 10);
    if (isNaN(parsed) || parsed <= 0 || parsed > 1440) {
      Alert.alert('Invalid Value', 'Please enter a number between 1 and 1440 minutes.');
      return;
    }
    await setReminderMinutes(parsed);
    setReminderMinutesState(parsed);
    setReminderModalVisible(false);
    // Reschedule reminders with new offset (fire and forget)
    scheduleSessionReminders(allSessions, activeSessions).catch(() => {});
    Alert.alert('Saved', `You'll be reminded ${parsed} minute${parsed !== 1 ? 's' : ''} before each session.`);
  }

  function togglePermAccordion() {
    const toValue = permAccordionOpen ? 0 : 1;
    setPermAccordionOpen(!permAccordionOpen);
    Animated.spring(accordionAnim, {
      toValue,
      useNativeDriver: false,
      tension: 120,
      friction: 14,
    }).start();
  }

  async function loadTimeFormat() {
    try {
      const format = await AsyncStorage.getItem('time_format');
      setUse24Hour(format !== '12');
    } catch {
      // Default to 24-hour
    }
  }

  async function toggleTimeFormat() {
    const newFormat = !use24Hour;
    setUse24Hour(newFormat);
    try {
      await AsyncStorage.setItem('time_format', newFormat ? '24' : '12');
    } catch {
      Alert.alert('Error', 'Failed to save time format');
    }
  }

  async function checkBackendConnectivity() {
    setBackendStatus('checking');
    const spinnerChars = ['/', '\\', '-'];
    let spinnerIndex = 0;

    if (spinnerIntervalRef.current) clearInterval(spinnerIntervalRef.current);
    spinnerIntervalRef.current = setInterval(() => {
      setSpinnerChar(spinnerChars[spinnerIndex]);
      spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
    }, 200);

    try {
      await sessionApi.getAll();
      setBackendStatus('online');
    } catch (error) {
      console.log('Backend check failed:', error);
      setBackendStatus('offline');
    }

    if (spinnerIntervalRef.current) clearInterval(spinnerIntervalRef.current);
    setSpinnerChar('/');

    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    setLastCheckedTime(`${date} ${time}`);
  }

  function handleVersionTap() {
    const newCount = versionTapCount + 1;
    setVersionTapCount(newCount);
    if (newCount >= 5) {
      setVersionTapCount(0);
      checkBackendConnectivity();
    }
  }

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

  async function checkPermissions() {
    // Refresh statuses first
    await checkPermissionStatuses();
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingTop: Math.max(insets.top, 16) }}
    >

      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.accent, fontWeight: '700' }]}>PROFILE</Text>

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

        <TouchableOpacity style={styles.menuItem} onPress={openEditModal}>
          <Text style={[styles.menuText, { color: theme.text }]}>Edit Profile</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => setPasswordModalVisible(true)}>
          <Text style={[styles.menuText, { color: theme.text }]}>Change Password</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>

      </View>
      <View style={[styles.sectionDivider, { backgroundColor: theme.border }]} />

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.accent, fontWeight: '700' }]}>PREFERENCES</Text>

        <View style={styles.menuItem}>
          <Text style={[styles.menuText, { color: theme.text }]}>Time Format</Text>
          <TimeFormatToggle use24Hour={use24Hour} onToggle={toggleTimeFormat} theme={theme} />
        </View>

        <View style={[styles.menuItem, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
          <Text style={[styles.menuText, { color: theme.text }]}>Appearance</Text>
          <ThemeModeToggle
            preference={themeCtx.preference}
            onSelect={(p) => themeCtx.setPreference(p)}
            theme={theme}
          />
        </View>

        {/* Session Reminder */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => {
            setReminderInputValue(String(reminderMinutes));
            setReminderModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <View>
            <Text style={[styles.menuText, { color: theme.text }]}>Session Reminder</Text>
            <Text style={[styles.reminderSubtext, { color: theme.textSecondary }]}>
              {reminderMinutes} min before session
            </Text>
          </View>
          <Ionicons name="notifications-outline" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={[styles.sectionDivider, { backgroundColor: theme.border }]} />

      {/* System */}
      <View style={styles.section} ref={permissionsRef}>
        <Text style={[styles.sectionTitle, { color: theme.accent, fontWeight: '700' }]}>SYSTEM</Text>

        {/* App Permissions Accordion */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={togglePermAccordion}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Text style={[styles.menuText, { color: theme.text }]}>App permissions</Text>
            {permsMissing && (
              <Ionicons name="warning-outline" size={16} color={theme.danger} />
            )}
            {allPermsGranted && (
              <Ionicons name="checkmark-circle" size={16} color={theme.accent} />
            )}
          </View>
          <Animated.View
            style={{
              transform: [{
                rotate: accordionAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '180deg'],
                }),
              }],
            }}
          >
            <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
          </Animated.View>
        </TouchableOpacity>

        {/* Accordion body */}
        {permAccordionOpen && (
          <View
            style={[
              styles.accordionBody,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {/* Usage Access */}
            <TouchableOpacity
              style={styles.permRow}
              onPress={() => {
                requestUsageStatsPermission();
              }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.permTitle, { color: theme.text }]}>Usage Access</Text>
                <Text style={[styles.permDesc, { color: theme.textSecondary }]}>
                  Required to detect which app is in the foreground
                </Text>
              </View>
              {hasUsageStats === null ? (
                <Ionicons name="ellipse-outline" size={22} color={theme.textSecondary} />
              ) : hasUsageStats ? (
                <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
              ) : (
                <Ionicons name="warning" size={22} color={theme.danger} />
              )}
            </TouchableOpacity>

            <View style={[styles.permDivider, { backgroundColor: theme.border }]} />

            {/* Overlay */}
            <TouchableOpacity
              style={styles.permRow}
              onPress={() => {
                requestOverlayPermission();
              }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.permTitle, { color: theme.text }]}>Display Over Other Apps</Text>
                <Text style={[styles.permDesc, { color: theme.textSecondary }]}>
                  Required to show the block overlay on top of apps
                </Text>
              </View>
              {hasOverlay === null ? (
                <Ionicons name="ellipse-outline" size={22} color={theme.textSecondary} />
              ) : hasOverlay ? (
                <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
              ) : (
                <Ionicons name="warning" size={22} color={theme.danger} />
              )}
            </TouchableOpacity>

            <View style={[styles.permDivider, { backgroundColor: theme.border }]} />

            {/* Exact Alarm */}
            <TouchableOpacity
              style={styles.permRow}
              onPress={() => {
                requestExactAlarmPermission();
              }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.permTitle, { color: theme.text }]}>Allow Precise Alarms</Text>
                <Text style={[styles.permDesc, { color: theme.textSecondary }]}>
                  Required for accurate session reminder notifications
                </Text>
              </View>
              {hasExactAlarm === null ? (
                <Ionicons name="ellipse-outline" size={22} color={theme.textSecondary} />
              ) : hasExactAlarm ? (
                <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
              ) : (
                <Ionicons name="warning" size={22} color={theme.danger} />
              )}
            </TouchableOpacity>

            <View style={[styles.permDivider, { backgroundColor: theme.border }]} />

            {/* Notifications */}
            <TouchableOpacity
              style={styles.permRow}
              onPress={() => {
                Notifications.requestPermissionsAsync();
                setTimeout(() => checkPermissionStatuses(), 500);
              }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.permTitle, { color: theme.text }]}>Allow Notifications</Text>
                <Text style={[styles.permDesc, { color: theme.textSecondary }]}>
                  Required to send session reminders and alerts
                </Text>
              </View>
              {hasNotifications === null ? (
                <Ionicons name="ellipse-outline" size={22} color={theme.textSecondary} />
              ) : hasNotifications ? (
                <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
              ) : (
                <Ionicons name="warning" size={22} color={theme.danger} />
              )}
            </TouchableOpacity>

          </View>
        )}

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(auth)/extension-qr' as never)}>
          <Text style={[styles.menuText, { color: theme.text }]}>Extension</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="checkmark-circle" size={16} color={theme.accent} />
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>

        {/* Version */}
        <View style={[styles.menuItem, { flexDirection: 'column', alignItems: 'stretch', gap: 4 }]}>
          <TouchableOpacity onPress={handleVersionTap} activeOpacity={0.7}>
            <Text style={[styles.menuText, { color: theme.text }]}>Version</Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }}>v1.0.0</Text>
          </TouchableOpacity>

          {backendStatus !== 'idle' && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }}>
              {backendStatus === 'checking' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 13, color: theme.textSecondary }}>Checking</Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, fontWeight: '600', fontFamily: 'monospace' }}>
                    {spinnerChar}
                  </Text>
                </View>
              )}

              {backendStatus === 'online' && (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark-circle" size={14} color={theme.accent} />
                    <Text style={{ fontSize: 13, color: theme.accent, fontWeight: '600' }}>Server online</Text>
                  </View>
                  {lastCheckedTime && (
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>
                      Last checked: {lastCheckedTime}
                    </Text>
                  )}
                </View>
              )}

              {backendStatus === 'offline' && (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="close-circle" size={14} color="#FF6B6B" />
                    <Text style={{ fontSize: 13, color: '#FF6B6B', fontWeight: '600' }}>Server offline</Text>
                  </View>
                  {lastCheckedTime && (
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>
                      Last checked: {lastCheckedTime}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </View>
      <View style={[styles.sectionDivider, { backgroundColor: theme.border }]} />

      {/* Data */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.accent, fontWeight: '700' }]}>DATA</Text>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/history/manage' as never)}>
          <Text style={[styles.menuText, { color: theme.text }]}>Manage History</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={[styles.sectionDivider, { backgroundColor: theme.border }]} />

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <Text style={[styles.logoutText, { color: theme.danger }]}>Log Out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.deleteAccountBtn, { backgroundColor: theme.danger }]} onPress={handleDeleteAccount}>
          <Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.sectionDivider, { backgroundColor: theme.border }]} />

      <Text style={[styles.version, { color: theme.textSecondary }]}>Focussive v1.0.0</Text>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Profile</Text>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
              placeholder="Name"
              placeholderTextColor={theme.textSecondary}
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
              placeholder="Age"
              placeholderTextColor={theme.textSecondary}
              value={editAge}
              onChangeText={setEditAge}
              keyboardType="numeric"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.surface }]} onPress={() => setEditModalVisible(false)}>
                <Text style={{ color: theme.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.accent }]} onPress={handleSaveProfile}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={passwordModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Change Password</Text>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
              placeholder="Current Password"
              placeholderTextColor={theme.textSecondary}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
            />
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
              placeholder="New Password"
              placeholderTextColor={theme.textSecondary}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
              placeholder="Confirm New Password"
              placeholderTextColor={theme.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.surface }]} onPress={() => setPasswordModalVisible(false)}>
                <Text style={{ color: theme.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.accent }]} onPress={handleChangePassword}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Session Reminder Modal */}
      <Modal visible={reminderModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Session Reminder</Text>
            <Text style={[styles.reminderModalDesc, { color: theme.textSecondary }]}>
              How many minutes before a session should you be notified?
            </Text>

            {/* Quick presets */}
            <View style={styles.reminderPresets}>
              {[5, 10, 15, 30, 60].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.reminderPresetBtn,
                    {
                      backgroundColor:
                        reminderInputValue === String(preset)
                          ? theme.accentDark
                          : theme.surface,
                    },
                  ]}
                  onPress={() => setReminderInputValue(String(preset))}
                >
                  <Text
                    style={[
                      styles.reminderPresetText,
                      {
                        color:
                          reminderInputValue === String(preset)
                            ? '#FFFFFF'
                            : theme.textSecondary,
                      },
                    ]}
                  >
                    {preset >= 60 ? `${preset / 60}h` : `${preset}m`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom input */}
            <View style={styles.reminderCustomRow}>
              <TextInput
                style={[styles.reminderInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
                placeholder="Custom minutes"
                placeholderTextColor={theme.textSecondary}
                value={reminderInputValue}
                onChangeText={setReminderInputValue}
                keyboardType="numeric"
                maxLength={4}
              />
              <Text style={[{ color: theme.textSecondary, fontSize: 14 }]}>min</Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.surface }]}
                onPress={() => setReminderModalVisible(false)}
              >
                <Text style={{ color: theme.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent }]}
                onPress={saveReminderMinutes}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Save</Text>
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
  sectionDivider: { height: StyleSheet.hairlineWidth, marginBottom: 32 },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 22, fontWeight: '600', color: '#1a1a1a' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '500' },
  profileEmail: { fontSize: 14, fontWeight: '300', marginTop: 2 },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  menuText: { fontSize: 16, fontWeight: '300' },
  logoutText: { fontSize: 16, fontWeight: '500' },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  deleteAccountText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  version: { textAlign: 'center', fontSize: 12, marginTop: 16, marginBottom: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '500', marginBottom: 20 },
  input: { height: 48, borderRadius: 10, paddingHorizontal: 16, fontSize: 16, fontWeight: '300', marginBottom: 12 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  // Accordion
  accordionBody: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  permDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  permTitle: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  permDesc: { fontSize: 12, fontWeight: '300', lineHeight: 16 },
  // Session reminder
  reminderSubtext: { fontSize: 12, fontWeight: '300', marginTop: 2 },
  reminderModalDesc: { fontSize: 14, fontWeight: '300', marginBottom: 16, lineHeight: 20 },
  reminderPresets: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  reminderPresetBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  reminderPresetText: { fontSize: 13, fontWeight: '600' },
  reminderCustomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  reminderInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '300',
    borderWidth: 1,
  },
});

