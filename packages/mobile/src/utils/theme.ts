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
  island: string;
}

// Light mode. Palette: Fern green #587042, Sage #A9B494, Cosmic latte #FAF7E6,
// Jasmine #F8DE8C, Saffron #F6C531.
//
// Sage and Jasmine are too light to carry text on the Cosmic latte background
// (~1.9:1 and ~1.3:1), so they are used only as fills/borders. Text tones are
// darkened variants of Fern green, which keeps the palette's hue family while
// clearing the 4.5:1 WCAG AA threshold for body text.
export const lightTheme: ThemeColors = {
  background: '#FAF7E6',
  surface: '#EDEBD8',
  surfaceAlt: '#E3E4D0',
  text: '#2E3B22',
  textSecondary: '#5A6B48',
  accent: '#587042',
  accentDark: '#3D5730',
  border: '#C9D0B6',
  danger: '#DC2626',
  dangerBg: 'rgba(220, 38, 38, 0.12)',
  white: '#FFFFFF',
  card: '#FFFFFF',
  island: '#425432',
};

// Dark mode. Palette: Space cadet #2F3456, Paynes gray #5D6E75,
// Cambridge blue #8BA794, Ash gray #BAC6B8, Alabaster #E9E4DC.
//
// Surfaces stay in the Space cadet family so the light palette tones
// (Cambridge blue, Ash gray, Alabaster) all read as text above 4.5:1.
// Paynes gray is reserved for borders — as a fill it left secondary text
// at only ~2.1:1.
export const darkTheme: ThemeColors = {
  background: '#2F3456',
  surface: '#3A4062',
  surfaceAlt: '#454B6E',
  text: '#E9E4DC',
  textSecondary: '#BAC6B8',
  accent: '#8BA794',
  accentDark: '#5D6E75',
  border: '#5D6E75',
  danger: '#EF4444',
  dangerBg: 'rgba(239, 68, 68, 0.18)',
  white: '#FFFFFF',
  card: '#5d6e75',
  island: '#6C8273',
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
