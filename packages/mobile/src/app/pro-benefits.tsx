// ============================================================
// Focussive Mobile — Free vs Pro Comparison Screen
// ============================================================

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSubscription } from '@/context/SubscriptionContext';

interface ComparisonRow {
  feature: string;
  free: string;
  pro: string;
  isDifferent?: boolean;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: 'App Groups',
    free: '2 groups max',
    pro: 'Unlimited',
    isDifferent: true,
  },
  {
    feature: 'Apps per Group',
    free: 'Max 3 apps per group',
    pro: 'Unlimited',
    isDifferent: true,
  },
  {
    feature: 'Website Groups',
    free: 'Max 2 groups',
    pro: 'Unlimited',
    isDifferent: true,
  },
  {
    feature: 'Websites per Group',
    free: 'Max 3 websites per group',
    pro: 'Unlimited',
    isDifferent: true,
  },
  {
    feature: 'Session History Retention',
    free: '21 days (3 weeks)',
    pro: 'Lifetime',
    isDifferent: true,
  },
  {
    feature: 'Analytics & Trends',
    free: 'Day & Week views (≤ 21 days)',
    pro: 'Full Month & Year views, all-time trends',
    isDifferent: true,
  },
  {
    feature: 'Browser monitor',
    free: 'Included',
    pro: 'Included',
    isDifferent: false,
  },
  {
    feature: 'Block overlay images',
    free: 'None',
    pro: 'All, including custom',
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
        <View style={{ flex: 1 }} />
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 90, 110) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section — Title: "Free vs Pro" with pro_icon instead of star */}
        <View style={styles.heroBox}>
          <Image
            source={require('../../assets/pro_icon.png')}
            style={styles.heroProIcon}
            resizeMode="contain"
          />
          <Text style={[styles.heroHeading, { color: theme.text }]}>
            Free vs Pro
          </Text>
        </View>

        {/* Feature Highlights Section (Moved UP, single container, no icons) */}
        <View style={styles.highlightsContainer}>
          <Text style={[styles.highlightsHeading, { color: theme.textSecondary }]}>
            WHY UPGRADE TO PRO?
          </Text>

          <View style={[styles.highlightsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.highlightItem}>
              <Text style={[styles.highlightTitle, { color: theme.text }]}>No Group or App Limits</Text>
              <Text style={[styles.highlightDesc, { color: theme.textSecondary }]}>
                Group work, study, gaming, and social apps without any restriction on group size or app count.
              </Text>
            </View>

            <View style={[styles.itemDivider, { backgroundColor: theme.border }]} />

            <View style={styles.highlightItem}>
              <Text style={[styles.highlightTitle, { color: theme.text }]}>Lifetime History & Full Trends</Text>
              <Text style={[styles.highlightDesc, { color: theme.textSecondary }]}>
                Free tier caps history at 21 days. Pro keeps every single completed session and unlocked milestone.
              </Text>
            </View>

            <View style={[styles.itemDivider, { backgroundColor: theme.border }]} />

            <View style={styles.highlightItem}>
              <Text style={[styles.highlightTitle, { color: theme.text }]}>Custom Blocker Overlay Images</Text>
              <Text style={[styles.highlightDesc, { color: theme.textSecondary }]}>
                Personalize your screen blocker overlay with motivational presets or custom images from your gallery.
              </Text>
            </View>

            <View style={[styles.itemDivider, { backgroundColor: theme.border }]} />

            <View style={styles.highlightItem}>
              <Text style={[styles.highlightTitle, { color: theme.text }]}>Support the Mission</Text>
              <Text style={[styles.highlightDesc, { color: theme.textSecondary }]}>
                It will help me keep up the good work, ultimately helping you and lots of other people stay more focused and productive :)
              </Text>
            </View>
          </View>
        </View>

        {/* Comparison Table Card (Below Why Upgrade to Pro) */}
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
              <View style={[styles.proHeaderBadge, { backgroundColor: '#D4AF37' }]}>
                <Image
                  source={require('../../assets/pro_icon.png')}
                  style={styles.headerBadgeIcon}
                  resizeMode="contain"
                />
                <Text style={[styles.proHeaderText, { color: '#877023' }]}>PRO</Text>
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

                {/* Pro Column */}
                <View style={styles.colTier}>
                  <Text
                    style={[
                      styles.cellText,
                      styles.cellTextPremium,
                      { color: row.isDifferent ? '#D4AF37' : theme.text },
                    ]}
                  >
                    {row.pro}
                  </Text>
                </View>
              </View>
            );
          })}
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
            <Image
              source={require('../../assets/pro_icon.png')}
              style={{ width: 18, height: 18, marginRight: 6 }}
              resizeMode="contain"
            />
            <Text style={styles.proActiveBannerText}>You are enjoying Focussive Pro</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.upgradeCtaBtn, { backgroundColor: '#D4AF37' }]}
            onPress={() => openPaywall('pro_benefits')}
            activeOpacity={0.85}
          >
            <Image
              source={require('../../assets/pro_icon.png')}
              style={{ width: 18, height: 18, marginRight: 6 }}
              resizeMode="contain"
            />
            <Text style={[styles.upgradeCtaBtnText, { color: '#877023' }]}>Upgrade to Pro</Text>
            <Ionicons name="arrow-forward" size={18} color="#877023" style={{ marginLeft: 4 }} />
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
    paddingBottom: 6,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  heroBox: {
    alignItems: 'center',
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  heroProIcon: {
    width: 44,
    height: 44,
    marginBottom: 10,
  },
  heroHeading: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
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
  proHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  headerBadgeIcon: {
    width: 12,
    height: 12,
  },
  proHeaderText: {
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
    marginBottom: 20,
  },
  highlightsHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  highlightsCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 6,
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
  highlightItem: {
    paddingVertical: 12,
  },
  highlightTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  highlightDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  itemDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
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
    gap: 6,
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
    fontSize: 15,
    fontWeight: '800',
  },
  proActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
  },
  proActiveBannerText: {
    color: '#877023',
    fontSize: 14,
    fontWeight: '700',
  },
});
