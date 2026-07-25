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
const ISLAND_SIDE_MARGIN = 32;

export default function TabLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const ISLAND_BOTTOM_MARGIN = Math.max(insets.bottom, 12) + 6;

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
          position: 'absolute',
          left: 0,
          right: 0,
          marginHorizontal: 20,
          bottom: ISLAND_BOTTOM_MARGIN,
          backgroundColor: theme.island,
          borderTopWidth: 0,
          borderRadius: ISLAND_HEIGHT / 2,
          height: ISLAND_HEIGHT,
          paddingTop: 6,
          paddingBottom: 4,
          paddingHorizontal: 16,
          elevation: 0,
          shadowOpacity: 0,
          borderWidth: 0,
        },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.55)',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Sessions',
          headerTitle: 'Focussive',
          tabBarIcon: ({ color }) => (
            <Ionicons name="disc-outline" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="app-groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color }) => (
            <Ionicons name="grid-outline" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color }) => (
            <Ionicons name="analytics-outline" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Ionicons name="options-outline" size={20} color={color} />
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

