// ============================================================
// Focussive Mobile — Root Layout
// ============================================================

import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SessionProvider } from '@/context/SessionContext';
import { useTheme, useIsDark } from '@/utils/theme';

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
    <AuthProvider>
      <SessionProvider>
        <RootLayoutContent />
      </SessionProvider>
    </AuthProvider>
  );
}

