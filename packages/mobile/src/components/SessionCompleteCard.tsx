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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark } from '@/utils/theme';
import type { QualityTierInfo } from '@/utils/gamification';

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
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#1E2235' : '#FFFFFF',
              borderColor: `${tier.color}40`,
              shadowColor: tier.color,
            },
          ]}
        >
          {/* Subtle Top Glow / Accent */}
          <View style={[styles.topGlow, { backgroundColor: tier.color }]} />

          {/* Close button */}
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={16} color={theme.textSecondary} />
          </TouchableOpacity>

          {/* Subtitle / Eyebrow */}
          <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>
            SESSION COMPLETED
          </Text>

          {/* Tier Crest Emblem */}
          <View
            style={[
              styles.emblemContainer,
              {
                backgroundColor: tier.bgColor,
                borderColor: tier.borderColor,
              },
            ]}
          >
            <Ionicons
              name={tier.icon as any}
              size={42}
              color={tier.color}
            />
          </View>

          {/* Tier Name */}
          <View style={[styles.tierBadge, { backgroundColor: `${tier.color}25` }]}>
            <Text style={[styles.tierBadgeText, { color: tier.color }]}>
              {tier.name.toUpperCase()} TIER
            </Text>
          </View>

          <Text style={[styles.tagline, { color: theme.text }]}>
            {tier.tagline}
          </Text>

          <Text style={[styles.sessionMeta, { color: theme.textSecondary }]}>
            {sessionName} • {durationMinutes} mins
          </Text>

          {/* Performance Pill Row */}
          <View style={[styles.perfBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.03)' }]}>
            <View style={styles.perfItem}>
              <Ionicons
                name="shield-outline"
                size={14}
                color={violationsBlocked === 0 ? '#10B981' : theme.textSecondary}
              />
              <Text style={[styles.perfText, { color: theme.text }]}>
                {violationsBlocked === 0 ? 'Zero Distractions' : `${violationsBlocked} blocked`}
              </Text>
            </View>

            <View style={[styles.perfDivider, { backgroundColor: theme.border }]} />

            <View style={styles.perfItem}>
              <Ionicons name="checkmark-done" size={14} color="#10B981" />
              <Text style={[styles.perfText, { color: theme.text }]}>
                On Schedule
              </Text>
            </View>
          </View>

          {/* Badge added notice */}
          <View style={styles.addedNotice}>
            <Ionicons name="ribbon-outline" size={14} color={tier.color} />
            <Text style={[styles.addedNoticeText, { color: tier.color }]}>
              Automatically added to your profile badges
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: tier.color }]}
              onPress={onDismiss}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Collect Badge</Text>
            </TouchableOpacity>

            {onViewBadges && (
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
            )}
          </View>
        </View>
      </View>
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
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
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
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 16,
  },
  emblemContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
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
  tagline: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  sessionMeta: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 16,
  },
  perfBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
    gap: 12,
  },
  perfItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  perfDivider: {
    width: 1,
    height: 14,
  },
  perfText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  addedNoticeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  primaryBtn: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
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
