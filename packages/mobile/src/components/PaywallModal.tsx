// ============================================================
// Focussive Mobile — Paywall Modal Component
// ============================================================

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSubscription, FALLBACK_PLANS, type FallbackPlan } from '@/context/SubscriptionContext';
import type { PurchasesPackage } from 'react-native-purchases';

export default function PaywallModal() {
  const theme = useTheme();
  const isDark = useIsDark();
  const {
    isPaywallVisible,
    closePaywall,
    packages,
    trialUsed,
    startTrial,
    purchasePackage,
    restorePurchases,
    isLoading,
  } = useSubscription();

  const [selectedPlanId, setSelectedPlanId] = useState<string>('focussive_annual_2999');

  if (!isPaywallVisible) return null;

  // Prefer RevenueCat packages if loaded, otherwise fallback to configured plans
  const hasRcPackages = packages && packages.length > 0;
  const annualRcPackage = packages.find(
    (p) => p.packageType === 'ANNUAL' || p.identifier.includes('annual')
  );
  const monthlyRcPackage = packages.find(
    (p) => p.packageType === 'MONTHLY' || p.identifier.includes('monthly')
  );

  const handleAction = async () => {
    if (!trialUsed) {
      // User is eligible for the 3-week free trial!
      await startTrial();
      return;
    }

    // Purchase selected plan
    if (hasRcPackages) {
      const selectedPkg =
        selectedPlanId.includes('annual')
          ? annualRcPackage || packages[0]
          : monthlyRcPackage || packages[1] || packages[0];
      if (selectedPkg) {
        await purchasePackage(selectedPkg);
      }
    } else {
      const fallback =
        FALLBACK_PLANS.find((p) => p.identifier === selectedPlanId) || FALLBACK_PLANS[0];
      await purchasePackage(fallback);
    }
  };

  return (
    <Modal
      visible={isPaywallVisible}
      animationType="slide"
      transparent
      onRequestClose={closePaywall}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.container,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {/* Header Close Bar */}
          <View style={styles.topBar}>
            <View
              style={[
                styles.badge,
                { backgroundColor: isDark ? 'rgba(139, 167, 148, 0.2)' : 'rgba(88, 112, 66, 0.15)' },
              ]}
            >
              <Ionicons name="sparkles" size={14} color={theme.accent} />
              <Text style={[styles.badgeText, { color: theme.accent }]}>FOCUSSIVE PRO</Text>
            </View>
            <TouchableOpacity
              onPress={closePaywall}
              style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              accessibilityLabel="Close Paywall"
            >
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Hero Section */}
            <View style={styles.hero}>
              <Text style={[styles.heroTitle, { color: theme.text }]}>
                Reclaim Your Time & Total Focus
              </Text>
              <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
                Unlock all blocking boundaries, unlimited groups, and lifetime productivity insights.
              </Text>
            </View>

            {/* Trial Banner */}
            {!trialUsed && (
              <View
                style={[
                  styles.trialBanner,
                  {
                    backgroundColor: isDark ? 'rgba(139, 167, 148, 0.15)' : 'rgba(88, 112, 66, 0.12)',
                    borderColor: theme.accent,
                  },
                ]}
              >
                <View style={styles.trialBannerIcon}>
                  <Ionicons name="gift-outline" size={24} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.trialBannerTitle, { color: theme.text }]}>
                    3-Week Free Trial Available!
                  </Text>
                  <Text style={[styles.trialBannerSubtitle, { color: theme.textSecondary }]}>
                    Experience full premium privileges for 21 days with no charge.
                  </Text>
                </View>
              </View>
            )}

            {/* Features List */}
            <View style={[styles.featureList, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)' }]}>
              <View style={styles.featureItem}>
                <View style={[styles.featureIconContainer, { backgroundColor: 'rgba(52, 199, 89, 0.15)' }]}>
                  <Ionicons name="apps" size={18} color="#34C759" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.featureTitle, { color: theme.text }]}>Unlimited App Groups</Text>
                  <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
                    Free tier: 2 groups, 3 apps max. Pro: Unlimited groups and apps.
                  </Text>
                </View>
              </View>

              <View style={styles.featureDivider} />

              <View style={styles.featureItem}>
                <View style={[styles.featureIconContainer, { backgroundColor: 'rgba(0, 122, 255, 0.15)' }]}>
                  <Ionicons name="globe-outline" size={18} color="#007AFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.featureTitle, { color: theme.text }]}>Unlimited Website Blocking</Text>
                  <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
                    Free tier: 2 groups, 3 sites max. Pro: Unlimited groups and websites.
                  </Text>
                </View>
              </View>

              <View style={styles.featureDivider} />

              <View style={styles.featureItem}>
                <View style={[styles.featureIconContainer, { backgroundColor: 'rgba(255, 149, 0, 0.15)' }]}>
                  <Ionicons name="infinite" size={18} color="#FF9500" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.featureTitle, { color: theme.text }]}>Lifetime Session History</Text>
                  <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
                    Free tier: 3 weeks history. Pro: Keep your full progress forever.
                  </Text>
                </View>
              </View>
            </View>

            {/* Plan Cards */}
            <View style={styles.planCardsContainer}>
              {/* Annual Plan */}
              <TouchableOpacity
                style={[
                  styles.planCard,
                  {
                    borderColor:
                      selectedPlanId.includes('annual') ? theme.accent : theme.border,
                    backgroundColor:
                      selectedPlanId.includes('annual')
                        ? isDark
                          ? 'rgba(139, 167, 148, 0.12)'
                          : 'rgba(88, 112, 66, 0.08)'
                        : isDark
                        ? 'rgba(0, 0, 0, 0.15)'
                        : 'rgba(255, 255, 255, 0.4)',
                  },
                ]}
                onPress={() => setSelectedPlanId('focussive_annual_2999')}
                activeOpacity={0.8}
              >
                <View style={styles.planCardHeader}>
                  <View style={styles.planCardRadio}>
                    <Ionicons
                      name={
                        selectedPlanId.includes('annual')
                          ? 'radio-button-on'
                          : 'radio-button-off'
                      }
                      size={20}
                      color={selectedPlanId.includes('annual') ? theme.accent : theme.textSecondary}
                    />
                    <Text style={[styles.planTitle, { color: theme.text }]}>Annual Plan</Text>
                  </View>
                  <View style={[styles.bestValueBadge, { backgroundColor: theme.accent }]}>
                    <Text style={styles.bestValueText}>Save 50%</Text>
                  </View>
                </View>

                <View style={styles.planPriceRow}>
                  <Text style={[styles.planPrice, { color: theme.text }]}>
                    {annualRcPackage ? annualRcPackage.product.priceString : '$29.99'}
                    <Text style={[styles.planPeriod, { color: theme.textSecondary }]}> / year</Text>
                  </Text>
                  <Text style={[styles.monthlyEquivalent, { color: theme.accent }]}>
                    $2.50 / month
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Monthly Plan */}
              <TouchableOpacity
                style={[
                  styles.planCard,
                  {
                    borderColor:
                      selectedPlanId.includes('monthly') ? theme.accent : theme.border,
                    backgroundColor:
                      selectedPlanId.includes('monthly')
                        ? isDark
                          ? 'rgba(139, 167, 148, 0.12)'
                          : 'rgba(88, 112, 66, 0.08)'
                        : isDark
                        ? 'rgba(0, 0, 0, 0.15)'
                        : 'rgba(255, 255, 255, 0.4)',
                  },
                ]}
                onPress={() => setSelectedPlanId('focussive_monthly_499')}
                activeOpacity={0.8}
              >
                <View style={styles.planCardHeader}>
                  <View style={styles.planCardRadio}>
                    <Ionicons
                      name={
                        selectedPlanId.includes('monthly')
                          ? 'radio-button-on'
                          : 'radio-button-off'
                      }
                      size={20}
                      color={selectedPlanId.includes('monthly') ? theme.accent : theme.textSecondary}
                    />
                    <Text style={[styles.planTitle, { color: theme.text }]}>Monthly Plan</Text>
                  </View>
                </View>

                <View style={styles.planPriceRow}>
                  <Text style={[styles.planPrice, { color: theme.text }]}>
                    {monthlyRcPackage ? monthlyRcPackage.product.priceString : '$4.99'}
                    <Text style={[styles.planPeriod, { color: theme.textSecondary }]}> / month</Text>
                  </Text>
                  <Text style={[styles.monthlyEquivalent, { color: theme.textSecondary }]}>
                    Billed monthly
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Main Action Button */}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.accent }]}
              onPress={handleAction}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.actionBtnText}>
                    {!trialUsed ? 'Start 3-Week Free Trial' : 'Subscribe Now'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>

            <Text style={[styles.disclaimer, { color: theme.textSecondary }]}>
              {!trialUsed
                ? 'Free for 21 days, then the selected plan begins. Cancel anytime.'
                : 'Payment will be charged through your app store account. Cancel anytime.'}
            </Text>

            {/* Secondary actions: Restore Purchases */}
            <View style={styles.footerRow}>
              <TouchableOpacity
                onPress={restorePurchases}
                style={styles.restoreBtn}
                disabled={isLoading}
              >
                <Text style={[styles.restoreBtnText, { color: theme.accent }]}>
                  Restore Purchases
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '92%',
    paddingBottom: 24,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  hero: {
    marginVertical: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginVertical: 12,
    gap: 12,
  },
  trialBannerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trialBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  trialBannerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  featureList: {
    borderRadius: 18,
    padding: 16,
    marginVertical: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  featureDivider: {
    height: 1,
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    marginVertical: 10,
  },
  featureIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  featureDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  planCardsContainer: {
    gap: 12,
    marginVertical: 14,
  },
  planCard: {
    borderRadius: 18,
    borderWidth: 2,
    padding: 16,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planCardRadio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  bestValueBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bestValueText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  planPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 10,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '800',
  },
  planPeriod: {
    fontSize: 13,
    fontWeight: '400',
  },
  monthlyEquivalent: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
  },
  footerRow: {
    alignItems: 'center',
    marginTop: 14,
  },
  restoreBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  restoreBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
