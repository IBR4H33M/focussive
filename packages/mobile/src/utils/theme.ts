// ============================================================
// Focussive Mobile — Theme System
// ============================================================

import { useColorScheme } from 'react-native';

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

export function useTheme(): ThemeColors {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}

export function useIsDark(): boolean {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark';
}
