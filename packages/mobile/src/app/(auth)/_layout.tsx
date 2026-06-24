// ============================================================
// Focussive Mobile — Auth Layout
// ============================================================

import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/utils/theme';

export default function AuthLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen
        name="extension-qr"
        options={{
          headerShown: true,
          title: 'Connect Extension',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
        }}
      />
    </Stack>
  );
}
