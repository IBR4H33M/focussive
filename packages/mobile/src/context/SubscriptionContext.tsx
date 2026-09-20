// ============================================================
// Focussive Mobile — Subscription Context (RevenueCat + Supabase)
// ============================================================

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { Platform, Alert } from 'react-native';
import Purchases, {
  type PurchasesPackage,
  type CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import Constants from 'expo-constants';
import { subscriptionApi, ApiError } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import type { SubscriptionTier, SubscriptionStatus } from '@focussive/shared';

// Fallback pricing configuration when RevenueCat offerings aren't configured yet
export interface FallbackPlan {
  identifier: string;
  title: string;
  priceString: string;
  period: 'monthly' | 'annual';
  monthlyEquivalent?: string;
  badge?: string;
}

export const FALLBACK_PLANS: FallbackPlan[] = [
  {
    identifier: 'focussive_annual_36',
    title: 'Annual Plan',
    priceString: '$36/year',
    period: 'annual',
    monthlyEquivalent: '$3.00/month',
    badge: 'Best Value • Save 40%',
  },
  {
    identifier: 'focussive_monthly_5',
    title: 'Monthly Plan',
    priceString: '$5/month',
    period: 'monthly',
  },
];

export interface SubscriptionContextType {
  isPremium: boolean;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  isTrialActive: boolean;
  trialDaysRemaining: number;
  trialUsed: boolean;
  trialEndsAt: string | null;
  packages: PurchasesPackage[];
  isLoading: boolean;
  isPaywallVisible: boolean;
  paywallSource: string | null;
  openPaywall: (source?: string) => void;
  closePaywall: () => void;
  startTrial: () => Promise<boolean>;
  purchasePackage: (pkg: PurchasesPackage | FallbackPlan) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

const REVENUECAT_PUBLIC_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_KEY ||
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.revenuecatPublicKey ||
  'test_MuSObdIzFoUVskINilLfIZiqRZT';

const REVENUECAT_APPLE_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY ||
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.revenuecatAppleKey ||
  REVENUECAT_PUBLIC_KEY;

const REVENUECAT_GOOGLE_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY ||
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.revenuecatGoogleKey ||
  REVENUECAT_PUBLIC_KEY;

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();

  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [isTrialActive, setIsTrialActive] = useState<boolean>(false);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number>(0);
  const [trialUsed, setTrialUsed] = useState<boolean>(false);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPaywallVisible, setIsPaywallVisible] = useState<boolean>(false);
  const [paywallSource, setPaywallSource] = useState<string | null>(null);
  const [isRcInitialized, setIsRcInitialized] = useState<boolean>(false);

  // Initialize RevenueCat SDK
  useEffect(() => {
    async function initRevenueCat() {
      try {
        if (Platform.OS === 'web') return;

        const apiKey =
          Platform.OS === 'ios'
            ? REVENUECAT_APPLE_KEY || REVENUECAT_PUBLIC_KEY
            : REVENUECAT_GOOGLE_KEY || REVENUECAT_PUBLIC_KEY;

        if (!apiKey) {
          console.warn(
            `[RevenueCat] Missing API Key. Set EXPO_PUBLIC_REVENUECAT_PUBLIC_KEY in your .env`
          );
          return;
        }

        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        await Purchases.configure({ apiKey });
        setIsRcInitialized(true);

        // Fetch current offerings
        try {
          const offerings = await Purchases.getOfferings();
          if (offerings.current && offerings.current.availablePackages.length > 0) {
            setPackages(offerings.current.availablePackages);
          }
        } catch (offeringsErr) {
          console.warn('[RevenueCat] Could not fetch offerings:', offeringsErr);
        }
      } catch (err) {
        console.warn('[RevenueCat] Initialization failed:', err);
      }
    }

    initRevenueCat();
  }, []);

  // Sync user with RevenueCat and backend subscription status
  const refreshSubscription = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setTier('free');
      setStatus('active');
      setIsTrialActive(false);
      setTrialDaysRemaining(0);
      setTrialUsed(false);
      setTrialEndsAt(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // 1. Identify user with RevenueCat if initialized
      if (isRcInitialized && user.id) {
        try {
          const { customerInfo } = await Purchases.logIn(user.id);
          const hasRcPremium =
            customerInfo.entitlements.active['premium'] !== undefined ||
            customerInfo.entitlements.active['pro'] !== undefined;

          if (hasRcPremium) {
            // Inform backend of active store entitlement
            await subscriptionApi.sync({
              revenuecat_customer_id: customerInfo.originalAppUserId,
              tier: 'premium',
              status: 'active',
            });
          }
        } catch (rcLoginErr) {
          console.warn('[RevenueCat] logIn error:', rcLoginErr);
        }
      }

      // 2. Fetch ground-truth subscription status from backend
      const res = await subscriptionApi.getStatus();
      setTier(res.tier);
      setStatus(res.status);
      setTrialUsed(res.trial_used);
      setTrialEndsAt(res.trial_ends_at ?? null);
      setTrialDaysRemaining(res.trial_days_remaining);
      setIsTrialActive(res.tier === 'premium' && res.status === 'trial');
    } catch (err) {
      console.warn('[Subscription] Refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user, isRcInitialized]);

  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  // Handle paywall open / close
  const openPaywall = useCallback((source?: string) => {
    setPaywallSource(source || null);
    setIsPaywallVisible(true);
  }, []);

  const closePaywall = useCallback(() => {
    setIsPaywallVisible(false);
    setPaywallSource(null);
  }, []);

  // Start 3-Week Free Trial
  const startTrial = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      const res = await subscriptionApi.startTrial();
      setTier(res.tier);
      setStatus(res.status);
      setTrialUsed(res.trial_used);
      setTrialEndsAt(res.trial_ends_at ?? null);
      setTrialDaysRemaining(res.trial_days_remaining);
      setIsTrialActive(true);

      Alert.alert(
        'Trial Activated! 🎉',
        'Your 3-week free trial has begun. Enjoy unlimited app groups, website blocking groups, and full session history!',
        [{ text: 'Awesome', onPress: () => closePaywall() }]
      );
      return true;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not activate trial. Please try again.';
      Alert.alert('Unable to Start Trial', msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [closePaywall]);

  // Purchase Package via RevenueCat
  const purchasePackage = useCallback(
    async (pkg: PurchasesPackage | FallbackPlan): Promise<boolean> => {
      try {
        setIsLoading(true);

        if (!isRcInitialized) {
          // If RevenueCat is not yet configured with native store keys, provide friendly notification
          Alert.alert(
            'RevenueCat Setup Required',
            'In-app purchases require RevenueCat API keys and app store products configured in your developer portal. To test full premium capabilities right now, you can activate the 3-week free trial!'
          );
          return false;
        }

        if ('packageType' in pkg) {
          const { customerInfo } = await Purchases.purchasePackage(pkg as PurchasesPackage);
          const hasPremium =
            customerInfo.entitlements.active['premium'] !== undefined ||
            customerInfo.entitlements.active['pro'] !== undefined;

          if (hasPremium) {
            await subscriptionApi.sync({
              revenuecat_customer_id: customerInfo.originalAppUserId,
              tier: 'premium',
              status: 'active',
            });
            await refreshSubscription();
            Alert.alert('Subscribed! 🚀', 'Welcome to Focussive Premium!');
            closePaywall();
            return true;
          }
        }
        return false;
      } catch (err: any) {
        if (!err.userCancelled) {
          Alert.alert('Purchase Error', err.message || 'Payment could not be completed.');
        }
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [isRcInitialized, refreshSubscription, closePaywall]
  );

  // Restore Purchases
  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      if (!isRcInitialized) {
        Alert.alert('Restore Purchases', 'No purchases found for this account.');
        return false;
      }
      const customerInfo: CustomerInfo = await Purchases.restorePurchases();
      const hasPremium =
        customerInfo.entitlements.active['premium'] !== undefined ||
        customerInfo.entitlements.active['pro'] !== undefined;

      if (hasPremium) {
        await subscriptionApi.sync({
          revenuecat_customer_id: customerInfo.originalAppUserId,
          tier: 'premium',
          status: 'active',
        });
        await refreshSubscription();
        Alert.alert('Purchases Restored', 'Your premium subscription has been successfully restored!');
        closePaywall();
        return true;
      } else {
        Alert.alert('Restore Purchases', 'No active premium subscription was found on this store account.');
        return false;
      }
    } catch (err: any) {
      Alert.alert('Restore Failed', err.message || 'Unable to restore purchases at this time.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isRcInitialized, refreshSubscription, closePaywall]);

  const isPremium = useMemo(() => {
    return tier === 'premium' && (status === 'active' || status === 'trial');
  }, [tier, status]);

  return (
    <SubscriptionContext.Provider
      value={{
        isPremium,
        tier,
        status,
        isTrialActive,
        trialDaysRemaining,
        trialUsed,
        trialEndsAt,
        packages,
        isLoading,
        isPaywallVisible,
        paywallSource,
        openPaywall,
        closePaywall,
        startTrial,
        purchasePackage,
        restorePurchases,
        refreshSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextType {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
