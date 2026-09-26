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
import { resolveBlockImageSource } from '@/utils/blockImages';

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
          const isUserPremium = data.subscription_tier === 'premium' && (data.subscription_status === 'active' || data.subscription_status === 'trial');
          if (typeof data.overlay_gif_enabled === 'boolean') {
            setGifEnabled(data.overlay_gif_enabled && isUserPremium);
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
              <Text style={styles.title}>You are distracted!</Text>
              <Text style={[styles.subtitle, { marginBottom: 16 }]}>
                You're using {name} during a focus session
              </Text>

              {/* Block screen image if enabled */}
              {gifEnabled && resolveBlockImageSource(gifUrl) ? (
                <Image
                  source={resolveBlockImageSource(gifUrl)!}
                  style={styles.overlayGif}
                  resizeMode="contain"
                />
              ) : null}

              {/* Motivational Quote if enabled */}
              {quoteEnabled && quote ? (() => {
                const parts = quote.includes(' — ')
                  ? quote.split(' — ')
                  : quote.includes(' —')
                  ? quote.split(' —')
                  : quote.includes(' - ')
                  ? quote.split(' - ')
                  : [quote];
                const body = parts[0]?.trim() || '';
                const author = parts.length > 1 ? `— ${parts[1]?.trim()}` : null;
                return (
                  <View style={styles.quoteContainer}>
                    <Text style={styles.quoteBodyText}>{body}</Text>
                    {author ? (
                      <Text style={styles.quoteAuthorText}>{author}</Text>
                    ) : null}
                  </View>
                );
              })() : (
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
              <Text style={[styles.subtitle, { lineHeight: 18, marginBottom: 20 }]}>
                {'Even machines need to cool down.\n\nNo violations tracked during breaks.\nCome back when you\'re ready.'}
              </Text>

              <View style={styles.pickerContainer}>
                <Pressable
                  style={styles.arrowBtn}
                  onPress={() => setBreakMinutes(m => Math.min(m + 1, breakMaxMinutes))}
                >
                  <Text style={[styles.arrowText, { color: '#2F3456' }]}>▲</Text>
                </Pressable>

                <View style={styles.minuteDisplay}>
                  <Text style={[styles.minuteNumber, { color: '#2F3456' }]}>{breakMinutes}</Text>
                  <Text style={[styles.minuteLabel, { color: '#2F3456' }]}>{breakMinutes === 1 ? 'minute' : 'minutes'}</Text>
                </View>

                <Pressable
                  style={styles.arrowBtn}
                  onPress={() => setBreakMinutes(m => Math.max(m - 1, 1))}
                >
                  <Text style={[styles.arrowText, { color: '#2F3456' }]}>▼</Text>
                </Pressable>
              </View>

              <View style={styles.buttons}>
                <TouchableOpacity
                  style={[styles.breakBtn, { backgroundColor: '#1A1A1A', borderColor: 'rgba(255,255,255,0.25)' }]}
                  onPress={handleTakeBreakConfirm}
                  activeOpacity={0.8}
                >
                  <Text style={styles.breakBtnText}>Start {breakMinutes} minute break</Text>
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
  quoteContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  quoteBodyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFD166',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 26,
    marginBottom: 6,
  },
  quoteAuthorText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#FFD166',
    textAlign: 'center',
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  // Break button (active) — same color as exit app button
  breakBtn: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
  },
  breakBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  breakSubtext: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 3,
  },
  // Break button (disabled)
  breakBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
  },
  breakBtnDisabledText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    fontWeight: '400',
  },
  // Allow anyway button
  allowBtn: {
    backgroundColor: '#3A0A0A',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CC4444',
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
    color: '#FFFFFF',
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
