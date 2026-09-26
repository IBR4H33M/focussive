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
import { useTheme, useIsDark } from '@/utils/theme';
import { authApi, deviceApi } from '@/utils/api';
import { CameraView, useCameraPermissions } from 'expo-camera';

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
  const isDark = useIsDark();
  const titleColor = isDark ? theme.background : theme.text;

  // Connection status state
  const [loading, setLoading] = useState(true);
  const [paired, setPaired] = useState(false);
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState<ExtensionDevice | null>(null);

  // Tab: 'scan' (Scan QR Code from Extension) | 'code' (6-char One-Time Code)
  const [tab, setTab] = useState<'scan' | 'code'>('scan');

  // Within 'scan' tab: 'camera' | 'pin'
  const [scanMode, setScanMode] = useState<'camera' | 'pin'>('camera');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [pinInput, setPinInput] = useState('');
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const isProcessingScanRef = useRef(false);

  // Mobile 6-character code state
  const [mobileCode, setMobileCode] = useState<string | null>(null);
  const [codeTimeLeft, setCodeTimeLeft] = useState(0);
  const [generatingCode, setGeneratingCode] = useState(false);

  // Unpairing state
  const [unpairing, setUnpairing] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      // Poll every 4 seconds while modal is open
      pollIntervalRef.current = setInterval(fetchStatus, 4000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      isProcessingScanRef.current = false;
      setApprovalError('');
      setPinInput('');
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [visible, fetchStatus]);

  // Generate 6-character mobile code
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
    if (visible && !paired && tab === 'code' && !mobileCode) {
      generateMobileCode();
    }
  }, [visible, paired, tab, mobileCode, generateMobileCode]);

  // Code countdown timer
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

  // Handle Camera Barcode Scanned
  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (isProcessingScanRef.current || approving) return;
    isProcessingScanRef.current = true;

    try {
      let pin = data.trim();
      if (pin.startsWith('focussive:pair:')) {
        pin = pin.replace('focussive:pair:', '').trim();
      }
      setApproving(true);
      setApprovalError('');
      await authApi.pairingApprove({ code: data, pin });
      await fetchStatus();
      Alert.alert('Success', 'Browser extension connected successfully!');
    } catch (err: any) {
      setApprovalError(err?.message || 'Invalid or expired QR code');
      setTimeout(() => {
        isProcessingScanRef.current = false;
      }, 2500);
    } finally {
      setApproving(false);
    }
  };

  // Handle PIN Approval
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

  const POPUP_BG = isDark ? '#2D2E46' : theme.card;
  const POPUP_TEXT = isDark ? '#FFFFFF' : theme.text;
  const POPUP_MUTED = isDark ? 'rgba(255, 255, 255, 0.65)' : theme.textSecondary;
  const POPUP_BORDER = isDark ? 'rgba(255, 255, 255, 0.1)' : theme.border;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: POPUP_BG, borderColor: POPUP_BORDER }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: POPUP_BORDER }]}>
            <Text style={[styles.headerTitle, { color: POPUP_TEXT }]}>Browser Extension</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={POPUP_TEXT} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={[styles.loadingText, { color: POPUP_MUTED }]}>Checking connection status...</Text>
            </View>
          ) : paired ? (
            /* ═════════════════════════════════════════════════════════
               CONNECTED VIEW (Extension is Paired)
            ═════════════════════════════════════════════════════════ */
            <ScrollView contentContainerStyle={styles.contentScroll} showsVerticalScrollIndicator={false}>
              {/* Status Header (No container) */}
              <View style={styles.statusSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <View style={[styles.statusDot, { backgroundColor: connected ? '#1E9E44' : '#F59E0B' }]} />
                  <Text style={[styles.statusTitle, { color: connected ? '#1E9E44' : '#F59E0B' }]}>
                    {connected ? 'Connected & Actively Monitoring' : 'Paired (Browser Offline or Inactive)'}
                  </Text>
                </View>
                <Text style={[styles.statusSubtitle, { color: POPUP_MUTED }]}>
                  {connected
                    ? 'The extension is actively pinging and ready to block distracting sites.'
                    : 'Extension background ping has not been received in the last 60 seconds.'}
                </Text>
              </View>

              {/* Device Details (No container) */}
              <View style={styles.detailsSection}>
                <Text style={[styles.detailsSectionTitle, { color: 'rgba(255, 255, 255, 0.5)' }]}>DEVICE DETAILS</Text>

                <View style={[styles.detailRow, { borderBottomColor: POPUP_BORDER }]}>
                  <Text style={[styles.detailLabel, { color: POPUP_MUTED }]}>Device Name</Text>
                  <Text style={[styles.detailValue, { color: POPUP_TEXT }]}>
                    {device?.device_name || 'Browser Extension'}
                  </Text>
                </View>

                <View style={[styles.detailRow, { borderBottomColor: POPUP_BORDER }]}>
                  <Text style={[styles.detailLabel, { color: POPUP_MUTED }]}>Browser & OS</Text>
                  <Text style={[styles.detailValue, { color: POPUP_TEXT }]}>
                    {device?.device_info?.browser || 'Browser'} on {device?.device_info?.os || 'Desktop'}
                  </Text>
                </View>

                {device?.device_info?.ip && (
                  <View style={[styles.detailRow, { borderBottomColor: POPUP_BORDER }]}>
                    <Text style={[styles.detailLabel, { color: POPUP_MUTED }]}>IP Address</Text>
                    <Text style={[styles.detailValue, { color: POPUP_TEXT, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>
                      {device.device_info.ip}
                    </Text>
                  </View>
                )}

                <View style={[styles.detailRow, { borderBottomColor: POPUP_BORDER }]}>
                  <Text style={[styles.detailLabel, { color: POPUP_MUTED }]}>Last Active</Text>
                  <Text style={[styles.detailValue, { color: POPUP_TEXT }]}>
                    {formatLastSeen(device?.last_seen_at)}
                  </Text>
                </View>

                {device?.created_at && (
                  <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                    <Text style={[styles.detailLabel, { color: POPUP_MUTED }]}>Paired Since</Text>
                    <Text style={[styles.detailValue, { color: POPUP_TEXT }]}>
                      {new Date(device.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                )}
              </View>

              {/* One-Time Code Generate Option (for Paired / Offline or Inactive state) */}
              {!connected && (
                <View
                  style={[
                    styles.reconnectSection,
                    {
                      borderColor: 'rgba(255, 255, 255, 0.12)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name="key-outline" size={16} color={theme.accent} />
                    <Text style={[styles.reconnectTitle, { color: POPUP_TEXT }]}>Reinstalled the Extension?</Text>
                  </View>
                  <Text style={[styles.reconnectSubtitle, { color: POPUP_MUTED }]}>
                    Generate a one-time connection code to reconnect your extension without having to unpair first.
                  </Text>

                  {generatingCode ? (
                    <View style={styles.codeLoadingBox}>
                      <ActivityIndicator size="small" color={theme.accent} />
                    </View>
                  ) : mobileCode && codeTimeLeft > 0 ? (
                    <View style={[styles.codeDisplayCard, { backgroundColor: 'rgba(0,0,0,0.25)', borderColor: theme.accent, marginTop: 8 }]}>
                      <Text style={[styles.codeString, { color: theme.accent }]}>
                        {mobileCode.split('').join(' ')}
                      </Text>
                      <View style={styles.timerBadge}>
                        <Ionicons name="time-outline" size={13} color={POPUP_MUTED} />
                        <Text style={[styles.codeTimer, { color: POPUP_MUTED }]}>
                          Expires in {formatSeconds(codeTimeLeft)}
                        </Text>
                      </View>
                    </View>
                  ) : mobileCode && codeTimeLeft === 0 ? (
                    <TouchableOpacity
                      style={[styles.reconnectBtn, { borderColor: theme.accent, backgroundColor: 'transparent' }]}
                      onPress={generateMobileCode}
                      disabled={generatingCode}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="refresh-outline" size={15} color={theme.accent} />
                      <Text style={[styles.reconnectBtnText, { color: theme.accent }]}>Code Expired — Tap to Regenerate</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.reconnectBtn, { borderColor: theme.accent, backgroundColor: 'transparent' }]}
                      onPress={generateMobileCode}
                      disabled={generatingCode}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="qr-code-outline" size={15} color={theme.accent} />
                      <Text style={[styles.reconnectBtnText, { color: theme.accent }]}>Generate Connection Code</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Unpair Button (Border-only, matching other delete buttons in the app) */}
              <TouchableOpacity
                style={[
                  styles.unpairBtn,
                  {
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderColor: theme.danger,
                    opacity: unpairing ? 0.6 : 1,
                  },
                ]}
                onPress={handleUnpair}
                disabled={unpairing}
                activeOpacity={0.8}
              >
                {unpairing ? (
                  <ActivityIndicator size="small" color={theme.danger} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color={theme.danger} />
                    <Text style={[styles.unpairBtnText, { color: theme.danger }]}>
                      Unpair Extension
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* ═════════════════════════════════════════════════════════
               NOT CONNECTED VIEW (2 Tabs: Scan QR Code & One-Time Code)
            ═════════════════════════════════════════════════════════ */
            <ScrollView contentContainerStyle={styles.contentScroll} showsVerticalScrollIndicator={false}>
              {/* Segmented Tabs (2 Equal Buttons, Never Overlapping) */}
              <View style={[styles.tabBar, { backgroundColor: 'rgba(0, 0, 0, 0.25)' }]}>
                <TouchableOpacity
                  style={[styles.tabItem, tab === 'scan' && [styles.tabItemActive, { backgroundColor: 'rgba(255, 255, 255, 0.12)' }]]}
                  onPress={() => { setTab('scan'); setApprovalError(''); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="qr-code-outline" size={16} color={tab === 'scan' ? theme.accent : POPUP_MUTED} />
                  <Text style={[styles.tabText, { color: tab === 'scan' ? POPUP_TEXT : POPUP_MUTED }]}>
                    Scan QR Code
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabItem, tab === 'code' && [styles.tabItemActive, { backgroundColor: 'rgba(255, 255, 255, 0.12)' }]]}
                  onPress={() => { setTab('code'); setApprovalError(''); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="keypad-outline" size={16} color={tab === 'code' ? theme.accent : POPUP_MUTED} />
                  <Text style={[styles.tabText, { color: tab === 'code' ? POPUP_TEXT : POPUP_MUTED }]}>
                    One-Time Code
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TAB 1: Scan QR Code from Desktop Extension */}
              {tab === 'scan' && (
                <View style={styles.tabContent}>
                  {scanMode === 'camera' ? (
                    /* CAMERA SCANNER VIEW */
                    <View style={styles.cameraSection}>
                      <Text style={[styles.instructionTitle, { color: POPUP_TEXT }]}>
                        Scan Extension QR Code
                      </Text>
                      <Text style={[styles.instructionDesc, { color: POPUP_MUTED }]}>
                        Open the Focussive extension on your browser and point your phone camera at the QR code on your computer screen.
                      </Text>

                      {!cameraPermission?.granted ? (
                        <View style={[styles.cameraFallbackBox, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: POPUP_BORDER }]}>
                          <Ionicons name="camera-outline" size={44} color={POPUP_MUTED} />
                          <Text style={[styles.cameraFallbackTitle, { color: POPUP_TEXT }]}>
                            Camera Access Needed
                          </Text>
                          <Text style={[styles.cameraFallbackDesc, { color: POPUP_MUTED }]}>
                            Grant camera permission to scan the QR code directly from your computer screen.
                          </Text>
                          <TouchableOpacity
                            style={styles.grantBtn}
                            onPress={requestCameraPermission}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.cameraWrapper}>
                          <CameraView
                            style={styles.cameraView}
                            facing="back"
                            barcodeScannerSettings={{
                              barcodeTypes: ['qr'],
                            }}
                            onBarcodeScanned={handleBarcodeScanned}
                          />
                          {/* Viewfinder Target Overlay */}
                          <View style={styles.viewfinderOverlay}>
                            <View style={styles.targetFrame}>
                              <View style={[styles.corner, styles.cornerTL]} />
                              <View style={[styles.corner, styles.cornerTR]} />
                              <View style={[styles.corner, styles.cornerBL]} />
                              <View style={[styles.corner, styles.cornerBR]} />
                              {approving && (
                                <ActivityIndicator size="large" color="#FFFFFF" />
                              )}
                            </View>
                          </View>
                        </View>
                      )}

                      {approvalError ? (
                        <Text style={styles.errorText}>{approvalError}</Text>
                      ) : null}

                      {/* Button to Switch to PIN Input */}
                      <TouchableOpacity
                        style={[styles.switchModeBtn, { borderColor: POPUP_BORDER }]}
                        onPress={() => { setScanMode('pin'); setApprovalError(''); }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="keypad-outline" size={16} color={theme.accent} />
                        <Text style={[styles.switchModeBtnText, { color: theme.accent }]}>
                          Input QR PIN Instead of Scan
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    /* PIN INPUT VIEW */
                    <View style={styles.pinSection}>
                      <Text style={[styles.instructionTitle, { color: POPUP_TEXT }]}>
                        Enter Extension QR PIN
                      </Text>
                      <Text style={[styles.instructionDesc, { color: POPUP_MUTED }]}>
                        Look at the Focussive extension on your browser and type the 6-digit PIN displayed right below the QR code:
                      </Text>

                      <View style={styles.pinInputContainer}>
                        <TextInput
                          style={[
                            styles.pinInput,
                            {
                              backgroundColor: 'rgba(0,0,0,0.25)',
                              borderColor: approvalError ? '#EF4444' : POPUP_BORDER,
                              color: POPUP_TEXT,
                            },
                          ]}
                          placeholder="6-DIGIT PIN"
                          placeholderTextColor="rgba(255,255,255,0.4)"
                          keyboardType="number-pad"
                          maxLength={6}
                          value={pinInput}
                          onChangeText={(t) => {
                            setPinInput(t);
                            setApprovalError('');
                          }}
                          autoFocus
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

                      {/* Button to Switch Back to Camera */}
                      <TouchableOpacity
                        style={[styles.switchModeBtn, { borderColor: POPUP_BORDER }]}
                        onPress={() => { setScanMode('camera'); setApprovalError(''); }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="camera-outline" size={16} color={theme.accent} />
                        <Text style={[styles.switchModeBtnText, { color: theme.accent }]}>
                          Switch to Camera Scanner
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* TAB 2: Generate 6-Character One-Time Code */}
              {tab === 'code' && (
                <View style={styles.tabContent}>
                  <Text style={[styles.instructionTitle, { color: POPUP_TEXT }]}>
                    Connect via One-Time Code
                  </Text>
                  <Text style={[styles.instructionDesc, { color: POPUP_MUTED }]}>
                    Open the Focussive extension on your browser, select &ldquo;Enter Code&rdquo;, and type this 6-character code:
                  </Text>

                  {generatingCode ? (
                    <View style={styles.codeLoadingBox}>
                      <ActivityIndicator size="small" color={theme.accent} />
                    </View>
                  ) : mobileCode && codeTimeLeft > 0 ? (
                    <View style={[styles.codeDisplayCard, { backgroundColor: 'rgba(0,0,0,0.25)', borderColor: POPUP_BORDER }]}>
                      <Text style={[styles.codeString, { color: theme.accent }]}>
                        {mobileCode.split('').join(' ')}
                      </Text>
                      <View style={styles.timerBadge}>
                        <Ionicons name="time-outline" size={13} color={POPUP_MUTED} />
                        <Text style={[styles.codeTimer, { color: POPUP_MUTED }]}>
                          Expires in {formatSeconds(codeTimeLeft)}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.secondaryBtn, { borderColor: POPUP_BORDER }]}
                      onPress={generateMobileCode}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="refresh" size={16} color={theme.accent} />
                      <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>Generate New Code</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[styles.helperNote, { color: POPUP_MUTED }]}>
                    Waiting for extension... As soon as you enter this code in your browser, pairing will complete automatically.
                  </Text>
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
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
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
  statusSection: {
    paddingVertical: 4,
    gap: 4,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  detailsSection: {
    gap: 2,
    marginTop: 4,
  },
  detailsSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: {
    fontSize: 13,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  reconnectSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 14,
    marginBottom: 4,
    gap: 8,
  },
  reconnectTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  reconnectSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  reconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  reconnectBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  unpairBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#8B1E1E',
    marginTop: 12,
  },
  unpairBtnText: {
    color: '#8B1E1E',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
    gap: 6,
    width: '100%',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
  },
  tabItemActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabContent: {
    gap: 12,
    paddingTop: 4,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  instructionDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  cameraSection: {
    gap: 14,
  },
  cameraFallbackBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  cameraFallbackTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  cameraFallbackDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  grantBtn: {
    marginTop: 14,
    marginBottom: 8,
    backgroundColor: '#1C853D',
    borderWidth: 2,
    borderColor: '#115926',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  grantBtnText: {
    color: '#E0F2E9',
    fontSize: 13,
    fontWeight: '600',
  },
  cameraWrapper: {
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  cameraView: {
    flex: 1,
  },
  viewfinderOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  targetFrame: {
    width: 170,
    height: 170,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#90EE90',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  switchModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  switchModeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pinSection: {
    gap: 12,
  },
  pinInputContainer: {
    marginTop: 4,
  },
  pinInput: {
    height: 52,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 8,
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
  codeLoadingBox: {
    padding: 30,
    alignItems: 'center',
  },
  codeDisplayCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginVertical: 4,
  },
  codeString: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
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
});
