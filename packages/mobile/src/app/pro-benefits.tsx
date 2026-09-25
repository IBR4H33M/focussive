// ============================================================
// Focussive Mobile — Pro Benefits & Feature Comparison Screen
// ============================================================

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSubscription } from '@/context/SubscriptionContext';

interface ComparisonRow {
  feature: string;
  free: string;
  premium: string;
  isDifferent?: boolean;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: 'App Groups',
    free: '2 groups max',
    premium: 'Unlimited',
    isDifferent: true,
  },
  {
    feature: 'Apps per Group',
    free: 'Max 3 apps per group',
    premium: 'Unlimited',
    isDifferent: true,
  },
  {
    feature: 'Website Groups',
    free: 'Max 2 groups',
    premium: 'Unlimited',
    isDifferent: true,
  },
  {
    feature: 'Websites per Group',
    free: 'Max 3 websites per group',
    premium: 'Unlimited',
    isDifferent: true,
  },
  {
    feature: 'Session History Retention',
    free: '21 days (3 weeks)',
    premium: 'Lifetime (Forever)',
    isDifferent: true,
  },
  {
    feature: 'Analytics & Trends',
    free: 'Day & Week views (≤ 21 days)',
    premium: 'Full Month & Year views, all-time trends',
    isDifferent: true,
  },
  {
    feature: 'Browser monitor',
    free: 'Included',
    premium: 'Included',
    isDifferent: false,
  },
  {
    feature: 'Block overlay images',
    free: 'None',
    premium: 'All, including custom',
    isDifferent: true,
  },
];

export default function ProBenefitsScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isPremium, openPaywall } = useSubscription();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header Bar */}
      <View style={[styles.headerBar, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Pro Benefits</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 90, 110) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroBox}>
          <View style={styles.proCrownBadge}>
            <Ionicons name="sparkles" size={16} color="#D4AF37" />
            <Text style={styles.proCrownText}>PLAN COMPARISON</Text>
          </View>
          <Text style={[styles.heroHeading, { color: theme.text }]}>
            Free vs. Premium
          </Text>
          <Text style={[styles.heroSubheading, { color: theme.textSecondary }]}>
            Compare features across tiers and unlock maximum productivity with Focussive Pro.
          </Text>
        </View>

        {/* Comparison Table Card */}
        <View style={[styles.tableCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Table Header */}
          <View style={[styles.tableHeaderRow, { borderBottomColor: theme.border, backgroundColor: isDark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.03)' }]}>
            <View style={styles.colFeature}>
              <Text style={[styles.tableHeaderTitle, { color: theme.textSecondary }]}>FEATURE</Text>
            </View>
            <View style={styles.colTier}>
              <Text style={[styles.tableHeaderTitle, { color: theme.textSecondary }]}>FREE</Text>
            </View>
            <View style={[styles.colTier, styles.colPremiumHeader]}>
              <View style={styles.premiumHeaderBadge}>
                <Ionicons name="star" size={10} color="#FFFFFF" />
                <Text style={styles.premiumHeaderText}>PREMIUM</Text>
              </View>
            </View>
          </View>

          {/* Table Rows */}
          {COMPARISON_ROWS.map((row, index) => {
            const isLast = index === COMPARISON_ROWS.length - 1;
            return (
              <View
                key={row.feature}
                style={[
                  styles.tableRow,
                  !isLast && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
                  index % 2 === 1 && { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' },
                ]}
              >
                {/* Feature Column */}
                <View style={styles.colFeature}>
                  <Text style={[styles.featureName, { color: theme.text }]}>{row.feature}</Text>
                </View>

                {/* Free Column */}
                <View style={styles.colTier}>
                  <Text style={[styles.cellText, { color: theme.textSecondary }]}>{row.free}</Text>
                </View>

                {/* Premium Column */}
                <View style={styles.colTier}>
                  <Text
                    style={[
                      styles.cellText,
                      styles.cellTextPremium,
                      { color: row.isDifferent ? '#D4AF37' : theme.text },
                    ]}
                  >
                    {row.premium}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Feature Highlights Cards */}
        <View style={styles.highlightsContainer}>
          <Text style={[styles.highlightsHeading, { color: theme.textSecondary }]}>
            WHY UPGRADE TO PRO?
          </Text>

          <View style={[styles.highlightCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.highlightIcon, { backgroundColor: 'rgba(212, 175, 55, 0.15)' }]}>
              <Ionicons name="infinite" size={20} color="#D4AF37" />
            </View>
            <View style={styles.highlightInfo}>
              <Text style={[styles.highlightTitle, { color: theme.text }]}>No Group or App Limits</Text>
              <Text style={[styles.highlightDesc, { color: theme.textSecondary }]}>
                Group work, study, gaming, and social apps without any restriction on group size or app count.
              </Text>
            </View>
          </View>

          <View style={[styles.highlightCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.highlightIcon, { backgroundColor: 'rgba(212, 175, 55, 0.15)' }]}>
              <Ionicons name="calendar-outline" size={20} color="#D4AF37" />
            </View>
            <View style={styles.highlightInfo}>
              <Text style={[styles.highlightTitle, { color: theme.text }]}>Lifetime History & Full Trends</Text>
              <Text style={[styles.highlightDesc, { color: theme.textSecondary }]}>
                Free tier caps history at 21 days. Pro keeps every single completed session and unlocked milestone forever.
              </Text>
            </View>
          </View>

          <View style={[styles.highlightCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.highlightIcon, { backgroundColor: 'rgba(212, 175, 55, 0.15)' }]}>
              <Ionicons name="image-outline" size={20} color="#D4AF37" />
            </View>
            <View style={styles.highlightInfo}>
              <Text style={[styles.highlightTitle, { color: theme.text }]}>Custom Blocker Overlay Images</Text>
              <Text style={[styles.highlightDesc, { color: theme.textSecondary }]}>
                Personalize your screen blocker overlay with motivational presets or custom images from your gallery.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Bottom Upgrade CTA */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: theme.background,
            borderTopColor: theme.border,
            paddingBottom: Math.max(insets.bottom + 8, 16),
          },
        ]}
      >
        {isPremium ? (
          <View style={[styles.proActiveBanner, { backgroundColor: 'rgba(212, 175, 55, 0.15)' }]}>
            <Ionicons name="checkmark-circle" size={20} color="#D4AF37" />
            <Text style={styles.proActiveBannerText}>You are enjoying Focussive Pro</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.upgradeCtaBtn, { backgroundColor: '#D4AF37' }]}
            onPress={() => openPaywall('pro_benefits')}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
            <Text style={styles.upgradeCtaBtnText}>Upgrade to Pro</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  heroBox: {
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  proCrownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    marginBottom: 10,
  },
  proCrownText: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  heroHeading: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  heroSubheading: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: 320,
  },

  // Table Card
  tableCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  tableHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  colFeature: {
    flex: 1.3,
    paddingRight: 6,
  },
  colTier: {
    flex: 1,
    paddingHorizontal: 4,
  },
  colPremiumHeader: {
    alignItems: 'flex-start',
  },
  premiumHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  premiumHeaderText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  featureName: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  cellText: {
    fontSize: 12,
    lineHeight: 16,
  },
  cellTextPremium: {
    fontWeight: '700',
  },

  // Highlights
  highlightsContainer: {
    gap: 12,
  },
  highlightsHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  highlightIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  highlightInfo: {
    flex: 1,
  },
  highlightTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  highlightDesc: {
    fontSize: 12,
    lineHeight: 17,
  },

  // Bottom Floating Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  upgradeCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  upgradeCtaBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  proActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 10,
  },
  proActiveBannerText: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '700',
  },
});
