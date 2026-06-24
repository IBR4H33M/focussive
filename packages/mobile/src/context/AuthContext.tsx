// ============================================================
// Focussive Mobile — Auth Context
// ============================================================

import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import { authApi, setToken, setRefreshToken, clearTokens, getToken } from '@/utils/api';

interface User {
  id: string;
  email: string;
  name: string;
  age?: number;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: User }
  | { type: 'LOGOUT' };

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { email: string; name: string; password: string; passwordConfirm: string; age?: number }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_USER':
      return { ...state, user: action.payload, isAuthenticated: true, isLoading: false };
    case 'LOGOUT':
      return { ...state, user: null, isAuthenticated: false, isLoading: false };
    default:
      return state;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Check token on mount
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const token = await getToken();
      if (!token) {
        dispatch({ type: 'LOGOUT' });
        return;
      }

      const response = await authApi.verify();
      const user = response.user as unknown as User;
      dispatch({ type: 'SET_USER', payload: user });
    } catch {
      dispatch({ type: 'LOGOUT' });
    }
  }

  async function login(email: string, password: string) {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const response = await authApi.login({ email, password }) as {
        user: User;
        token: string;
        refresh_token: string;
      };
      await setToken(response.token);
      await setRefreshToken(response.refresh_token);
      dispatch({ type: 'SET_USER', payload: response.user });
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      throw error;
    }
  }

  async function signup(data: { email: string; name: string; password: string; passwordConfirm: string; age?: number }) {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const response = await authApi.signup(data) as {
        user: User;
        token: string;
        refresh_token: string;
      };
      await setToken(response.token);
      await setRefreshToken(response.refresh_token);
      dispatch({ type: 'SET_USER', payload: response.user });
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      throw error;
    }
  }

  async function logout() {
    await clearTokens();
    dispatch({ type: 'LOGOUT' });
  }

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
