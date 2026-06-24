// ============================================================
// Focussive Mobile — Extension QR Screen
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/utils/theme';
import { authApi } from '@/utils/api';

export default function ExtensionQRScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState(0);
  const [loading, setLoading] = useState(true);

  const generateQR = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authApi.qrGenerate();
      setQrCode(response.code);
      setExpiresIn(response.expires_in_seconds);
    } catch {
      setQrCode(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    generateQR();
  }, [generateQR]);

  // Countdown timer
  useEffect(() => {
    if (expiresIn <= 0) return;
    const interval = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresIn]);

  const minutes = Math.floor(expiresIn / 60);
  const seconds = expiresIn % 60;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Connect Extension</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Scan this code with the Focussive Chrome extension to link your devices
      </Text>

      <View style={[styles.qrContainer, { borderColor: theme.border }]}>
        {loading ? (
          <ActivityIndicator size="large" color={theme.accent} />
        ) : qrCode ? (
          <View style={styles.qrContent}>
            {/* QR Code display — using text representation for now */}
            <View style={[styles.qrPlaceholder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.qrText, { color: theme.text }]} selectable>
                {qrCode}
              </Text>
              <Text style={[styles.qrLabel, { color: theme.textSecondary }]}>
                Connection Code
              </Text>
            </View>

            {expiresIn > 0 ? (
              <Text style={[styles.timer, { color: theme.textSecondary }]}>
                Expires in {minutes}:{seconds.toString().padStart(2, '0')}
              </Text>
            ) : (
              <TouchableOpacity
                style={[styles.refreshBtn, { borderColor: theme.accent }]}
                onPress={generateQR}
              >
                <Text style={[styles.refreshText, { color: theme.accent }]}>
                  Generate New Code
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={[styles.errorText, { color: theme.danger }]}>
            Failed to generate QR code
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.skipBtn, { borderColor: theme.border }]}
        onPress={() => router.replace('/(tabs)' as never)}
      >
        <Text style={[styles.skipText, { color: theme.textSecondary }]}>
          Skip for now
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '300',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '300',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 20,
  },
  qrContainer: {
    width: '100%',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 200,
    justifyContent: 'center',
  },
  qrContent: {
    alignItems: 'center',
    width: '100%',
  },
  qrPlaceholder: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    width: '100%',
  },
  qrText: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
    letterSpacing: 1,
  },
  qrLabel: {
    fontSize: 12,
    marginTop: 8,
  },
  timer: {
    fontSize: 14,
    marginTop: 16,
  },
  refreshBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
  },
  refreshText: {
    fontSize: 14,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 14,
  },
  skipBtn: {
    marginTop: 32,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
  },
  skipText: {
    fontSize: 14,
  },
});

