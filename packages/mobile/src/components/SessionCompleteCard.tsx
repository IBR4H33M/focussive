// ============================================================
// Focussive Mobile — Session Complete Tier Roll Card
// ============================================================

import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark } from '@/utils/theme';
import { TIER_HERO_BADGES, type QualityTierInfo } from '@/utils/gamification';

interface SessionCompleteCardProps {
  visible: boolean;
  tier: QualityTierInfo | null;
  sessionName: string;
  durationMinutes: number;
  violationsBlocked: number;
  onDismiss: () => void;
  onViewBadges?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SessionCompleteCard({
  visible,
  tier,
  sessionName,
  durationMinutes,
  violationsBlocked,
  onDismiss,
  onViewBadges,
}: SessionCompleteCardProps) {
  const theme = useTheme();
  const isDark = useIsDark();

  if (!tier) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onDismiss}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#1E2235' : '#FFFFFF',
            },
          ]}
        >
          {/* Close button */}
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={16} color={theme.textSecondary} />
          </TouchableOpacity>

          {/* Tier Crest Emblem */}
          <View style={styles.emblemContainer}>
            <Image
              source={tier.heroImage || TIER_HERO_BADGES[tier.key]}
              style={styles.emblemImage}
              resizeMode="contain"
            />
          </View>

          {/* Tier Name */}
          <View style={[styles.tierBadge, { backgroundColor: `${tier.color}25` }]}>
            <Text style={[styles.tierBadgeText, { color: tier.color }]}>
              {tier.name.toUpperCase()} TIER
            </Text>
          </View>

          {/* Congratulatory Message */}
          <Text style={[styles.congratsMessage, { color: theme.text }]}>
            Congratulations! You just earned the{' '}
            <Text style={{ color: tier.color, fontWeight: '800' }}>
              "{tier.tagline}"
            </Text>{' '}
            badge! You finished{' '}
            <Text style={{ fontWeight: '700' }}>{sessionName}</Text>{' '}
            with {violationsBlocked === 0 ? 'Zero distractions' : `${violationsBlocked} distractions`} and on schedule!
          </Text>

          {/* Actions */}
          {onViewBadges && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: theme.border }]}
                onPress={() => {
                  onDismiss();
                  onViewBadges();
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
                  View in Badges
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: Math.min(SCREEN_WIDTH - 48, 360),
    borderRadius: 24,
    borderWidth: 0,
    padding: 24,
    paddingTop: 28,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  emblemContainer: {
    width: 96,
    height: 96,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emblemImage: {
    width: 92,
    height: 92,
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  tierBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  congratsMessage: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    paddingHorizontal: 6,
  },
  actions: {
    width: '100%',
    marginTop: 4,
  },
  secondaryBtn: {
    width: '100%',
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
