// ============================================================
// Focussive Mobile — Root Layout
// ============================================================

import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SessionProvider } from '@/context/SessionContext';
import { ThemeProvider } from '@/utils/ThemeProvider';
import { useTheme, useIsDark } from '@/utils/theme';
import {
  hasUsageStatsPermission,
  hasOverlayPermission,
  requestUsageStatsPermission,
  requestOverlayPermission,
  hasExactAlarmPermission,
  requestExactAlarmPermission,
  requestNotificationPermission,
} from '@focussive/app-blocker';
import { setupNotificationHandler } from '@/utils/sessionReminders';
import PermissionModal, { MissingPermissions } from '@/components/PermissionModal';
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@/utils/cache';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { useSessions } from '@/context/SessionContext';
import PaywallModal from '@/components/PaywallModal';
import ThemedAlert, { installThemedAlert } from '@/components/ThemedAlert';
import SessionCompleteCard from '@/components/SessionCompleteCard';
import Constants from 'expo-constants';

const clerkPublishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.clerkPublishableKey ||
  'pk_test_Zml0LXN0dXJnZW9uLTQwNC5jbGVyay5hY2NvdW50cy5kZXYk';

// Configure foreground notification display once at module load
setupNotificationHandler();
// Intercept all alerts across the app to use custom app theme
installThemedAlert();

function RootLayoutContent() {
  const theme = useTheme();
  const isDark = useIsDark();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { completedSessionTierData, dismissCompletedTierCard } = useSessions();
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [missingPermissions, setMissingPermissions] = useState<MissingPermissions>({
    usageAccess: false,
    overlay: false,
    exactAlarm: false,
    notifications: false,
  });

  useEffect(() => {
    const openSessionFromNotification = (response: Notifications.NotificationResponse) => {
      const sessionId = response.notification.request.content.data?.sessionId;
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        router.push(`/session/${sessionId}` as never);
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(openSessionFromNotification);

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          openSessionFromNotification(response);
        }
      })
      .catch(() => {});

    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (isLoading) return; // wait until auth state is known

    const inAuthGroup = segments[0] === '(auth)';

    if (isAuthenticated && inAuthGroup) {
      // User just logged in — send them to the main app
      router.replace('/(tabs)' as never);
    } else if (!isAuthenticated && !inAuthGroup) {
      // User logged out — send them to login
      router.replace('/(auth)/login' as never);
    }
  }, [isAuthenticated, isLoading, segments]);

  // Check all app permissions once the user is authenticated
  useFocusEffect(
    React.useCallback(() => {
      if (isLoading || !isAuthenticated) return;
      (async () => {
        try {
          const [usage, overlay, exactAlarm, notifStatus] = await Promise.all([
            hasUsageStatsPermission(),
            hasOverlayPermission(),
            Platform.OS === 'android' ? hasExactAlarmPermission() : Promise.resolve(true),
            Notifications.getPermissionsAsync(),
          ]);

          const notifGranted = notifStatus.granted;
          const missingUsage = !usage;
          const missingOverlay = !overlay;
          const missingAlarm = Platform.OS === 'android' && !exactAlarm;
          const missingNotif = !notifGranted;

          const anyMissing = missingUsage || missingOverlay || missingAlarm || missingNotif;

          if (anyMissing) {
            setMissingPermissions({
              usageAccess: missingUsage,
              overlay: missingOverlay,
              exactAlarm: missingAlarm,
              notifications: missingNotif,
            });
            setShowPermissionModal(true);
          } else {
            setShowPermissionModal(false);
          }
        } catch {
          // Not on Android or module unavailable — skip silently
        }
      })();
    }, [isLoading, isAuthenticated])
  );

  const handleGrantPermissions = async () => {
    try {
      if (missingPermissions.usageAccess) await requestUsageStatsPermission();
      if (missingPermissions.overlay) await requestOverlayPermission();
      if (missingPermissions.exactAlarm && Platform.OS === 'android') await requestExactAlarmPermission();
      if (missingPermissions.notifications) await requestNotificationPermission();
    } catch {
      // Ignore errors
    }
  };

  // Show a spinner while checking auth state on startup
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <PermissionModal
        visible={showPermissionModal}
        missingPermissions={missingPermissions}
        onDismiss={() => setShowPermissionModal(false)}
        onGrantPermissions={handleGrantPermissions}
      />
      <PaywallModal />
      <ThemedAlert />
      <SessionCompleteCard
        visible={!!completedSessionTierData}
        tier={completedSessionTierData?.tier ?? null}
        sessionName={completedSessionTierData?.sessionName ?? ''}
        durationMinutes={completedSessionTierData?.durationMinutes ?? 0}
        violationsBlocked={completedSessionTierData?.violationsBlocked ?? 0}
        onDismiss={dismissCompletedTierCard}
        onViewBadges={() => router.push('/(tabs)/stats' as never)}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
          headerLeft: ({ canGoBack }) =>
            canGoBack ? (
              <TouchableOpacity
                onPress={() => router.back()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ padding: 4 }}
              >
                <Ionicons name="chevron-back" size={24} color={theme.text} />
              </TouchableOpacity>
            ) : null,
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="session/create"
          options={{
            headerShown: true,
            title: '',
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            headerShadowVisible: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="session/[id]"
          options={{
            headerShown: true,
            title: '',
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="history/manage"
          options={{
            headerShown: true,
            title: '',
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="session/all"
          options={{
            headerShown: true,
            title: '',
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            headerShadowVisible: false,
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
        <AuthProvider>
          <SubscriptionProvider>
            <SessionProvider>
              <RootLayoutContent />
            </SessionProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </ClerkProvider>
    </ThemeProvider>
  );
}


