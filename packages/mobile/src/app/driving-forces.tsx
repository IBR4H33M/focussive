// ============================================================
// Focussive Mobile — Driving Forces Onboarding Screen
// Shown after email verification during signup, and
// accessible from Settings > Edit Profile > My Driving Forces.
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark } from '@/utils/theme';
import { userApi } from '@/utils/api';

// ─── Driving Forces definitions ──────────────────────────────

const DRIVING_FORCES: {
  key: string;
  title: string;
  subtitle: string;
}[] = [
  {
    key: 'deadlines',
    title: 'Deadlines',
    subtitle: 'Urgency gets me going',
  },
  {
    key: 'winning',
    title: 'Winning',
    subtitle: 'Beating my own records',
  },
  {
    key: 'social',
    title: 'People around me',
    subtitle: 'Working in company',
  },
  {
    key: 'streaks',
    title: 'Streaks',
    subtitle: 'Building habits daily',
  },
  {
    key: 'progress',
    title: 'Seeing progress',
    subtitle: 'Visual milestones',
  },
  {
    key: 'novelty',
    title: 'New ways to do things',
    subtitle: 'Discovery & curiosity',
  },
  {
    key: 'ambience',
    title: 'The right ambience',
    subtitle: 'Sound & environment',
  },
  {
    key: 'growth',
    title: 'Long-term growth',
    subtitle: 'Purpose-driven work',
  },
];

export default function DrivingForcesScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();

  // 'settings' = came from settings page, show Save button
  // anything else = signup flow, show Let's Go! button
  const isFromSettings = params.from === 'settings';

  const [selected, setSelected] = useState<string[]>([]);
  const [bigWhy, setBigWhy] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isFromSettings);

  // When coming from settings, pre-populate existing data
  useEffect(() => {
    if (!isFromSettings) return;
    (async () => {
      try {
        const profile = await userApi.getProfile() as any;
        if (Array.isArray(profile?.driving_forces)) {
          setSelected(profile.driving_forces);
        }
        if (profile?.big_why) {
          setBigWhy(profile.big_why);
        }
      } catch {
        // Fine — just start blank
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [isFromSettings]);

  function toggleForce(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleContinue() {
    setLoading(true);
    try {
      await userApi.updateProfile({
        driving_forces: selected,
        big_why: bigWhy.trim() || null,
      });

      if (isFromSettings) {
        Alert.alert('Saved', 'Your driving forces have been updated.');
        router.back();
      } else {
        // Continue signup flow → extension QR pairing
        router.replace('/(auth)/extension-qr' as never);
      }
    } catch (err: any) {
      Alert.alert(
        'Error',
        err?.message || 'Failed to save your preferences. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    if (isFromSettings) {
      router.back();
    } else {
      router.replace('/(auth)/extension-qr' as never);
    }
  }

  if (initialLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button (settings flow only) */}
        {isFromSettings && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={theme.textSecondary} />
            <Text style={[styles.backButtonText, { color: theme.textSecondary }]}>Back</Text>
          </TouchableOpacity>
        )}

        {/* Header */}
        <View style={[styles.header, !isFromSettings && { marginTop: 16 }]}>
          <Text style={[styles.title, { color: theme.text }]}>
            What gets your brain going?
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Pick everything that fits you.
          </Text>
        </View>

        {/* 2-column grid of force cards */}
        <View style={styles.grid}>
          {DRIVING_FORCES.map((force) => {
            const isActive = selected.includes(force.key);
            const activeBg = isDark ? '#3D5443' : theme.accent;
            const activeBorder = isDark ? '#55725D' : theme.accentDark;

            return (
              <TouchableOpacity
                key={force.key}
                style={[
                  styles.forceCard,
                  {
                    backgroundColor: isActive ? activeBg : theme.surface,
                    borderColor: isActive ? activeBorder : 'transparent',
                  },
                ]}
                onPress={() => toggleForce(force.key)}
                activeOpacity={0.75}
              >
                {/* Contrasted selection badge at top-right corner */}
                {isActive && (
                  <View
                    style={[
                      styles.checkmark,
                      { backgroundColor: '#FFFFFF' },
                    ]}
                  >
                    <Ionicons
                      name="checkmark"
                      size={12}
                      color={isDark ? '#27382B' : theme.accentDark}
                    />
                  </View>
                )}

                <Text
                  style={[
                    styles.forceTitle,
                    { color: isActive ? '#FFFFFF' : theme.text },
                  ]}
                  numberOfLines={2}
                >
                  {force.title}
                </Text>
                <Text
                  style={[
                    styles.forceSubtitle,
                    {
                      color: isActive
                        ? 'rgba(255, 255, 255, 0.88)'
                        : theme.textSecondary,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {force.subtitle}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Big Why question */}
        <View style={styles.bigWhySection}>
          <Text style={[styles.bigWhyLabel, { color: theme.text }]}>
            What are you working toward? (Optional)
          </Text>
          <Text style={[styles.bigWhyHint, { color: theme.textSecondary }]}>
            Your big why, in your own words.
          </Text>
          <TextInput
            style={[
              styles.bigWhyInput,
              {
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: bigWhy.trim() ? theme.accent : theme.border,
              },
            ]}
            placeholder="e.g. Finish my thesis, build my startup, be present for my family..."
            placeholderTextColor={theme.textSecondary}
            value={bigWhy}
            onChangeText={setBigWhy}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={280}
          />
          {bigWhy.length > 200 && (
            <Text
              style={[styles.charCount, { color: theme.textSecondary }]}
            >
              {280 - bigWhy.length} characters left
            </Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: theme.accentDark },
              loading && styles.btnDisabled,
            ]}
            onPress={handleContinue}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {isFromSettings ? 'Save' : "Let's Go"}
              </Text>
            )}
          </TouchableOpacity>

          {!isFromSettings && (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleSkip}
              activeOpacity={0.7}
            >
              <Text style={[styles.skipBtnText, { color: theme.textSecondary }]}>
                Skip for now
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 48,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginBottom: 24,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: '300',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },

  // Force grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  forceCard: {
    width: '47.5%',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    paddingRight: 28,
    paddingBottom: 16,
    position: 'relative',
    minHeight: 88,
    justifyContent: 'center',
  },
  checkmark: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forceTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 18,
  },
  forceSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },

  // Big Why
  bigWhySection: {
    marginBottom: 28,
    gap: 6,
  },
  bigWhyLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  bigWhyHint: {
    fontSize: 12,
    fontWeight: '400',
    marginBottom: 8,
  },
  bigWhyInput: {
    borderWidth: 2.5,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    fontWeight: '300',
    lineHeight: 20,
    minHeight: 90,
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },

  // Actions
  actions: {
    gap: 12,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
