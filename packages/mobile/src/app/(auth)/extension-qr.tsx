// ============================================================
// Focussive Mobile — Onboarding Browser Extension Screen
// Matches the design & functionality of ExtensionModal from Settings
// Includes clear "Skip for now" and "Continue to App" options
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export default function ExtensionQRScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
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
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchStatus(false);

    // Silent background polling — keeps state live
    pollIntervalRef.current = setInterval(() => {
      fetchStatus(true);
    }, 7000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchStatus]);

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
    if (!paired && tab === 'code' && !mobileCode) {
      generateMobileCode();
    }
  }, [paired, tab, mobileCode, generateMobileCode]);

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
      Alert.alert('Connected!', 'Browser extension paired successfully.', [
        {
          text: 'Continue to App',
          onPress: () => router.replace('/(tabs)' as never),
        },
      ]);
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
      Alert.alert('Connected!', 'Browser extension paired successfully.', [
        {
          text: 'Continue to App',
          onPress: () => router.replace('/(tabs)' as never),
        },
      ]);
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

  const handleSkipOrProceed = () => {
    router.replace('/(tabs)' as never);
  };

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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: POPUP_BORDER }]}>
        <View style={styles.headerLeft} />
        <Text style={[styles.headerTitle, { color: theme.text }]}>Browser Extension</Text>
        <TouchableOpacity
          onPress={handleSkipOrProceed}
          style={styles.skipHeaderBtn}
          activeOpacity={0.7}
        >
          <Text style={[styles.skipHeaderText, { color: theme.accent }]}>Skip for now</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: POPUP_MUTED }]}>Checking connection status...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.contentScroll,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {paired && device ? (
            /* ═════════════════════════════════════════════════════════
               CONNECTED VIEW (Extension is Paired)
            ═════════════════════════════════════════════════════════ */
            <View style={[styles.connectedCard, { backgroundColor: POPUP_BG, borderColor: POPUP_BORDER }]}>
              {/* Status Header */}
              <View style={styles.statusSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <View style={[styles.statusDot, { backgroundColor: connected ? '#1E9E44' : '#F59E0B' }]} />
                  <Text style={[styles.statusTitle, { color: connected ? '#1E9E44' : '#F59E0B' }]}>
                    {connected ? 'Connected & Actively Monitoring' : 'Paired (Browser Offline or Inactive)'}
                  </Text>
                </View>
                <Text style={[styles.statusSubtitle, { color: POPUP_MUTED }]}>
                  {connected
                    ? 'The extension is actively syncing and ready to block distracting websites during focus sessions.'
                    : 'Extension background ping has not been received in the last 60 seconds.'}
                </Text>
              </View>

              {/* Primary Continue Button */}
              <TouchableOpacity
                style={[styles.continuePrimaryBtn, { backgroundColor: theme.accent }]}
                onPress={handleSkipOrProceed}
                activeOpacity={0.85}
              >
                <Text style={styles.continuePrimaryBtnText}>Continue to App</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>

              {/* Device Details */}
              <View style={styles.detailsSection}>
                <Text style={[styles.detailsSectionTitle, { color: isDark ? 'rgba(255, 255, 255, 0.5)' : theme.textSecondary }]}>
                  DEVICE DETAILS
                </Text>

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

              {/* Unpair Button */}
              <TouchableOpacity
                style={[
                  styles.unpairBtn,
                  {
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
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
            </View>
          ) : (
            /* ═════════════════════════════════════════════════════════
               NOT CONNECTED VIEW (Matching ExtensionModal from Settings)
            ═════════════════════════════════════════════════════════ */
            <View style={[styles.pairingCard, { backgroundColor: POPUP_BG, borderColor: POPUP_BORDER }]}>
              {/* Introduction Note */}
              <View style={styles.introBox}>
                <Text style={[styles.introTitle, { color: POPUP_TEXT }]}>
                  Connect Desktop Browser
                </Text>
                <Text style={[styles.introSubtitle, { color: POPUP_MUTED }]}>
                  Link your computer&apos;s browser extension so distracting websites are blocked automatically while mobile focus sessions are running.
                </Text>
              </View>

              {/* Premium Segmented Tabs */}
              <View
                style={[
                  styles.tabBar,
                  {
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.05)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.tabItem,
                    tab === 'scan' && [
                      styles.tabItemActive,
                      {
                        backgroundColor: '#62774C',
                        borderColor: '#62774C',
                      },
                    ],
                  ]}
                  onPress={() => { setTab('scan'); setApprovalError(''); }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="qr-code-outline"
                    size={17}
                    color={tab === 'scan' ? '#FFFFFF' : POPUP_MUTED}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      {
                        color: tab === 'scan' ? '#FFFFFF' : POPUP_MUTED,
                        fontWeight: tab === 'scan' ? '700' : '500',
                      },
                    ]}
                  >
                    Scan QR Code
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.tabItem,
                    tab === 'code' && [
                      styles.tabItemActive,
                      {
                        backgroundColor: '#62774C',
                        borderColor: '#62774C',
                      },
                    ],
                  ]}
                  onPress={() => { setTab('code'); setApprovalError(''); }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="keypad-outline"
                    size={17}
                    color={tab === 'code' ? '#FFFFFF' : POPUP_MUTED}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      {
                        color: tab === 'code' ? '#FFFFFF' : POPUP_MUTED,
                        fontWeight: tab === 'code' ? '700' : '500',
                      },
                    ]}
                  >
                    One-Time Code
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TAB 1: Scan QR Code from Desktop Extension */}
              {tab === 'scan' && (
                <View style={styles.tabContent}>
                  {/* Chrome Web Store Guide Info */}
                  <View style={styles.webstoreGuideTextContainer}>
                    <Text style={[styles.webstoreTitle, { color: POPUP_TEXT }]}>
                      First time setting up?
                    </Text>
                    <Text style={[styles.webstoreSubtitle, { color: POPUP_MUTED }]}>
                      Search for <Text style={{ color: '#2FB556', fontWeight: '700' }}>&ldquo;FOCUSSIVE companion&rdquo;</Text> in the Chrome Web Store.
                    </Text>
                  </View>

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
                            style={[styles.grantBtn, { backgroundColor: theme.accent }]}
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

              {/* Skip for now / Continue without extension button */}
              <View style={styles.bottomSkipSection}>
                <TouchableOpacity
                  style={[styles.bottomSkipBtn, { borderColor: POPUP_BORDER }]}
                  onPress={handleSkipOrProceed}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.bottomSkipBtnText, { color: theme.text }]}>
                    Skip for now
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.bottomSkipSubtext, { color: POPUP_MUTED }]}>
                  You can always connect the Chrome extension later from Settings.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    width: 80,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  skipHeaderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'flex-end',
    width: 80,
  },
  skipHeaderText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  contentScroll: {
    padding: 18,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  pairingCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 16,
  },
  connectedCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 16,
  },
  introBox: {
    gap: 4,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  introSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabItemActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
  },
  tabContent: {
    gap: 14,
  },
  webstoreGuideTextContainer: {
    paddingVertical: 2,
    gap: 3,
  },
  webstoreTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  webstoreSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  cameraSection: {
    gap: 10,
  },
  instructionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  instructionDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  cameraWrapper: {
    width: '100%',
    height: 250,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  cameraView: {
    ...StyleSheet.absoluteFill,
  },
  viewfinderOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
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
    width: 22,
    height: 22,
    borderColor: '#FFFFFF',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  cameraFallbackBox: {
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    gap: 10,
  },
  cameraFallbackTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cameraFallbackDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  grantBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginTop: 4,
  },
  grantBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  switchModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
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
    marginVertical: 4,
  },
  pinInput: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    textAlign: 'center',
    marginTop: -4,
  },
  codeLoadingBox: {
    padding: 24,
    alignItems: 'center',
  },
  codeDisplayCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  codeString: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  codeTimer: {
    fontSize: 12,
    fontWeight: '500',
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
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 4,
  },
  bottomSkipSection: {
    marginTop: 10,
    alignItems: 'center',
    gap: 6,
  },
  bottomSkipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  bottomSkipBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bottomSkipSubtext: {
    fontSize: 11,
    textAlign: 'center',
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
  continuePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 6,
  },
  continuePrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
  unpairBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 10,
  },
  unpairBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
