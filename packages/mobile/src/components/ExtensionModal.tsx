// ============================================================
// Focussive Mobile — Extension Management Modal
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/utils/theme';
import { authApi, deviceApi } from '@/utils/api';
import QRCode from 'react-native-qrcode-svg';

interface ExtensionDevice {
  id: string;
  device_name: string;
  device_info: Record<string, any>;
  last_seen_at: string;
  created_at: string;
}

interface ExtensionModalProps {
  visible: boolean;
  onClose: () => void;
  onStatusChange?: (paired: boolean, connected: boolean) => void;
}

export default function ExtensionModal({ visible, onClose, onStatusChange }: ExtensionModalProps) {
  const theme = useTheme();

  // Connection status state
  const [loading, setLoading] = useState(true);
  const [paired, setPaired] = useState(false);
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState<ExtensionDevice | null>(null);

  // Tab: 'scan' (camera/PIN to approve extension) | 'code' (mobile code to type in extension) | 'qr' (show QR on mobile)
  const [tab, setTab] = useState<'scan' | 'code' | 'qr'>('scan');

  // Scanner / PIN approval state
  const [pinInput, setPinInput] = useState('');
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState('');

  // Mobile code generation state
  const [mobileCode, setMobileCode] = useState<string | null>(null);
  const [codeTimeLeft, setCodeTimeLeft] = useState(0);
  const [generatingCode, setGeneratingCode] = useState(false);

  // Unpairing state
  const [unpairing, setUnpairing] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch extension connection status
  const fetchStatus = useCallback(async () => {
    try {
      const result = await deviceApi.extensionStatus();
      setPaired(result.paired);
      setConnected(result.connected);
      setDevice(result.device);
      onStatusChange?.(result.paired, result.connected);
    } catch {
      setPaired(false);
      setConnected(false);
      setDevice(null);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      fetchStatus();
      // Poll every 5s while modal is open
      pollIntervalRef.current = setInterval(fetchStatus, 5000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [visible, fetchStatus]);

  // Generate mobile code
  const generateMobileCode = useCallback(async () => {
    setGeneratingCode(true);
    try {
      const res = await authApi.qrGenerate();
      setMobileCode(res.code);
      setCodeTimeLeft(res.expires_in_seconds || 300);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate code');
    } finally {
      setGeneratingCode(false);
    }
  }, []);

  useEffect(() => {
    if (visible && !paired && (tab === 'code' || tab === 'qr') && !mobileCode) {
      generateMobileCode();
    }
  }, [visible, paired, tab, mobileCode, generateMobileCode]);

  // Mobile code countdown timer
  useEffect(() => {
    if (codeTimeLeft <= 0) return;
    const t = setInterval(() => {
      setCodeTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [codeTimeLeft]);

  // Handle PIN / Code approval
  async function handleApprovePin() {
    const trimmed = pinInput.trim();
    if (!trimmed) {
      setApprovalError('Please enter the 6-digit PIN from your extension');
      return;
    }
    setApproving(true);
    setApprovalError('');
    try {
      await authApi.pairingApprove({ pin: trimmed });
      setPinInput('');
      await fetchStatus();
      Alert.alert('Success', 'Browser extension connected successfully!');
    } catch (err: any) {
      setApprovalError(err?.message || 'Invalid or expired PIN code');
    } finally {
      setApproving(false);
    }
  }

  // Handle Unpair
  function handleUnpair() {
    if (!device) return;
    Alert.alert(
      'Unpair Extension',
      'Are you sure you want to disconnect this browser extension? It will no longer monitor browsing sessions on your computer.',
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
              onStatusChange?.(false, false);
              Alert.alert('Unpaired', 'Browser extension has been removed.');
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to unpair extension');
            } finally {
              setUnpairing(false);
            }
          },
        },
      ]
    );
  }

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatLastSeen = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (diff < 30) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.iconBadge, { backgroundColor: theme.accent + '20' }]}>
                <Ionicons name="browsers" size={20} color={theme.accent} />
              </View>
              <Text style={[styles.headerTitle, { color: theme.text }]}>Browser Extension</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Checking connection status...</Text>
            </View>
          ) : paired ? (
            /* ═════════════════════════════════════════════════════════
               CONNECTED VIEW (Extension is Paired)
            ═════════════════════════════════════════════════════════ */
            <ScrollView contentContainerStyle={styles.contentScroll} showsVerticalScrollIndicator={false}>
              {/* Status Header Badge */}
              <View style={[
                styles.statusBanner,
                { backgroundColor: connected ? '#10B98115' : '#F59E0B15', borderColor: connected ? '#10B98140' : '#F59E0B40' }
              ]}>
                <View style={[styles.statusDot, { backgroundColor: connected ? '#10B981' : '#F59E0B' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusTitle, { color: connected ? '#10B981' : '#F59E0B' }]}>
                    {connected ? 'Connected & Actively Monitoring' : 'Paired (Browser Offline or Inactive)'}
                  </Text>
                  <Text style={[styles.statusSubtitle, { color: theme.textSecondary }]}>
                    {connected
                      ? 'The extension is actively pinging and enforcing session limits.'
                      : 'Extension background ping has not been received in the last 60 seconds.'}
                  </Text>
                </View>
              </View>

              {/* Device Details Card */}
              <View style={[styles.detailsCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Text style={[styles.detailsSectionTitle, { color: theme.textSecondary }]}>DEVICE DETAILS</Text>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Device Name</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {device?.device_name || 'Browser Extension'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Browser & OS</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {device?.device_info?.browser || 'Browser'} on {device?.device_info?.os || 'Desktop'}
                  </Text>
                </View>

                {device?.device_info?.ip && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>IP Address</Text>
                    <Text style={[styles.detailValue, { color: theme.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>
                      {device.device_info.ip}
                    </Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Last Active</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {formatLastSeen(device?.last_seen_at)}
                  </Text>
                </View>

                {device?.created_at && (
                  <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Paired Since</Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {new Date(device.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                )}
              </View>

              {/* Unpair Button */}
              <TouchableOpacity
                style={[styles.unpairBtn, { opacity: unpairing ? 0.6 : 1 }]}
                onPress={handleUnpair}
                disabled={unpairing}
                activeOpacity={0.8}
              >
                {unpairing ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={styles.unpairBtnText}>Unpair Extension</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* ═════════════════════════════════════════════════════════
               NOT CONNECTED VIEW (Pairing Options)
            ═════════════════════════════════════════════════════════ */
            <ScrollView contentContainerStyle={styles.contentScroll} showsVerticalScrollIndicator={false}>
              {/* Segmented Tabs */}
              <View style={[styles.tabBar, { backgroundColor: theme.background }]}>
                <TouchableOpacity
                  style={[styles.tabItem, tab === 'scan' && [styles.tabItemActive, { backgroundColor: theme.card }]]}
                  onPress={() => setTab('scan')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="qr-code" size={16} color={tab === 'scan' ? theme.accent : theme.textSecondary} />
                  <Text style={[styles.tabText, { color: tab === 'scan' ? theme.text : theme.textSecondary }]}>
                    Approve PIN / QR
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabItem, tab === 'code' && [styles.tabItemActive, { backgroundColor: theme.card }]]}
                  onPress={() => setTab('code')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="keypad" size={16} color={tab === 'code' ? theme.accent : theme.textSecondary} />
                  <Text style={[styles.tabText, { color: tab === 'code' ? theme.text : theme.textSecondary }]}>
                    One-Time Code
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabItem, tab === 'qr' && [styles.tabItemActive, { backgroundColor: theme.card }]]}
                  onPress={() => setTab('qr')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="barcode-outline" size={16} color={tab === 'qr' ? theme.accent : theme.textSecondary} />
                  <Text style={[styles.tabText, { color: tab === 'qr' ? theme.text : theme.textSecondary }]}>
                    Show QR
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TAB 1: Approve Extension by entering PIN or Scanning */}
              {tab === 'scan' && (
                <View style={styles.tabContent}>
                  <Text style={[styles.instructionTitle, { color: theme.text }]}>
                    Connect via Extension QR / PIN
                  </Text>
                  <Text style={[styles.instructionDesc, { color: theme.textSecondary }]}>
                    Open the Focussive extension on your browser and click &ldquo;Scan QR Code&rdquo;. Enter the 6-digit PIN displayed on your computer screen below:
                  </Text>

                  <View style={styles.pinInputContainer}>
                    <TextInput
                      style={[
                        styles.pinInput,
                        {
                          backgroundColor: theme.background,
                          borderColor: approvalError ? '#EF4444' : theme.border,
                          color: theme.text,
                        },
                      ]}
                      placeholder="6-DIGIT PIN"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="number-pad"
                      maxLength={6}
                      value={pinInput}
                      onChangeText={(t) => {
                        setPinInput(t);
                        setApprovalError('');
                      }}
                    />
                  </View>

                  {approvalError ? (
                    <Text style={styles.errorText}>{approvalError}</Text>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: '#435432', opacity: approving ? 0.6 : 1 }]}
                    onPress={handleApprovePin}
                    disabled={approving}
                    activeOpacity={0.8}
                  >
                    {approving ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                        <Text style={styles.primaryBtnText}>Approve & Connect</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* TAB 2: Generate One-Time Code from Mobile to Type in Extension */}
              {tab === 'code' && (
                <View style={styles.tabContent}>
                  <Text style={[styles.instructionTitle, { color: theme.text }]}>
                    Connect via One-Time Code
                  </Text>
                  <Text style={[styles.instructionDesc, { color: theme.textSecondary }]}>
                    Enter this code in the Focussive extension on your browser (under &ldquo;Enter Code&rdquo;):
                  </Text>

                  {generatingCode ? (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={theme.accent} />
                    </View>
                  ) : mobileCode && codeTimeLeft > 0 ? (
                    <View style={[styles.codeDisplayCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      <Text style={[styles.codeString, { color: theme.accent }]}>{mobileCode}</Text>
                      <Text style={[styles.codeTimer, { color: theme.textSecondary }]}>
                        Expires in {formatSeconds(codeTimeLeft)}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.secondaryBtn, { borderColor: theme.border }]}
                      onPress={generateMobileCode}
                    >
                      <Ionicons name="refresh" size={16} color={theme.accent} />
                      <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>Generate New Code</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[styles.helperNote, { color: theme.textSecondary }]}>
                    The mobile app is listening. Once you enter this code in the extension, pairing will complete automatically.
                  </Text>
                </View>
              )}

              {/* TAB 3: Render Real QR Code on Mobile */}
              {tab === 'qr' && (
                <View style={[styles.tabContent, { alignItems: 'center' }]}>
                  <Text style={[styles.instructionTitle, { color: theme.text }]}>
                    Mobile Pairing QR Code
                  </Text>
                  <Text style={[styles.instructionDesc, { color: theme.textSecondary, textAlign: 'center' }]}>
                    Scan this code or enter the pairing code in the extension:
                  </Text>

                  {generatingCode ? (
                    <View style={{ padding: 40 }}>
                      <ActivityIndicator size="large" color={theme.accent} />
                    </View>
                  ) : mobileCode && codeTimeLeft > 0 ? (
                    <View style={styles.qrWrapper}>
                      <QRCode
                        value={mobileCode}
                        size={170}
                        color="#000000"
                        backgroundColor="#FFFFFF"
                      />
                      <Text style={[styles.codeTimer, { color: theme.textSecondary, marginTop: 12 }]}>
                        Expires in {formatSeconds(codeTimeLeft)}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.secondaryBtn, { borderColor: theme.border, marginTop: 16 }]}
                      onPress={generateMobileCode}
                    >
                      <Ionicons name="refresh" size={16} color={theme.accent} />
                      <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>Generate QR Code</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    padding: 4,
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  contentScroll: {
    padding: 20,
    gap: 16,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  detailsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  detailsSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  detailLabel: {
    fontSize: 13,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  unpairBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginTop: 4,
  },
  unpairBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabItemActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabContent: {
    gap: 12,
    paddingTop: 6,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  instructionDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  pinInputContainer: {
    marginTop: 4,
  },
  pinInput: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 6,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    textAlign: 'center',
  },
  codeDisplayCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    marginVertical: 4,
  },
  codeString: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 6,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  codeTimer: {
    fontSize: 12,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  helperNote: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    fontStyle: 'italic',
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
});
