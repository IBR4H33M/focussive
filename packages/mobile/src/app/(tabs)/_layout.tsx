// ============================================================
// Focussive Mobile — Tab Layout
// ============================================================

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/utils/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Floating pill ("island") tab bar dimensions
const ISLAND_HEIGHT = 62;
const ISLAND_SIDE_MARGIN = 22;

export default function TabLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const ISLAND_BOTTOM_MARGIN = Math.max(insets.bottom, 12) + 8;

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.background,
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTintColor: theme.text,
        headerTitleStyle: {
          fontWeight: '300',
          fontSize: 20,
          letterSpacing: 1,
        },
        tabBarStyle: {
          backgroundColor: theme.island,
          borderTopWidth: 0,
          borderRadius: ISLAND_HEIGHT / 2,
          height: ISLAND_HEIGHT,
          marginHorizontal: ISLAND_SIDE_MARGIN,
          marginBottom: ISLAND_BOTTOM_MARGIN,
          paddingTop: 6,
          paddingBottom: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.2,
          shadowRadius: 14,
          elevation: 12,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '400',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Sessions',
          headerTitle: 'Focussive',
          tabBarIcon: ({ color }) => (
            <Ionicons name="locate-outline" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="app-groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color }) => (
            <Ionicons name="layers-outline" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color }) => (
            <Ionicons name="bar-chart-outline" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Ionicons name="settings-outline" size={20} color={color} />
          ),
        }}
      />
      {/* Hidden screens — not shown in tab bar */}
      <Tabs.Screen
        name="history"
        options={{ href: null }}
      />
    </Tabs>
  );
}

