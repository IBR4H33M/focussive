// ============================================================
// Focussive Mobile — Root Layout
// ============================================================

import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Alert } from 'react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SessionProvider } from '@/context/SessionContext';
import { ThemeProvider } from '@/utils/ThemeProvider';
import { useTheme, useIsDark } from '@/utils/theme';
import {
  hasRequiredPermissions,
  requestUsageStatsPermission,
  requestOverlayPermission,
} from '@focussive/app-blocker';
import { setupNotificationHandler } from '@/utils/sessionReminders';

// Configure foreground notification display once at module load
setupNotificationHandler();

function RootLayoutContent() {
  const theme = useTheme();
  const isDark = useIsDark();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

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

  // Check app permissions once the user is authenticated
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    (async () => {
      try {
        const granted = await hasRequiredPermissions();
        if (!granted) {
          Alert.alert(
            'Permissions Required',
            'Focussive needs Usage Access and Display Over Other Apps permissions to block distracting apps during focus sessions.',
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Grant Usage Access',
                onPress: () => requestUsageStatsPermission(),
              },
              {
                text: 'Grant Overlay',
                onPress: () => requestOverlayPermission(),
              },
            ]
          );
        }
      } catch {
        // Not on Android or module unavailable — skip silently
      }
    })();
  }, [isAuthenticated, isLoading]);

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
            title: 'New Session',
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="session/[id]"
          options={{
            headerShown: true,
            title: 'Session Details',
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="history/manage"
          options={{
            headerShown: true,
            title: 'Manage History',
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
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

