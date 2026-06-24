// ============================================================
// Focussive Mobile — Violation Overlay Component
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';

interface ViolationOverlayProps {
  visible: boolean;
  appName?: string;
  websiteName?: string;
  onAllowAnyway: () => void;
  onMarkNecessary: () => void;
  onDismiss: () => void;
}

export default function ViolationOverlay({
  visible,
  appName,
  websiteName,
  onAllowAnyway,
  onMarkNecessary,
  onDismiss,
}: ViolationOverlayProps) {
  const name = appName || websiteName || 'this app';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.triangle}>▲</Text>

          <Text style={styles.title}>Distraction Detected</Text>
          <Text style={styles.subtitle}>
            You&apos;re using {name} during a focus session
          </Text>

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.allowBtn} onPress={onAllowAnyway}>
              <Text style={styles.allowText}>Allow anyway 🫥</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.necessaryBtn} onPress={onMarkNecessary}>
              <Text style={styles.necessaryText}>Mark as necessary</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(220, 53, 69, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 32,
  },
  triangle: {
    fontSize: 80,
    color: '#FFFFFF',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '300',
    color: '#FFFFFF',
    marginBottom: 40,
    textAlign: 'center',
    opacity: 0.9,
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  allowBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
  },
  allowText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  necessaryBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  necessaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '400',
  },
});
