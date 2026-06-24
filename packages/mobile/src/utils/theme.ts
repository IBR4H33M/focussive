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
  background: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceAlt: '#FAFAFA',
  text: '#000000',
  textSecondary: '#666666',
  accent: '#90EE90',
  accentDark: '#2D5016',
  border: '#E0E0E0',
  danger: '#DC3545',
  dangerBg: 'rgba(220, 53, 69, 0.1)',
  white: '#FFFFFF',
  card: '#FFFFFF',
};

export const darkTheme: ThemeColors = {
  background: '#1a1a1a',
  surface: '#252525',
  surfaceAlt: '#2a2a2a',
  text: '#E0E0E0',
  textSecondary: '#999999',
  accent: '#90EE90',
  accentDark: '#2D5016',
  border: '#333333',
  danger: '#DC3545',
  dangerBg: 'rgba(220, 53, 69, 0.15)',
  white: '#FFFFFF',
  card: '#252525',
};

export function useTheme(): ThemeColors {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}

export function useIsDark(): boolean {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark';
}
