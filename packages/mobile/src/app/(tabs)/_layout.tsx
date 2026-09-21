// ============================================================
// Focussive Mobile — Tab Layout
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Custom Tab Icons
const TAB_ICONS = {
  dashboard: require('../../../assets/images/tabIcons/dashboard.png'),
  rules: require('../../../assets/images/tabIcons/rules.png'),
  stats: require('../../../assets/images/tabIcons/stats.png'),
  settings: require('../../../assets/images/tabIcons/settings.png'),
};

// Rectangular with rounded corners ("island") tab bar dimensions
const ISLAND_HEIGHT = 62;
const ISLAND_RADIUS = 16;

function CustomTabBar({ state, descriptors, navigation }: any) {
  const theme = useTheme();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const bottomMargin = Math.max(insets.bottom, 12) + 6;

  const TAB_ORDER = ['index', 'app-groups', 'stats', 'settings'];
  const visibleRoutes = TAB_ORDER
    .map((name) => state.routes.find((route: any) => route.name === name))
    .filter(Boolean) as any[];

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
      {visibleRoutes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const isFocused = state.routes[state.index].key === route.key;
        const isFirst = index === 0;
        const isLast = index === visibleRoutes.length - 1;

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
            {/* Active highlight container: covers full vertical height, flush to ends, with all corners rounded */}
            {isFocused && (
              <View
                style={[
                  styles.activeIndicator,
                  {
                    backgroundColor: isDark
                      ? 'rgba(0, 0, 0, 0.22)'
                      : 'rgba(0, 0, 0, 0.25)',
                    borderRadius: ISLAND_RADIUS,
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
            <Image
              source={TAB_ICONS.dashboard}
              style={{ width: 24, height: 24, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="app-groups"
        options={{
          title: 'Rules',
          tabBarIcon: ({ color }) => (
            <Image
              source={TAB_ICONS.rules}
              style={{ width: 24, height: 24, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color }) => (
            <Image
              source={TAB_ICONS.stats}
              style={{ width: 24, height: 24, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Image
              source={TAB_ICONS.settings}
              style={{ width: 24, height: 24, tintColor: color }}
              resizeMode="contain"
            />
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
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
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
    left: 0,
    right: 0,
    borderRadius: ISLAND_RADIUS,
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
