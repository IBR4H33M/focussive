// ============================================================
// Focussive Mobile — Paywall & Subscription Management Modal
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
  Image,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSubscription, FALLBACK_PLANS, type FallbackPlan } from '@/context/SubscriptionContext';
import type { PurchasesPackage } from 'react-native-purchases';

function formatSubscriptionDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Lifetime Access';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function calculateDaysRemaining(targetDateStr: string | null | undefined): number | null {
  if (!targetDateStr) return null;
  try {
    const target = new Date(targetDateStr).getTime();
    const now = Date.now();
    if (target <= now) return 0;
    return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
  } catch {
    return null;
  }
}

export default function PaywallModal() {
  const theme = useTheme();
  const isDark = useIsDark();
  const {
    isPremium,
    tier,
    status,
    isTrialActive,
    trialDaysRemaining,
    trialEndsAt,
    customerInfo,
    isPaywallVisible,
    closePaywall,
    packages,
    trialUsed,
    startTrial,
    purchasePackage,
    restorePurchases,
    isLoading,
  } = useSubscription();

  const [selectedPlanId, setSelectedPlanId] = useState<string>('focussive_annual_36');

  if (!isPaywallVisible) return null;

  // Active Entitlement Details
  const activeEntitlement =
    customerInfo?.entitlements.active['premium'] ||
    customerInfo?.entitlements.active['pro'] ||
    (customerInfo?.entitlements.active ? Object.values(customerInfo.entitlements.active)[0] : null) ||
    null;

  const isTrial = isTrialActive;

  let planTitle = 'Focussive Pro';
  if (isTrial) {
    planTitle = '21-Day Free Trial';
  } else if (activeEntitlement?.productIdentifier) {
    const pId = activeEntitlement.productIdentifier.toLowerCase();
    if (pId.includes('year') || pId.includes('annual')) {
      planTitle = 'Annual Plan';
    } else if (pId.includes('month')) {
      planTitle = 'Monthly Plan';
    } else {
      planTitle = 'Pro Plan';
    }
  }

  const expirationDateStr = isTrial ? trialEndsAt : activeEntitlement?.expirationDate;
  const formattedNextBilling = expirationDateStr
    ? formatSubscriptionDate(expirationDateStr)
    : isTrial
    ? 'End of trial period'
    : 'None (Lifetime Access)';

  let calculatedDaysRemaining: number | null = null;
  if (isTrial) {
    calculatedDaysRemaining = trialDaysRemaining;
  } else if (expirationDateStr) {
    calculatedDaysRemaining = calculateDaysRemaining(expirationDateStr);
  }

  const willRenew = isTrial ? false : (activeEntitlement?.willRenew ?? true);
  const storeName = Platform.OS === 'ios' ? 'Apple App Store' : 'Google Play Store';
  const managementUrl =
    customerInfo?.managementURL ||
    (Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions');

  const handleOpenStore = async () => {
    try {
      const canOpen = await Linking.canOpenURL(managementUrl);
      if (canOpen) {
        await Linking.openURL(managementUrl);
      } else {
        await Linking.openURL(
          Platform.OS === 'ios'
            ? 'https://apps.apple.com/account/subscriptions'
            : 'https://play.google.com/store/account/subscriptions'
        );
      }
    } catch {
      Alert.alert(
        'Manage Subscription',
        Platform.OS === 'ios'
          ? 'To manage or cancel your subscription, open iPhone Settings > Apple ID > Subscriptions.'
          : 'To manage or cancel your subscription, open the Google Play Store app > Profile > Payments & subscriptions > Subscriptions.'
      );
    }
  };

  const handleCancelSubscriptionPress = () => {
    Alert.alert(
      'Cancel Subscription',
      `Subscriptions are billed and managed securely through ${storeName}.\n\nOpening ${storeName} will allow you to cancel auto-renewal. Your Pro features will remain active until ${formattedNextBilling}.`,
      [
        { text: 'Keep Pro', style: 'cancel' },
        {
          text: `Manage on ${storeName.split(' ')[0]}`,
          style: 'destructive',
          onPress: handleOpenStore,
        },
      ]
    );
  };

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
                { backgroundColor: isDark ? 'rgba(212, 175, 55, 0.22)' : 'rgba(212, 175, 55, 0.15)' },
              ]}
            >
              <Image
                source={require('../../assets/pro_icon.png')}
                style={{ width: 14, height: 14, marginRight: 6 }}
                resizeMode="contain"
              />
              <Text style={[styles.badgeText, { color: isDark ? '#F5D77F' : '#854D0E' }]}>FOCUSSIVE PRO</Text>
            </View>
            <TouchableOpacity
              onPress={closePaywall}
              style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {isPremium ? (
              // ============================================
              // SUBSCRIBED USER: MANAGE SUBSCRIPTION VIEW
              // ============================================
              <>
                <View style={styles.hero}>
                  <Text style={[styles.heroTitle, { color: theme.text }]}>
                    Manage Subscription
                  </Text>
                  <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
                    You have full access to all Focussive Pro features and privileges.
                  </Text>
                </View>

                {/* Subscription Details Card */}
                <View
                  style={[
                    styles.manageCard,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : theme.border,
                    },
                  ]}
                >
                  <View style={styles.manageCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Image
                        source={require('../../assets/pro_icon.png')}
                        style={{ width: 18, height: 18 }}
                        resizeMode="contain"
                      />
                      <Text style={[styles.managePlanName, { color: theme.text }]}>
                        {planTitle}
                      </Text>
                    </View>
                    <View style={[styles.activeStatusPill, { backgroundColor: 'rgba(52, 199, 89, 0.15)' }]}>
                      <View style={styles.greenDot} />
                      <Text style={styles.activeStatusText}>
                        {isTrial ? 'Free Trial' : willRenew ? 'Active' : 'Cancels Soon'}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.manageDivider,
                      { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
                    ]}
                  />

                  {/* Key Detail Rows */}
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Current Tier</Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>Focussive Pro</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      {isTrial ? 'Trial Expiration' : willRenew ? 'Next Billing Date' : 'Access Expires'}
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>{formattedNextBilling}</Text>
                  </View>

                  {calculatedDaysRemaining !== null && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Remaining Time</Text>
                      <Text style={[styles.detailValue, { color: theme.accent, fontWeight: '700' }]}>
                        {calculatedDaysRemaining === 0 ? 'Last day today' : `${calculatedDaysRemaining} days remaining`}
                      </Text>
                    </View>
                  )}

                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Billed Via</Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {isTrial ? 'Free Trial' : storeName}
                    </Text>
                  </View>

                  <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Auto-Renewal</Text>
                    <Text
                      style={[
                        styles.detailValue,
                        { color: isTrial ? theme.textSecondary : willRenew ? '#34C759' : theme.danger },
                      ]}
                    >
                      {isTrial ? 'Off (Trial)' : willRenew ? 'On (Renews automatically)' : 'Off (Will not renew)'}
                    </Text>
                  </View>
                </View>

                {/* If on Trial: Option to lock in discounted annual plan */}
                {isTrial && (
                  <TouchableOpacity
                    style={[styles.upgradeTrialBtn, { backgroundColor: '#D4AF37' }]}
                    onPress={async () => {
                      const annualPkg =
                        packages.find(
                          (p) => p.packageType === 'ANNUAL' || p.identifier.includes('annual')
                        ) || packages[0];
                      if (annualPkg) {
                        await purchasePackage(annualPkg);
                      } else {
                        const fallback = FALLBACK_PLANS[0];
                        await purchasePackage(fallback);
                      }
                    }}
                    disabled={isLoading}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.upgradeTrialBtnText}>
                      Upgrade to Annual Plan ($36/yr • Save 40%)
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Active Privileges Summary */}
                <View
                  style={[
                    styles.privilegesCard,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.privilegesHeader, { color: theme.textSecondary }]}>
                    YOUR ACTIVE PRO PRIVILEGES
                  </Text>
                  <View style={styles.privilegeItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                    <Text style={[styles.privilegeText, { color: theme.text }]}>Unlimited App Groups & Apps</Text>
                  </View>
                  <View style={styles.privilegeItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                    <Text style={[styles.privilegeText, { color: theme.text }]}>Unlimited Website Blocking Groups</Text>
                  </View>
                  <View style={styles.privilegeItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                    <Text style={[styles.privilegeText, { color: theme.text }]}>Full Lifetime Session History & Analytics</Text>
                  </View>
                  <View style={styles.privilegeItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                    <Text style={[styles.privilegeText, { color: theme.text }]}>Custom Notification Tones (Zen Bell, Kalimba)</Text>
                  </View>
                  <View style={styles.privilegeItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                    <Text style={[styles.privilegeText, { color: theme.text }]}>100% Ad-Free Experience</Text>
                  </View>
                  <View style={styles.privilegeItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                    <Text style={[styles.privilegeText, { color: theme.text }]}>Chrome Extension Sync</Text>
                  </View>
                </View>

                {/* Store Management & Cancellation */}
                <View
                  style={[
                    styles.storeManageCard,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.storeManageTitle, { color: theme.text }]}>
                    Subscription Billing
                  </Text>
                  <Text style={[styles.storeManageDesc, { color: theme.textSecondary }]}>
                    {Platform.OS === 'ios'
                      ? 'Apple manages all iOS App Store subscriptions securely. You can update payment methods, change plans, or cancel auto-renewal in Apple ID settings.'
                      : 'Google Play manages all Android subscriptions securely. You can switch plans, update payment methods, or cancel auto-renewal anytime in Google Play Store settings.'}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.manageStoreBtn,
                      {
                        borderColor: theme.accent,
                        backgroundColor: isDark ? 'rgba(139, 167, 148, 0.12)' : 'rgba(88, 112, 66, 0.08)',
                      },
                    ]}
                    onPress={handleOpenStore}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="open-outline" size={18} color={theme.accent} />
                    <Text style={[styles.manageStoreBtnText, { color: theme.accent }]}>
                      Manage on {storeName.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cancelLinkBtn}
                    onPress={handleCancelSubscriptionPress}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.cancelLinkText, { color: theme.danger }]}>
                      Cancel Subscription
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Restore Purchases */}
                <View style={styles.footerRow}>
                  <TouchableOpacity
                    onPress={restorePurchases}
                    style={styles.restoreBtn}
                    disabled={isLoading}
                  >
                    <Text style={[styles.restoreBtnText, { color: theme.textSecondary }]}>
                      {isLoading ? 'Checking Purchases...' : 'Restore Purchases'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              // ============================================
              // UNSUBSCRIBED USER: PAYWALL & PRICING
              // ============================================
              <>
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
                <View
                  style={[
                    styles.featureList,
                    { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)' },
                  ]}
                >
                  <View style={styles.featureItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featureTitle, { color: theme.text }]}>Unlimited App Groups</Text>
                      <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
                        Free tier: 2 groups, 3 apps max. Pro: Unlimited groups and apps.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.featureDivider} />

                  <View style={styles.featureItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featureTitle, { color: theme.text }]}>Unlimited Website Blocking</Text>
                      <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
                        Free tier: 2 groups, 3 sites max. Pro: Unlimited groups and websites.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.featureDivider} />

                  <View style={styles.featureItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featureTitle, { color: theme.text }]}>Lifetime Session History</Text>
                      <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
                        Free tier: 3 weeks history. Pro: Keep your full progress forever.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.featureDivider} />

                  <View style={styles.featureItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featureTitle, { color: theme.text }]}>Block Screen Images & GIFs</Text>
                      <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
                        Personalize your block screen with curated presets or custom images.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.featureDivider} />

                  <View style={styles.featureItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featureTitle, { color: theme.text }]}>No Ads</Text>
                      <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>
                        Free tier: Contains banner ads. Pro: 100% ad-free experience.
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
                    onPress={() => setSelectedPlanId('focussive_annual_36')}
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
                        <Text style={styles.bestValueText}>Save 40%</Text>
                      </View>
                    </View>

                    <View style={styles.planPriceRow}>
                      <Text style={[styles.planPrice, { color: theme.text }]}>
                        {annualRcPackage ? annualRcPackage.product.priceString : '$36'}
                        <Text style={[styles.planPeriod, { color: theme.textSecondary }]}> / year</Text>
                      </Text>
                      <Text style={[styles.monthlyEquivalent, { color: theme.accent }]}>
                        $3.00 / month
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
                    onPress={() => setSelectedPlanId('focussive_monthly_5')}
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
                        {monthlyRcPackage ? monthlyRcPackage.product.priceString : '$5'}
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
                  style={[styles.actionBtn, { backgroundColor: '#D4AF37' }]}
                  onPress={handleAction}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#4A3600" size="small" />
                  ) : (
                    <Text style={[styles.actionBtnText, { color: '#4A3600' }]}>
                      {!trialUsed ? 'Start 3-Week Free Trial' : 'Subscribe Now'}
                    </Text>
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
              </>
            )}
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
    color: '#4A3600',
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
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  restoreBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Subscribed / Manage Subscription Styles
  manageCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginVertical: 12,
  },
  manageCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  managePlanName: {
    fontSize: 17,
    fontWeight: '700',
  },
  activeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34C759',
  },
  activeStatusText: {
    color: '#34C759',
    fontSize: 12,
    fontWeight: '700',
  },
  manageDivider: {
    height: 1,
    marginVertical: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.15)',
  },
  detailLabel: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  upgradeTrialBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  upgradeTrialBtnText: {
    color: '#4A3600',
    fontSize: 14.5,
    fontWeight: '700',
  },
  privilegesCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginVertical: 8,
  },
  privilegesHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  privilegeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  privilegeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  storeManageCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginVertical: 10,
  },
  storeManageTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  storeManageDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 14,
  },
  manageStoreBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  manageStoreBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  cancelLinkBtn: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  cancelLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
