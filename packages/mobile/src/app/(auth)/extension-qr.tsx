// ============================================================
// Focussive Mobile — Extension Management Screen
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/utils/theme';
import { authApi, deviceApi } from '@/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Conditionally import QRCode (may not be installed yet — handled via try/catch)
let QRCode: any = null;
try {
  QRCode = require('react-native-qrcode-svg').default;
} catch {
  // Will fall back to text code display
}

interface ExtensionDevice {
  id: string;
  device_name: string;
  device_info: Record<string, string>;
  last_seen_at: string;
  created_at: string;
}

export default function ExtensionQRScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Connection state
  const [loading, setLoading] = useState(true);
  const [paired, setPaired] = useState(false);
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState<ExtensionDevice | null>(null);

  // QR code state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState(0);
  const [generating, setGenerating] = useState(false);

  // Mode: 'status' (initial check) | 'pair_qr' | 'pair_code'
  const [pairMode, setPairMode] = useState<'qr' | 'code'>('qr');

  // Unpairing
  const [unpairing, setUnpairing] = useState(false);

  // Check extension connection status
  const checkStatus = useCallback(async () => {
    try {
      const result = await deviceApi.extensionStatus();
      setPaired(result.paired);
      setConnected(result.connected);
      setDevice(result.device);
    } catch {
      setPaired(false);
      setConnected(false);
      setDevice(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    // Poll status every 10s to keep the connected indicator live
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  // Generate QR code for pairing
  const generateQR = useCallback(async () => {
    setGenerating(true);
    try {
      const response = await authApi.qrGenerate();
      setQrCode(response.code);
      setExpiresIn(response.expires_in_seconds);
    } catch {
      setQrCode(null);
    } finally {
      setGenerating(false);
    }
  }, []);

  // Countdown timer for QR code
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

  // Handle unpair
  async function handleUnpair() {
    if (!device) return;

    Alert.alert(
      'Unpair Extension',
      `Remove "${device.device_name}" from your account? You'll need to pair it again to use browser monitoring.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            setUnpairing(true);
            try {
              await deviceApi.unpair(device.id);
              setPaired(false);
              setConnected(false);
              setDevice(null);
            } catch {
              Alert.alert('Error', 'Failed to unpair extension. Please try again.');
            } finally {
              setUnpairing(false);
            }
          },
        },
      ]
    );
  }

  // Start pairing flow
  function startPairing() {
    setPairMode('qr');
    generateQR();
  }

  const minutes = Math.floor(expiresIn / 60);
  const seconds = expiresIn % 60;

  function formatLastSeen(lastSeen: string | null): string {
    if (!lastSeen) return 'Never';
    const diff = Date.now() - new Date(lastSeen).getTime();
    if (diff < 60_000) return 'Just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return new Date(lastSeen).toLocaleDateString();
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Browser Extension</Text>
        <View style={{ width: 32 }} />
      </View>

      {paired && device ? (
        /* ─── Connected/Paired View ───────────────────────────── */
        <View>
          {/* Status Card */}
          <View style={[styles.statusCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusDot,
                { backgroundColor: connected ? theme.accent : '#FF6B6B' },
              ]} />
              <Text style={[styles.statusText, { color: connected ? theme.accent : '#FF6B6B' }]}>
                {connected ? 'Connected' : 'Disconnected'}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* Device Info */}
            <View style={styles.infoSection}>
              <InfoRow
                label="Device"
                value={device.device_name || 'Browser Extension'}
                theme={theme}
              />
              {device.device_info?.browser && (
                <InfoRow
                  label="Browser"
                  value={device.device_info.browser}
                  theme={theme}
                />
              )}
              {device.device_info?.os && (
                <InfoRow
                  label="Operating System"
                  value={device.device_info.os}
                  theme={theme}
                />
              )}
              <InfoRow
                label="Last Active"
                value={formatLastSeen(device.last_seen_at)}
                theme={theme}
              />
              <InfoRow
                label="Paired On"
                value={new Date(device.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })}
                theme={theme}
              />
            </View>
          </View>

          {/* Status Description */}
          <Text style={[styles.statusDesc, { color: theme.textSecondary }]}>
            {connected
              ? 'Your browser extension is actively monitoring blocked websites.'
              : 'Your extension is paired but not currently running. Open the extension in your browser to resume monitoring.'
            }
          </Text>

          {/* Unpair Button */}
          <TouchableOpacity
            style={[styles.unpairBtn, { borderColor: '#FF6B6B' }]}
            onPress={handleUnpair}
            disabled={unpairing}
            activeOpacity={0.7}
          >
            {unpairing ? (
              <ActivityIndicator size="small" color="#FF6B6B" />
            ) : (
              <>
                <Ionicons name="unlink-outline" size={18} color="#FF6B6B" />
                <Text style={styles.unpairText}>Unpair Extension</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        /* ─── Not Paired View ─────────────────────────────────── */
        <View>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Connect your browser extension to enable website blocking on your computer
          </Text>

          {/* Mode Toggle */}
          <View style={[styles.modeToggle, { backgroundColor: theme.surface }]}>
            <TouchableOpacity
              style={[
                styles.modeBtn,
                pairMode === 'qr' && { backgroundColor: theme.accentDark },
              ]}
              onPress={() => { setPairMode('qr'); if (!qrCode) generateQR(); }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.modeBtnText,
                { color: pairMode === 'qr' ? '#FFFFFF' : theme.textSecondary },
              ]}>QR Code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeBtn,
                pairMode === 'code' && { backgroundColor: theme.accentDark },
              ]}
              onPress={() => { setPairMode('code'); if (!qrCode) generateQR(); }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.modeBtnText,
                { color: pairMode === 'code' ? '#FFFFFF' : theme.textSecondary },
              ]}>Manual Code</Text>
            </TouchableOpacity>
          </View>

          {/* QR / Code Display */}
          <View style={[styles.qrContainer, { borderColor: theme.border }]}>
            {generating ? (
              <ActivityIndicator size="large" color={theme.accent} />
            ) : qrCode ? (
              <View style={styles.qrContent}>
                {pairMode === 'qr' ? (
                  /* Actual QR Code */
                  <View style={styles.qrImageContainer}>
                    {QRCode ? (
                      <QRCode
                        value={qrCode}
                        size={200}
                        backgroundColor="transparent"
                        color={theme.text}
                      />
                    ) : (
                      /* Fallback if QR library not available */
                      <View style={[styles.qrPlaceholder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Ionicons name="qr-code-outline" size={64} color={theme.textSecondary} />
                        <Text style={[styles.qrFallbackText, { color: theme.textSecondary }]}>
                          QR rendering unavailable
                        </Text>
                        <Text style={[styles.qrCodeText, { color: theme.text }]} selectable>
                          {qrCode}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  /* Manual Code Display */
                  <View style={[styles.codeBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.codeText, { color: theme.text }]} selectable>
                      {qrCode}
                    </Text>
                    <Text style={[styles.codeLabel, { color: theme.textSecondary }]}>
                      Enter this code in your browser extension
                    </Text>
                  </View>
                )}

                {/* Timer / Refresh */}
                {expiresIn > 0 ? (
                  <Text style={[styles.timer, { color: theme.textSecondary }]}>
                    Expires in {minutes}:{seconds.toString().padStart(2, '0')}
                  </Text>
                ) : (
                  <TouchableOpacity
                    style={[styles.refreshBtn, { borderColor: theme.accent }]}
                    onPress={generateQR}
                  >
                    <Ionicons name="refresh-outline" size={16} color={theme.accent} />
                    <Text style={[styles.refreshText, { color: theme.accent }]}>
                      Generate New Code
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              /* No code generated yet */
              <View style={{ alignItems: 'center', gap: 16 }}>
                <Ionicons name="extension-puzzle-outline" size={48} color={theme.textSecondary} />
                <Text style={[styles.noCodeText, { color: theme.textSecondary }]}>
                  Generate a pairing code to connect your extension
                </Text>
                <TouchableOpacity
                  style={[styles.generateBtn, { backgroundColor: theme.accent }]}
                  onPress={generateQR}
                  activeOpacity={0.8}
                >
                  <Text style={styles.generateBtnText}>Generate Code</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Instructions */}
          <View style={styles.instructions}>
            <Text style={[styles.instructionTitle, { color: theme.text }]}>How to connect:</Text>
            <InstructionStep number={1} text="Install the Focussive extension from the Chrome Web Store" theme={theme} />
            <InstructionStep number={2} text="Click the extension icon in your browser toolbar" theme={theme} />
            <InstructionStep
              number={3}
              text={pairMode === 'qr'
                ? 'Click "Login with Connection Code" and enter the code shown above'
                : 'Enter the connection code above in the extension'}
              theme={theme}
            />
          </View>
        </View>
      )}

      {/* Back Button */}
      <TouchableOpacity
        style={[styles.backButton, { borderColor: theme.border }]}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Text style={[styles.backButtonText, { color: theme.textSecondary }]}>
          Back to Settings
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Helper Components ─────────────────────────────────────────

function InfoRow({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function InstructionStep({ number, text, theme }: { number: number; text: string; theme: any }) {
  return (
    <View style={styles.instructionStep}>
      <View style={[styles.stepNumber, { backgroundColor: theme.accent }]}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={[styles.stepText, { color: theme.textSecondary }]}>{text}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '300',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  // ── Connected View ──
  statusCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  infoSection: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '400',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusDesc: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 32,
  },
  unpairBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  unpairText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  // ── Pairing View ──
  modeToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginBottom: 24,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  qrContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    minHeight: 200,
    justifyContent: 'center',
    marginBottom: 24,
  },
  qrContent: {
    alignItems: 'center',
    width: '100%',
  },
  qrImageContainer: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  qrPlaceholder: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    width: '100%',
  },
  qrFallbackText: {
    fontSize: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  qrCodeText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
    letterSpacing: 1,
  },
  codeBox: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    width: '100%',
  },
  codeText: {
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 8,
  },
  codeLabel: {
    fontSize: 12,
  },
  timer: {
    fontSize: 14,
    marginTop: 16,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  noCodeText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  generateBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  generateBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // ── Instructions ──
  instructions: {
    marginBottom: 24,
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  instructionStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  // ── Back Button ──
  backButton: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
  },
});
