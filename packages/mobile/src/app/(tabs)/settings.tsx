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
  AppState,
  Image,
  Switch,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/utils/theme';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { userApi, sessionApi, deviceApi } from '@/utils/api';
import { uploadImageToCloudinary } from '@/utils/cloudinary';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  hasUsageStatsPermission,
  hasOverlayPermission,
  requestUsageStatsPermission,
  requestOverlayPermission,
  hasExactAlarmPermission,
  requestExactAlarmPermission,
  requestNotificationPermission,
} from '@focussive/app-blocker';
import { useThemeContext, type ThemePreference } from '@/utils/theme';
import { getReminderMinutes, setReminderMinutes, scheduleSessionReminders } from '@/utils/sessionReminders';
import { useSessions } from '@/context/SessionContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ExtensionModal from '@/components/ExtensionModal';

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
  const { isPremium, isTrialActive, trialDaysRemaining, openPaywall } = useSubscription();
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
  const isDark = themeCtx.isDark;

  // Quote and GIF preferences
  const [quoteEnabled, setQuoteEnabled] = useState(true);
  const [gifEnabled, setGifEnabled] = useState(false);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [uploadingGif, setUploadingGif] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Session reminder state
  const [reminderMinutes, setReminderMinutesState] = useState(15);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [reminderInputValue, setReminderInputValue] = useState('15');

  // Monthly skip limit state
  const [skipLimit, setSkipLimit] = useState(5);
  const [skipsUsedThisMonth, setSkipsUsedThisMonth] = useState(0);
  const [skipsRemaining, setSkipsRemaining] = useState(5);
  const [skipLimitModalVisible, setSkipLimitModalVisible] = useState(false);
  const [skipLimitInputValue, setSkipLimitInputValue] = useState('5');

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

  // Extension status
  const [extensionPaired, setExtensionPaired] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);

  const allPermsGranted =
    hasUsageStats === true && hasOverlay === true && hasExactAlarm === true && hasNotifications === true;
  const permsMissing =
    hasUsageStats === false || hasOverlay === false || hasExactAlarm === false || hasNotifications === false;

  useEffect(() => {
    fetchProfile();
    loadTimeFormat();
    checkPermissionStatuses();
    loadReminderMinutes();
    fetchExtensionStatus();
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
      fetchExtensionStatus();
    }, [])
  );

  // Auto-check permissions immediately when app comes back to foreground (e.g. from Android Settings)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        checkPermissionStatuses();
        fetchExtensionStatus();
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const refreshAnim = useRef(new Animated.Value(0)).current;

  async function handleRefreshPermissions() {
    Animated.timing(refreshAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start(() => {
      refreshAnim.setValue(0);
    });
    await checkPermissionStatuses();
  }

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

  async function fetchExtensionStatus() {
    try {
      const result = await deviceApi.extensionStatus();
      setExtensionPaired(result.paired);
      setExtensionConnected(result.connected);
    } catch {
      // Silently fail — don't block settings
    }
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
      const data = await userApi.getProfile() as any;
      setProfile(data);
      if (data) {
        if (typeof data.overlay_quote_enabled === 'boolean') {
          setQuoteEnabled(data.overlay_quote_enabled);
        }
        if (typeof data.overlay_gif_enabled === 'boolean') {
          setGifEnabled(data.overlay_gif_enabled);
        }
        if (data.overlay_gif_url) {
          setGifUrl(data.overlay_gif_url);
        }
        if (typeof data.monthly_skip_limit === 'number') {
          setSkipLimit(data.monthly_skip_limit);
          setSkipLimitInputValue(String(data.monthly_skip_limit));
        }
        if (typeof data.skips_used_this_month === 'number') {
          setSkipsUsedThisMonth(data.skips_used_this_month);
        }
        if (typeof data.skips_remaining === 'number') {
          setSkipsRemaining(data.skips_remaining);
        }
      }
    } catch {
      // Use auth context user as fallback
    }
  }

  const handleSkipLimitChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned === '') {
      setSkipLimitInputValue('');
      return;
    }
    const num = parseInt(cleaned, 10);
    if (num > 100) {
      setSkipLimitInputValue('100');
    } else {
      setSkipLimitInputValue(String(num));
    }
  };

  async function saveSkipLimit() {
    const parsed = parseInt(skipLimitInputValue, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      Alert.alert('Invalid Value', 'Please enter a number between 0 and 100.');
      return;
    }
    try {
      await userApi.updateProfile({ monthly_skip_limit: parsed });
      setSkipLimit(parsed);
      setSkipsRemaining(Math.max(0, parsed - skipsUsedThisMonth));
      setSkipLimitModalVisible(false);
      Alert.alert('Saved', `Monthly skip limit updated to ${parsed} session${parsed !== 1 ? 's' : ''} per month.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update skip limit');
    }
  }

  async function handleToggleQuote(val: boolean) {
    setQuoteEnabled(val);
    try {
      await userApi.updateProfile({ overlay_quote_enabled: val });
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update quote preference');
    }
  }

  async function handleToggleGif(val: boolean) {
    if (val && !gifUrl) {
      handlePickGif();
      return;
    }
    setGifEnabled(val);
    try {
      await userApi.updateProfile({ overlay_gif_enabled: val });
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update GIF preference');
    }
  }

  async function handlePickGif() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please grant photo library access to upload a custom GIF.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setUploadingGif(true);
        const uploadedUrl = await uploadImageToCloudinary(result.assets[0].uri);
        setGifUrl(uploadedUrl);
        setGifEnabled(true);
        await userApi.updateProfile({
          overlay_gif_url: uploadedUrl,
          overlay_gif_enabled: true,
        });
        fetchProfile();
        Alert.alert('Success', 'Custom overlay GIF updated successfully!');
      }
    } catch (error) {
      Alert.alert('Upload Error', error instanceof Error ? error.message : 'Failed to upload GIF');
    } finally {
      setUploadingGif(false);
    }
  }

  async function handlePickAvatar() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please grant photo library access to update your profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setAvatarUploading(true);
        const uploadedUrl = await uploadImageToCloudinary(result.assets[0].uri, 'image');
        await userApi.updateProfile({ avatar_url: uploadedUrl });
        await fetchProfile();
        Alert.alert('Success', 'Profile picture updated successfully!');
      }
    } catch (error) {
      Alert.alert('Upload Error', error instanceof Error ? error.message : 'Failed to update profile picture');
    } finally {
      setAvatarUploading(false);
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
        <Text style={[styles.sectionTitle, { color: theme.accent, fontWeight: isDark ? '700' : '800' }]}>PROFILE</Text>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
          <View style={[styles.profileRow, { padding: 16, marginBottom: 0 }]}>
            <TouchableOpacity
              onPress={openEditModal}
              activeOpacity={0.8}
            >
              {(profile && (profile as any).avatar_url) || user?.avatar_url ? (
                <Image source={{ uri: (profile as any)?.avatar_url || user?.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
                  <Text style={styles.avatarText}>
                    {(profile?.name || user?.name || 'U')[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: theme.text }]}>
                {profile?.name || user?.name}
              </Text>
              <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
                {profile?.email || user?.email}
              </Text>
            </View>
          </View>

          <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

          <TouchableOpacity style={styles.cardItem} onPress={openEditModal} activeOpacity={0.7}>
            <Text style={[styles.menuText, { color: theme.text }]}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </TouchableOpacity>

          <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

          <TouchableOpacity style={styles.cardItem} onPress={() => setPasswordModalVisible(true)} activeOpacity={0.7}>
            <Text style={[styles.menuText, { color: theme.text }]}>Change Password</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Subscription Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.accent, fontWeight: isDark ? '700' : '800' }]}>
          SUBSCRIPTION & PLAN
        </Text>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
          <View style={[styles.cardItem, { justifyContent: 'space-between', alignItems: 'center' }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={[styles.menuText, { color: theme.text, fontSize: 16, fontWeight: '700' }]}>
                  {isPremium ? (isTrialActive ? 'Pro (Free Trial)' : 'Focussive Pro') : 'Free Tier'}
                </Text>
                {isPremium && (
                  <View style={[styles.proBadge, { backgroundColor: theme.accent }]}>
                    <Text style={styles.proBadgeText}>PRO</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.reminderSubtext, { color: theme.textSecondary }]}>
                {isPremium
                  ? isTrialActive
                    ? `${trialDaysRemaining} days remaining in trial`
                    : 'Unlimited groups, apps, sites & lifetime history'
                  : 'Max 2 groups, 3 apps/sites each, 3 weeks history'}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.upgradeBtn,
                { backgroundColor: isPremium ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)') : theme.accent },
              ]}
              onPress={() => openPaywall('settings')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.upgradeBtnText,
                  { color: isPremium ? theme.text : '#FFFFFF' },
                ]}
              >
                {isPremium ? 'Manage' : 'Upgrade'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.accent, fontWeight: isDark ? '700' : '800' }]}>PREFERENCES</Text>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
          <View style={styles.cardItem}>
            <Text style={[styles.menuText, { color: theme.text }]}>Time Format</Text>
            <TimeFormatToggle use24Hour={use24Hour} onToggle={toggleTimeFormat} theme={theme} />
          </View>

          <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

          <View style={[styles.cardItem, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
            <Text style={[styles.menuText, { color: theme.text }]}>Appearance</Text>
            <ThemeModeToggle
              preference={themeCtx.preference}
              onSelect={(p) => themeCtx.setPreference(p)}
              theme={theme}
            />
          </View>

          <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

          {/* Session Reminder */}
          <TouchableOpacity
            style={styles.cardItem}
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

          <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

          {/* Monthly Skip Limit */}
          <TouchableOpacity
            style={styles.cardItem}
            onPress={() => {
              setSkipLimitInputValue(String(skipLimit));
              setSkipLimitModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <View>
              <Text style={[styles.menuText, { color: theme.text }]}>Monthly Skip Limit</Text>
              <Text style={[styles.reminderSubtext, { color: theme.textSecondary }]}>
                {skipsRemaining} of {skipLimit} skips remaining this month
              </Text>
            </View>
            <Ionicons name="play-forward-outline" size={20} color={theme.textSecondary} />
          </TouchableOpacity>

          <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

          {/* Block Screen Quotes */}
          <View style={styles.cardItem}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.menuText, { color: theme.text }]}>Block screen quotes</Text>
              <Text style={[styles.reminderSubtext, { color: theme.textSecondary, marginTop: 2 }]}>
                Show inspirational quotes on blocker overlay
              </Text>
            </View>
            <Switch
              value={quoteEnabled}
              onValueChange={handleToggleQuote}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

          {/* Block Screen GIF */}
          <View style={[styles.cardItem, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.menuText, { color: theme.text }]}>Block screen gif</Text>
                <Text style={[styles.reminderSubtext, { color: theme.textSecondary, marginTop: 2 }]}>
                  Show animated GIF on blocker overlay
                </Text>
              </View>
              <Switch
                value={gifEnabled}
                onValueChange={handleToggleGif}
                trackColor={{ false: theme.border, true: theme.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
              {gifUrl ? (
                <Image
                  source={{ uri: gifUrl }}
                  style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: theme.card }}
                />
              ) : null}
              <TouchableOpacity
                style={[styles.uploadGifBtn, { backgroundColor: `${theme.accent}20` }]}
                onPress={handlePickGif}
                disabled={uploadingGif}
              >
                {uploadingGif ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="cloud-upload-outline" size={16} color={theme.accent} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>
                      {gifUrl ? 'Change GIF' : 'Upload GIF'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* System */}
      <View style={styles.section} ref={permissionsRef}>
        <Text style={[styles.sectionTitle, { color: theme.accent, fontWeight: isDark ? '700' : '800' }]}>SYSTEM</Text>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
          {/* App Permissions Accordion */}
          <TouchableOpacity
            style={styles.cardItem}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleRefreshPermissions();
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ padding: 4 }}
                activeOpacity={0.6}
              >
                <Animated.View
                  style={{
                    transform: [{
                      rotate: refreshAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg'],
                      }),
                    }],
                  }}
                >
                  <Ionicons name="refresh-outline" size={20} color={theme.accent} />
                </Animated.View>
              </TouchableOpacity>

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
            </View>
          </TouchableOpacity>

          {/* Accordion body */}
          {permAccordionOpen && (
            <View
              style={[
                styles.accordionBody,
                { backgroundColor: theme.background, borderColor: theme.border, marginHorizontal: 14, marginBottom: 14 },
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
                onPress={async () => {
                  try {
                    const current = await Notifications.getPermissionsAsync();
                    if (!current.granted && current.canAskAgain) {
                      const req = await Notifications.requestPermissionsAsync();
                      if (req.granted) {
                        checkPermissionStatuses();
                        return;
                      }
                    }
                  } catch {}
                  requestNotificationPermission();
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

          <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

          <TouchableOpacity style={styles.cardItem} onPress={() => setShowExtensionModal(true)} activeOpacity={0.7}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.menuText, { color: theme.text }]}>Extension</Text>
              {extensionPaired ? (
                extensionConnected ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.accent} />
                    <Text style={{ fontSize: 12, color: theme.accent, fontWeight: '500' }}>Connected</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="ellipse" size={8} color="#F59E0B" />
                    <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '500' }}>Offline</Text>
                  </View>
                )
              ) : (
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>Not Connected</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </TouchableOpacity>

          <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

          {/* Version */}
          <View style={[styles.cardItem, { flexDirection: 'column', alignItems: 'stretch', gap: 4 }]}>
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
                      <Text style={{ fontSize: 13, color: theme.danger, fontWeight: '600' }}>Server offline</Text>
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
      </View>

      {/* Data */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.accent, fontWeight: isDark ? '700' : '800' }]}>DATA</Text>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
          <TouchableOpacity style={styles.cardItem} onPress={() => router.push('/history/manage' as never)} activeOpacity={0.7}>
            <Text style={[styles.menuText, { color: theme.text }]}>Manage History</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
          <TouchableOpacity style={styles.cardItem} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={[styles.logoutText, { color: theme.danger }]}>Log Out</Text>
            <Ionicons name="log-out-outline" size={18} color={theme.danger} />
          </TouchableOpacity>

          <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

          <View style={{ padding: 12 }}>
            <TouchableOpacity style={[styles.deleteAccountBtn, { backgroundColor: theme.danger }]} onPress={handleDeleteAccount} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.deleteAccountText}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Text style={[styles.version, { color: theme.textSecondary }]}>Focussive v1.0.0</Text>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Profile</Text>

            {/* Avatar & Change Picture Button */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <TouchableOpacity
                onPress={handlePickAvatar}
                disabled={avatarUploading}
                activeOpacity={0.8}
                style={{ position: 'relative', marginBottom: 10 }}
              >
                {avatarUploading ? (
                  <View style={[styles.avatar, { width: 80, height: 80, borderRadius: 40, backgroundColor: `${theme.accent}30`, justifyContent: 'center', alignItems: 'center' }]}>
                    <ActivityIndicator size="small" color={theme.accent} />
                  </View>
                ) : (profile && (profile as any).avatar_url) || user?.avatar_url ? (
                  <Image source={{ uri: (profile as any)?.avatar_url || user?.avatar_url }} style={[styles.avatar, { width: 80, height: 80, borderRadius: 40 }]} />
                ) : (
                  <View style={[styles.avatar, { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={[styles.avatarText, { fontSize: 32 }]}>
                      {(profile?.name || user?.name || 'U')[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: theme.accent,
                    borderWidth: 2,
                    borderColor: theme.card,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Ionicons name="camera" size={13} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePickAvatar}
                disabled={avatarUploading}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                {avatarUploading ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={16} color={theme.accent} />
                    <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '600' }}>
                      Change Profile Picture
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

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

            {/* My Driving Forces */}
            <TouchableOpacity
              style={styles.drivingForcesBtn}
              onPress={() => {
                setEditModalVisible(false);
                router.push({ pathname: '/driving-forces', params: { from: 'settings' } } as never);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.drivingForcesBtnText, { color: theme.textSecondary }]}>
                My Driving Forces
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
            </TouchableOpacity>

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

      {/* Monthly Skip Limit Modal */}
      <Modal visible={skipLimitModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Monthly Skip Limit</Text>
            <Text style={[styles.reminderModalDesc, { color: theme.textSecondary }]}>
              Set how many focus sessions you can skip each calendar month (between 0 and 100). Default is 5.
            </Text>

            {/* Custom input */}
            <View style={styles.reminderCustomRow}>
              <TextInput
                style={[styles.reminderInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
                placeholder="0 - 100"
                placeholderTextColor={theme.textSecondary}
                value={skipLimitInputValue}
                onChangeText={handleSkipLimitChange}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>skips / mo</Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.surface }]}
                onPress={() => setSkipLimitModalVisible(false)}
              >
                <Text style={{ color: theme.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent }]}
                onPress={saveSkipLimit}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Extension Management Popup Modal */}
      <ExtensionModal
        visible={showExtensionModal}
        onClose={() => setShowExtensionModal(false)}
        onStatusChange={(paired, connected) => {
          setExtensionPaired(paired);
          setExtensionConnected(connected);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 12, letterSpacing: 2, marginBottom: 12 },
  sectionDivider: { height: StyleSheet.hairlineWidth, marginBottom: 28 },
  sectionCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  uploadGifBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
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
  input: {
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '300',
    marginBottom: 12,
    borderWidth: 2.5,
  },
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
    width: 80,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    borderWidth: 2.5,
  },
  proBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  proBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  upgradeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upgradeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Driving Forces row button in Edit Profile modal
  drivingForcesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  drivingForcesBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});


