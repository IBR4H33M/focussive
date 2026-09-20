// ============================================================
// Focussive Mobile — Violation Overlay Component
// ============================================================

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Image,
} from 'react-native';
import { MOTIVATIONAL_QUOTES } from '@focussive/shared';
import { userApi } from '@/utils/api';

type OverlayScreen = 'idle' | 'selectBreak' | 'selectAllow';

interface ViolationOverlayProps {
  visible: boolean;
  appName?: string;
  websiteName?: string;
  /** Whether the session allows breaks */
  breakAvailable: boolean;
  /** Max minutes selectable for a break (remaining break time) */
  breakMaxMinutes: number;
  /** Called when user confirms "Take a break" with chosen minutes */
  onTakeBreak: (minutes: number) => void;
  /** Called when user confirms "Allow anyway" with chosen minutes (1–5) */
  onAllowAnyway: (minutes: number) => void;
  onDismiss: () => void;
}

export default function ViolationOverlay({
  visible,
  appName,
  websiteName,
  breakAvailable,
  breakMaxMinutes,
  onTakeBreak,
  onAllowAnyway,
  onDismiss,
}: ViolationOverlayProps) {
  const [screen, setScreen] = useState<OverlayScreen>('idle');
  const [breakMinutes, setBreakMinutes] = useState(1);
  const [allowMinutes, setAllowMinutes] = useState(1);
  const [quote, setQuote] = useState<string>('');
  const [quoteEnabled, setQuoteEnabled] = useState(true);
  const [gifEnabled, setGifEnabled] = useState(false);
  const [gifUrl, setGifUrl] = useState<string | null>(null);

  const name = appName || websiteName || 'this app';

  // Reset state and pick random quote when overlay opens
  useEffect(() => {
    if (visible) {
      setScreen('idle');
      setBreakMinutes(1);
      setAllowMinutes(1);
      const randomIdx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
      setQuote(MOTIVATIONAL_QUOTES[randomIdx]);

      userApi.getProfile().then((data: any) => {
        if (data) {
          if (typeof data.overlay_quote_enabled === 'boolean') {
            setQuoteEnabled(data.overlay_quote_enabled);
          }
          if (typeof data.overlay_gif_enabled === 'boolean') {
            setGifEnabled(data.overlay_gif_enabled);
          }
          if (data.overlay_gif_url) {
            setGifUrl(data.overlay_gif_url);
          }
        }
      }).catch(() => {});
    }
  }, [visible]);

  const handleTakeBreakConfirm = useCallback(() => {
    onTakeBreak(breakMinutes);
    setScreen('idle');
  }, [breakMinutes, onTakeBreak]);

  const handleAllowConfirm = useCallback(() => {
    onAllowAnyway(allowMinutes);
    setScreen('idle');
  }, [allowMinutes, onAllowAnyway]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.content}>

          {/* ── Idle Screen ── */}
          {screen === 'idle' && (
            <>
              <Text style={styles.title}>Distraction Detected</Text>
              <Text style={[styles.subtitle, { marginBottom: 16 }]}>
                You're using {name} during a focus session
              </Text>

              {/* Custom GIF if enabled */}
              {gifEnabled && gifUrl ? (
                <Image
                  source={{ uri: gifUrl }}
                  style={styles.overlayGif}
                  resizeMode="contain"
                />
              ) : null}

              {/* Motivational Quote if enabled */}
              {quoteEnabled && quote ? (
                <Text style={styles.quoteText}>{quote}</Text>
              ) : (
                <View style={{ marginBottom: 16 }} />
              )}

              <View style={styles.buttons}>
                {/* Take a Break */}
                {breakAvailable ? (
                  <TouchableOpacity
                    style={styles.breakBtn}
                    onPress={() => { setBreakMinutes(1); setScreen('selectBreak'); }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.breakBtnText}>☕  Take a break</Text>
                    <Text style={styles.breakSubtext}>{breakMaxMinutes} min remaining</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.breakBtnDisabled}>
                    <Text style={styles.breakBtnDisabledText}>No break time available</Text>
                  </View>
                )}

                {/* Allow Anyway */}
                <TouchableOpacity
                  style={styles.allowBtn}
                  onPress={() => { setAllowMinutes(1); setScreen('selectAllow'); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.allowText}>Allow anyway</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Break Time Picker ── */}
          {screen === 'selectBreak' && (
            <>
              <Text style={styles.title}>Take a break</Text>
              <Text style={styles.subtitle}>Choose break duration</Text>

              <View style={styles.pickerContainer}>
                <Pressable
                  style={styles.arrowBtn}
                  onPress={() => setBreakMinutes(m => Math.min(m + 1, breakMaxMinutes))}
                >
                  <Text style={styles.arrowText}>▲</Text>
                </Pressable>

                <View style={styles.minuteDisplay}>
                  <Text style={styles.minuteNumber}>{breakMinutes}</Text>
                  <Text style={styles.minuteLabel}>min</Text>
                </View>

                <Pressable
                  style={styles.arrowBtn}
                  onPress={() => setBreakMinutes(m => Math.max(m - 1, 1))}
                >
                  <Text style={styles.arrowText}>▼</Text>
                </Pressable>
              </View>

              <View style={styles.buttons}>
                <TouchableOpacity style={styles.breakBtn} onPress={handleTakeBreakConfirm} activeOpacity={0.8}>
                  <Text style={styles.breakBtnText}>Start {breakMinutes} min break</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('idle')} activeOpacity={0.8}>
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Allow Anyway Time Picker ── */}
          {screen === 'selectAllow' && (
            <>
              <Text style={styles.title}>Allow anyway</Text>
              <Text style={styles.subtitle}>This time will be counted as distracted</Text>

              <View style={styles.pickerContainer}>
                <Pressable
                  style={styles.arrowBtn}
                  onPress={() => setAllowMinutes(m => Math.min(m + 1, 5))}
                >
                  <Text style={styles.arrowText}>▲</Text>
                </Pressable>

                <View style={styles.minuteDisplay}>
                  <Text style={styles.minuteNumber}>{allowMinutes}</Text>
                  <Text style={styles.minuteLabel}>min</Text>
                </View>

                <Pressable
                  style={styles.arrowBtn}
                  onPress={() => setAllowMinutes(m => Math.max(m - 1, 1))}
                >
                  <Text style={styles.arrowText}>▼</Text>
                </Pressable>
              </View>

              <View style={styles.buttons}>
                <TouchableOpacity style={styles.allowBtn} onPress={handleAllowConfirm} activeOpacity={0.8}>
                  <Text style={styles.allowText}>Allow {allowMinutes} min</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('idle')} activeOpacity={0.8}>
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(220, 53, 69, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 32,
    width: '100%',
    maxWidth: 360,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 40,
    textAlign: 'center',
  },
  overlayGif: {
    width: 140,
    height: 140,
    borderRadius: 12,
    marginBottom: 16,
  },
  quoteText: {
    fontSize: 13,
    color: '#FFD166',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 24,
    paddingHorizontal: 8,
    lineHeight: 18,
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  // Break button (active)
  breakBtn: {
    backgroundColor: 'rgba(144, 238, 144, 0.25)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#90EE90',
    alignItems: 'center',
  },
  breakBtnText: {
    color: '#90EE90',
    fontSize: 16,
    fontWeight: '600',
  },
  breakSubtext: {
    color: 'rgba(144,238,144,0.7)',
    fontSize: 12,
    marginTop: 3,
  },
  // Break button (disabled)
  breakBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  breakBtnDisabledText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
    fontWeight: '400',
  },
  // Allow anyway button
  allowBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
  },
  allowText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  // Back button
  backBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
  },
  // Minute picker
  pickerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  arrowBtn: {
    paddingVertical: 10,
    paddingHorizontal: 32,
  },
  arrowText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 20,
  },
  minuteDisplay: {
    alignItems: 'center',
    marginVertical: 8,
  },
  minuteNumber: {
    color: '#FFFFFF',
    fontSize: 72,
    fontWeight: '200',
    lineHeight: 80,
    fontVariant: ['tabular-nums'],
  },
  minuteLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    marginTop: -4,
  },
});
