// ============================================================
// Focussive Mobile — ThemeProvider (.tsx for JSX support)
// ============================================================

import React, { useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ThemeContext,
  darkTheme,
  lightTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((val) => {
      if (val === 'dark' || val === 'light' || val === 'system') {
        setPreferenceState(val);
      }
    });
  }, []);

  const isDark =
    preference === 'system' ? systemScheme === 'dark' : preference === 'dark';

  const theme = isDark ? darkTheme : lightTheme;

  async function setPreference(pref: ThemePreference) {
    setPreferenceState(pref);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
