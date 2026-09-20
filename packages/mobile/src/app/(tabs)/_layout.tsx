// ============================================================
// Focussive Mobile — Tab Layout
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Rectangular with rounded corners ("island") tab bar dimensions
const ISLAND_HEIGHT = 62;
const ISLAND_RADIUS = 16;

function CustomTabBar({ state, descriptors, navigation }: any) {
  const theme = useTheme();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const bottomMargin = Math.max(insets.bottom, 12) + 6;

  // Filter out routes that are hidden (e.g. href: null)
  const visibleRoutes = state.routes.filter((route: any) => {
    const { options } = descriptors[route.key];
    return (options as any).href !== null;
  });

  return (
    <View
      style={[
        styles.islandContainer,
        {
          bottom: bottomMargin,
          backgroundColor: theme.island,
        },
      ]}
    >
      {visibleRoutes.map((route: any) => {
        const { options } = descriptors[route.key];
        const isFocused = state.routes[state.index].key === route.key;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const label =
          options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
            ? options.title
            : route.name;

        // Active vs inactive colors
        const activeColor = isDark ? '#2F3456' : '#FFFFFF';
        const inactiveColor = isDark ? 'rgba(47, 52, 86, 0.60)' : 'rgba(255, 255, 255, 0.60)';
        const color = isFocused ? activeColor : inactiveColor;

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            activeOpacity={0.8}
            style={styles.tabItem}
          >
            {/* Active highlight container: smaller rectangle with rounded corners covering full vertical length */}
            {isFocused && (
              <View
                style={[
                  styles.activeIndicator,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.22)'
                      : 'rgba(255, 255, 255, 0.25)',
                  },
                ]}
              />
            )}

            <View style={styles.tabContent}>
              {options.tabBarIcon &&
                options.tabBarIcon({
                  focused: isFocused,
                  color,
                  size: 20,
                })}
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color,
                    fontWeight: isFocused ? '700' : '500',
                  },
                ]}
                numberOfLines={1}
              >
                {typeof label === 'string' ? label : ''}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
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
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <Ionicons name="speedometer-outline" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="app-groups"
        options={{
          title: 'Configuration',
          tabBarIcon: ({ color }) => (
            <Ionicons name="options-outline" size={20} color={color} />
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

const styles = StyleSheet.create({
  islandContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: ISLAND_HEIGHT,
    borderRadius: ISLAND_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabItem: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 3,
    right: 3,
    borderRadius: 12,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
  },
});
