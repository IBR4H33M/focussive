// ============================================================
// Focussive Mobile — Theme System (no JSX — safe as .ts)
// ============================================================

import { createContext, useContext } from 'react';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentDark: string;
  border: string;
  danger: string;
  dangerBg: string;
  white: string;
  card: string;
}

export const lightTheme: ThemeColors = {
  background: '#F2F2F7',
  surface: '#E8E8ED',
  surfaceAlt: '#EFEFEF',
  text: '#111111',
  textSecondary: '#6B6B6B',
  accent: '#2E8B4A',
  accentDark: '#1A5C30',
  border: '#D8D8DC',
  danger: '#D93025',
  dangerBg: 'rgba(217, 48, 37, 0.1)',
  white: '#FFFFFF',
  card: '#FFFFFF',
};

export const darkTheme: ThemeColors = {
  background: '#121212',
  surface: '#1E1E1E',
  surfaceAlt: '#1A1A1A',
  text: '#E0E0E0',
  textSecondary: '#999999',
  accent: '#4CAF72',
  accentDark: '#2D6A40',
  border: '#2A2A2A',
  danger: '#E05260',
  dangerBg: 'rgba(224, 82, 96, 0.15)',
  white: '#FFFFFF',
  card: '#1E1E1E',
};

// 'system' | 'dark' | 'light'
export type ThemePreference = 'system' | 'dark' | 'light';
export const THEME_STORAGE_KEY = 'theme_preference';

export interface ThemeContextValue {
  theme: ThemeColors;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => Promise<void>;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  isDark: true,
  preference: 'system',
  setPreference: async () => {},
});

export function useTheme(): ThemeColors {
  return useContext(ThemeContext).theme;
}

export function useThemeContext(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function useIsDark(): boolean {
  return useContext(ThemeContext).isDark;
}
