// ============================================================
// Focussive Mobile — Root Layout
// ============================================================

import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments, useFocusEffect, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Platform, TouchableOpacity, LogBox } from 'react-native';
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
  isIgnoringBatteryOptimization,
  requestIgnoreBatteryOptimization,
} from '@focussive/app-blocker';
import { setupNotificationHandler } from '@/utils/sessionReminders';
import PermissionModal, { MissingPermissions } from '@/components/PermissionModal';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@/utils/cache';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { useSessions } from '@/context/SessionContext';
import PaywallModal from '@/components/PaywallModal';
import { LoadingScreen } from '@/components/LoadingScreen';
import ThemedAlert, { installThemedAlert } from '@/components/ThemedAlert';
import SessionCompleteCard from '@/components/SessionCompleteCard';
import Constants from 'expo-constants';

const clerkPublishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.clerkPublishableKey ||
  'pk_live_Y2xlcmsuZm9jdXNzaXZlLnNvbGFzZS5zdHVkaW8k';

// Ignore known upstream expo-router Android linking initialization warning (expo/expo #35224)
LogBox.ignoreLogs([
  "Can't perform a React state update on a component that hasn't mounted yet",
]);

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
  const rootNavigationState = useRootNavigationState();
  const { completedSessionTierData, dismissCompletedTierCard } = useSessions();
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [missingPermissions, setMissingPermissions] = useState<MissingPermissions>({
    usageAccess: false,
    overlay: false,
    exactAlarm: false,
    notifications: false,
    batteryOptimization: false,
  });

  useEffect(() => {
    const openSessionFromNotification = (response: Notifications.NotificationResponse) => {
      const sessionId = response.notification.request.content.data?.sessionId;
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        setTimeout(() => {
          router.push(`/session/${sessionId}` as never);
        }, 100);
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
    if (isLoading || !rootNavigationState?.key) return; // wait until auth state is known and root navigation has mounted

    const inAuthGroup = segments[0] === '(auth)';
    const isExtensionScreen = (segments as string[]).includes('extension-qr');

    if (isAuthenticated && inAuthGroup && !isExtensionScreen) {
      // User just logged in — send them to the main app
      const timer = setTimeout(() => {
        router.replace('/(tabs)' as never);
      }, 0);
      return () => clearTimeout(timer);
    } else if (!isAuthenticated && !inAuthGroup) {
      // User logged out — send them to login
      const timer = setTimeout(() => {
        router.replace('/(auth)/login' as never);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isLoading, segments, rootNavigationState?.key]);

  // Check all app permissions once the user is authenticated
  useFocusEffect(
    React.useCallback(() => {
      if (isLoading || !isAuthenticated) return;
      // Do not interrupt onboarding screens with the global permission modal
      const inAuth = segments[0] === '(auth)';
      const isDrivingForces = (segments as string[]).includes('driving-forces');
      if (inAuth || isDrivingForces) return;

      (async () => {
        try {
          const [usage, overlay, exactAlarm, notifStatus, batteryIgnoring] = await Promise.all([
            hasUsageStatsPermission(),
            hasOverlayPermission(),
            Platform.OS === 'android' ? hasExactAlarmPermission() : Promise.resolve(true),
            Notifications.getPermissionsAsync(),
            Platform.OS === 'android' ? isIgnoringBatteryOptimization() : Promise.resolve(true),
          ]);

          const notifGranted = notifStatus.granted;
          const missingUsage = !usage;
          const missingOverlay = !overlay;
          const missingAlarm = Platform.OS === 'android' && !exactAlarm;
          const missingNotif = !notifGranted;
          const missingBattery = Platform.OS === 'android' && !batteryIgnoring;

          const anyMissing = missingUsage || missingOverlay || missingAlarm || missingNotif || missingBattery;

          if (anyMissing) {
            setMissingPermissions({
              usageAccess: missingUsage,
              overlay: missingOverlay,
              exactAlarm: missingAlarm,
              notifications: missingNotif,
              batteryOptimization: missingBattery,
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
      if (missingPermissions.batteryOptimization && Platform.OS === 'android') await requestIgnoreBatteryOptimization();
    } catch {
      // Ignore errors
    }
  };

  // Show the custom animated Focussive logo while checking auth state on startup
  if (isLoading) {
    return <LoadingScreen backgroundColor={theme.background} />;
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
            headerShown: false,
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
          name="driving-forces"
          options={{
            headerShown: false,
            animation: 'slide_from_bottom',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="pro-benefits"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
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


