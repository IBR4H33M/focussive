// ============================================================
// Focussive Mobile — Auth Context (Clerk Integration)
// ============================================================

import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import {
  useAuth as useClerkAuth,
  useUser as useClerkUser,
} from '@clerk/expo';
import {
  useSignIn,
  useSignUp,
} from '@clerk/expo/legacy';
import { setClerkTokenGetter } from '@/utils/api';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface SecondFactorInfo {
  strategy: string;
  phoneNumberId?: string;
  emailAddressId?: string;
}

export interface LoginResult {
  needs_second_factor?: boolean;
  second_factors?: SecondFactorInfo[];
}

export interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<LoginResult | void>;
  verifySecondFactor: (code: string, strategy?: string) => Promise<void>;
  resendSecondFactorCode: (strategy?: string) => Promise<void>;
  signup: (data: {
    email: string;
    name: string;
    password: string;
    passwordConfirm?: string;
    age?: number;
  }) => Promise<{ requires_verification: boolean; email: string }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerificationCode: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded: isAuthLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const { user: clerkUser, isLoaded: isUserLoaded } = useClerkUser();
  const { signIn, setActive: setSignInActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: isSignUpLoaded } = useSignUp();

  // Pipe Clerk's session token to the API helper for all backend requests
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(async () => {
        try {
          return await getToken();
        } catch {
          return null;
        }
      });
    }
  }, [getToken]);

  const user = useMemo<User | null>(() => {
    if (!isSignedIn || !clerkUser) return null;
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ||
      clerkUser.emailAddresses[0]?.emailAddress ||
      '';
    const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ');
    return {
      id: clerkUser.id,
      email,
      name: fullName || clerkUser.username || email.split('@')[0] || 'User',
      avatar_url: clerkUser.imageUrl || undefined,
    };
  }, [isSignedIn, clerkUser]);

  async function login(email: string, password: string): Promise<LoginResult | void> {
    if (!isSignInLoaded || !signIn) {
      throw new Error('Sign-in service is not ready. Please try again.');
    }

    const result = await signIn.create({
      identifier: email.trim(),
      password,
    });

    if (result.status === 'complete') {
      await setSignInActive({ session: result.createdSessionId });
      return;
    }

    if (result.status === 'needs_second_factor' || (result.status as string) === 'needs_client_trust') {
      const factors = (
        (signIn?.supportedSecondFactors && signIn.supportedSecondFactors.length > 0)
          ? signIn.supportedSecondFactors
          : (result.supportedSecondFactors && result.supportedSecondFactors.length > 0)
          ? result.supportedSecondFactors
          : (result as any).supported_second_factors ||
            (signIn as any)?.supported_second_factors ||
            []
      ) as SecondFactorInfo[];

      console.log('[Clerk] needs_second_factor! Factors:', JSON.stringify(factors, null, 2));

      const emailFactor = factors.find((f) => f.strategy === 'email_code');
      const phoneFactor = factors.find((f) => f.strategy === 'phone_code');
      const targetFactor: SecondFactorInfo = emailFactor || phoneFactor || factors[0] || { strategy: 'email_code' };

      const prepConfig: any = { strategy: targetFactor.strategy || 'email_code' };
      if (targetFactor.emailAddressId) {
        prepConfig.emailAddressId = targetFactor.emailAddressId;
      }
      if (targetFactor.phoneNumberId) {
        prepConfig.phoneNumberId = targetFactor.phoneNumberId;
      }

      console.log('[Clerk] Preparing second factor with config:', prepConfig);
      const client = (signIn || result) as any;

      if (client && typeof client.prepareSecondFactor === 'function') {
        try {
          await client.prepareSecondFactor(prepConfig);
          console.log('[Clerk] Verification code dispatched successfully!');
        } catch (prepErr: any) {
          console.error('[Clerk] Error preparing second factor with config:', prepErr);
          if (prepConfig.emailAddressId) {
            try {
              console.log('[Clerk] Retrying prepareSecondFactor with strategy only...');
              await client.prepareSecondFactor({ strategy: prepConfig.strategy as any });
              console.log('[Clerk] Verification code dispatched on retry!');
            } catch (retryErr) {
              console.error('[Clerk] Retry prepare failed:', retryErr);
              throw retryErr || prepErr;
            }
          } else {
            throw prepErr;
          }
        }
      }

      return {
        needs_second_factor: true,
        second_factors: factors.length > 0 ? factors : [targetFactor],
      };
    }

    throw new Error(`Sign-in status: ${result.status}`);
  }

  async function resendSecondFactorCode(strategy: string = 'email_code') {
    if (!isSignInLoaded || !signIn) {
      throw new Error('Sign-in service is not ready.');
    }
    const factors = (
      (signIn.supportedSecondFactors && signIn.supportedSecondFactors.length > 0)
        ? signIn.supportedSecondFactors
        : []
    ) as SecondFactorInfo[];

    const factor = strategy
      ? factors.find((f) => f.strategy === strategy)
      : factors.find((f) => f.strategy === 'email_code') || factors[0] || { strategy: 'email_code' };

    const targetStrat = factor?.strategy || strategy || 'email_code';
    const prepConfig: any = { strategy: targetStrat };
    if (factor?.emailAddressId) prepConfig.emailAddressId = factor.emailAddressId;
    if (factor?.phoneNumberId) prepConfig.phoneNumberId = factor.phoneNumberId;

    try {
      await signIn.prepareSecondFactor(prepConfig as any);
    } catch (err) {
      if (prepConfig.emailAddressId) {
        await signIn.prepareSecondFactor({ strategy: targetStrat as any });
      } else {
        throw err;
      }
    }
  }

  async function verifySecondFactor(code: string, strategy?: string) {
    if (!isSignInLoaded || !signIn) {
      throw new Error('Sign-in service is not ready. Please try again.');
    }

    const factors = (signIn.supportedSecondFactors || []) as SecondFactorInfo[];
    const selected = strategy
      ? factors.find((f) => f.strategy === strategy)
      : factors.find((f) => f.strategy === 'email_code') || factors[0];

    const strat = selected?.strategy || strategy || 'email_code';

    const result = await signIn.attemptSecondFactor({
      strategy: strat as any,
      code: code.trim(),
    });

    if (result.status === 'complete') {
      await setSignInActive({ session: result.createdSessionId });
    } else {
      throw new Error(`Second factor verification incomplete: ${result.status}`);
    }
  }

  async function signup(data: {
    email: string;
    name: string;
    password: string;
    passwordConfirm?: string;
    age?: number;
  }) {
    if (!isSignUpLoaded || !signUp) {
      throw new Error('Sign-up service is not ready. Please try again.');
    }

    const names = data.name.trim().split(' ');
    const firstName = names[0] || data.name;
    const lastName = names.slice(1).join(' ') || undefined;

    await signUp.create({
      emailAddress: data.email.trim(),
      password: data.password,
      firstName,
      lastName,
    });

    // Request Clerk to send the 6-digit email OTP verification code
    await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

    return {
      requires_verification: true,
      email: data.email.trim(),
    };
  }

  async function verifyEmail(_email: string, code: string) {
    if (!isSignUpLoaded || !signUp) {
      throw new Error('Sign-up service is not ready. Please try again.');
    }

    const completeSignUp = await signUp.attemptEmailAddressVerification({
      code: code.trim(),
    });

    if (completeSignUp.status === 'complete') {
      await setSignUpActive({ session: completeSignUp.createdSessionId });
    } else {
      throw new Error(`Email verification incomplete: ${completeSignUp.status}`);
    }
  }

  async function resendVerificationCode(_email: string) {
    if (!isSignUpLoaded || !signUp) {
      throw new Error('Sign-up service is not ready. Please try again.');
    }
    await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
  }

  async function logout() {
    await signOut();
  }

  const isLoading = !isAuthLoaded || !isUserLoaded;
  const isAuthenticated = Boolean(isSignedIn);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        verifySecondFactor,
        resendSecondFactorCode,
        signup,
        verifyEmail,
        resendVerificationCode,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

