// ============================================================
// Focussive Mobile — Root Layout
// ============================================================

import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SessionProvider } from '@/context/SessionContext';
import { ThemeProvider } from '@/utils/ThemeProvider';
import { useTheme, useIsDark } from '@/utils/theme';
import {
  hasRequiredPermissions,
  requestUsageStatsPermission,
  requestOverlayPermission,
  hasExactAlarmPermission,
  requestExactAlarmPermission,
} from '@focussive/app-blocker';
import { setupNotificationHandler } from '@/utils/sessionReminders';
import PermissionModal from '@/components/PermissionModal';

// Configure foreground notification display once at module load
setupNotificationHandler();

function RootLayoutContent() {
  const theme = useTheme();
  const isDark = useIsDark();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [showPermissionModal, setShowPermissionModal] = useState(false);

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
          const [hasRequired, hasExactAlarm, notifStatus] = await Promise.all([
            hasRequiredPermissions(),
            Platform.OS === 'android' ? hasExactAlarmPermission() : Promise.resolve(true),
            Notifications.getPermissionsAsync(),
          ]);

          const notifGranted = notifStatus.granted;
          const allGranted = hasRequired && hasExactAlarm && notifGranted;

          if (!allGranted) {
            setShowPermissionModal(true);
          }
        } catch {
          // Not on Android or module unavailable — skip silently
        }
      })();
    }, [isLoading, isAuthenticated])
  );

  const handleGrantPermissions = async () => {
    try {
      await Promise.all([
        requestUsageStatsPermission(),
        requestOverlayPermission(),
        Platform.OS === 'android' ? requestExactAlarmPermission() : Promise.resolve(),
        Notifications.requestPermissionsAsync(),
      ]);
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
        onDismiss={() => setShowPermissionModal(false)}
        onGrantPermissions={handleGrantPermissions}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
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
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SessionProvider>
          <RootLayoutContent />
        </SessionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

