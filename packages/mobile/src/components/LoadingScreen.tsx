import React from 'react';
import { StyleSheet, View, Text, ViewStyle } from 'react-native';
import { LoadingSpinner, SpinnerVariant } from './LoadingSpinner';

interface LoadingScreenProps {
  /** Optional message shown below the spinner */
  message?: string;
  /** Background color — defaults to app dark background */
  backgroundColor?: string;
  /** Spinner size */
  size?: number;
  /** Animation variant */
  variant?: SpinnerVariant;
  speedMs?: number;
  style?: ViewStyle;
  /** Optional children rendered on top (e.g. dev exit button) */
  children?: React.ReactNode;
}

export function LoadingScreen({
  message,
  backgroundColor = '#0F0F10',
  size = 80,
  variant = 'assembly',
  speedMs,
  style,
  children,
}: LoadingScreenProps) {
  return (
    <View style={[styles.container, { backgroundColor }, style]}>
      <LoadingSpinner size={size} variant={variant} speedMs={speedMs} />
      {message ? (
        <Text style={styles.message}>{message}</Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  message: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    fontFamily: 'System',
    letterSpacing: 0.5,
  },
});
