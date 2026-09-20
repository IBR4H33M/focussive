// ============================================================
// Focussive Mobile — Auth Context (Clerk Integration)
// ============================================================

import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import {
  useAuth as useClerkAuth,
  useUser as useClerkUser,
  useSignIn,
  useSignUp,
} from '@clerk/clerk-expo';
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

export interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
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

  async function login(email: string, password: string) {
    if (!isSignInLoaded || !signIn) {
      throw new Error('Sign-in service is not ready. Please try again.');
    }

    const result = await signIn.create({
      identifier: email.trim(),
      password,
    });

    if (result.status === 'complete') {
      await setSignInActive({ session: result.createdSessionId });
    } else {
      throw new Error(`Sign-in status: ${result.status}`);
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

