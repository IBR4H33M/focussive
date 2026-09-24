// ============================================================
// Focussive Mobile — Login Screen
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/utils/theme';
import { ApiError } from '@/utils/api';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { login, verifySecondFactor, resendSecondFactorCode } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [is2FA, setIs2FA] = useState(false);
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const [factorStrategy, setFactorStrategy] = useState<string>('email_code');
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(60);

  const inputRefs = useRef<Array<TextInput | null>>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (!is2FA || timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [is2FA, timer]);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const res = await login(email.trim(), password);
      if (res?.needs_second_factor) {
        setIs2FA(true);
        const strat = res.second_factors?.[0]?.strategy || 'email_code';
        setFactorStrategy(strat);
        setTimer(60);
        setCodeDigits(['', '', '', '', '', '']);
        return;
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
        Alert.alert(
          'Email Not Verified',
          'Please verify your email address before logging in.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Verify Now',
              onPress: () => {
                router.push({
                  pathname: '/(auth)/verify-email',
                  params: { email: email.trim() },
                } as never);
              },
            },
          ]
        );
        return;
      }
      const errMessage =
        (error as { errors?: Array<{ message?: string; longMessage?: string }> })?.errors?.[0]?.longMessage ||
        (error as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ||
        (error instanceof Error ? error.message : 'Please try again');
      Alert.alert('Login Failed', errMessage);
    } finally {
      setLoading(false);
    }
  }

  const handleDigitChange = (text: string, index: number) => {
    // If pasted multiple digits
    if (text.length > 1) {
      const sanitized = text.replace(/[^0-9]/g, '').slice(0, 6);
      const newDigits = [...codeDigits];
      for (let i = 0; i < sanitized.length; i++) {
        newDigits[i] = sanitized[i];
      }
      setCodeDigits(newDigits);
      const targetFocus = Math.min(sanitized.length, 5);
      inputRefs.current[targetFocus]?.focus();
      if (sanitized.length === 6) {
        submitSecondFactor(sanitized);
      }
      return;
    }

    const sanitized = text.replace(/[^0-9]/g, '');
    const newDigits = [...codeDigits];
    newDigits[index] = sanitized;
    setCodeDigits(newDigits);

    if (sanitized && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    const fullCode = newDigits.join('');
    if (fullCode.length === 6) {
      submitSecondFactor(fullCode);
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !codeDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const submitSecondFactor = async (codeToVerify?: string) => {
    const code = codeToVerify || codeDigits.join('');
    if (code.length < 6) {
      Alert.alert('Incomplete Code', 'Please enter the full 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      await verifySecondFactor(code, factorStrategy);
    } catch (error) {
      const errMessage =
        (error as { errors?: Array<{ message?: string; longMessage?: string }> })?.errors?.[0]?.longMessage ||
        (error as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ||
        (error instanceof Error ? error.message : 'Invalid code. Please try again.');
      Alert.alert('Verification Failed', errMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResendSecondFactor = async () => {
    if (timer > 0 || resending) return;

    setResending(true);
    try {
      await resendSecondFactorCode(factorStrategy);
      setTimer(60);
      setCodeDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      Alert.alert('Code Sent', `A fresh 6-digit code was sent to ${email.trim()}`);
    } catch (err: unknown) {
      const msg =
        (err as { errors?: Array<{ message?: string; longMessage?: string }> })?.errors?.[0]?.longMessage ||
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ||
        (err instanceof Error ? err.message : 'Could not resend code. Please try again later.');
      Alert.alert('Resend Failed', msg);
    } finally {
      setResending(false);
    }
  };

  const handleBackToLogin = () => {
    setIs2FA(false);
    setCodeDigits(['', '', '', '', '', '']);
    setTimer(60);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {is2FA ? (
          /* 2FA Form matching verify-email UI */
          <View style={styles.twoFactorContainer}>
            {/* Header Back Button */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackToLogin}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={theme.textSecondary}
                style={{ marginRight: 2 }}
              />
              <Text style={[styles.backButtonText, { color: theme.textSecondary }]}>
                Back to Login
              </Text>
            </TouchableOpacity>

            {/* Title & Info */}
            <View style={styles.twoFactorHeader}>
              <Text style={[styles.twoFactorTitle, { color: theme.text }]}>
                Verify login for new device
              </Text>
              <Text style={[styles.twoFactorSubtitle, { color: theme.textSecondary }]}>
                {factorStrategy === 'phone_code'
                  ? 'We sent a 6-digit verification code via SMS to'
                  : 'We sent a 6-digit verification code to'}
              </Text>
              <Text style={[styles.emailHighlight, { color: theme.accent }]}>
                {email.trim() || 'your email'}
              </Text>
            </View>

            {/* 6 OTP Input Boxes */}
            <View style={styles.otpRow}>
              {codeDigits.map((digit, idx) => (
                <TextInput
                  key={idx}
                  ref={(ref) => {
                    inputRefs.current[idx] = ref;
                  }}
                  style={[
                    styles.otpBox,
                    {
                      backgroundColor: theme.surface,
                      borderColor: digit ? theme.accent : theme.border,
                      color: theme.text,
                    },
                  ]}
                  value={digit}
                  onChangeText={(text) => handleDigitChange(text, idx)}
                  onKeyPress={(e) => handleKeyPress(e, idx)}
                  keyboardType="number-pad"
                  maxLength={6}
                  selectTextOnFocus
                  textAlign="center"
                  autoFocus={idx === 0}
                />
              ))}
            </View>

            {/* Verify Button */}
            <TouchableOpacity
              style={[
                styles.verifyButton,
                { backgroundColor: theme.accentDark },
                loading && styles.buttonDisabled,
              ]}
              onPress={() => submitSecondFactor()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.verifyButtonText}>Verify & Log In</Text>
              )}
            </TouchableOpacity>

            {/* Resend Section */}
            <View style={styles.resendContainer}>
              {timer > 0 ? (
                <Text style={[styles.resendTimerText, { color: theme.textSecondary }]}>
                  Resend code in{' '}
                  <Text style={{ color: theme.accent, fontWeight: '600' }}>
                    {timer}s
                  </Text>
                </Text>
              ) : (
                <TouchableOpacity onPress={handleResendSecondFactor} disabled={resending}>
                  <Text style={[styles.resendActionText, { color: theme.accent }]}>
                    {resending ? 'Sending new code...' : "Didn't receive a code? Resend"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <Image
                source={require('../../../assets/icon.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={[styles.logoText, { color: theme.text }]}>Focussive</Text>
            </View>

            {/* Login Form */}
            <View style={styles.form}>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="Email"
                placeholderTextColor={theme.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />

              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="Password"
                placeholderTextColor={theme.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />

              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: theme.accentDark },
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleLogin}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Logging in...' : 'Log In'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity onPress={() => router.push('/(auth)/signup' as never)}>
                <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                  Don&apos;t have an account?{' '}
                  <Text style={{ color: theme.accent, fontWeight: '600' }}>Sign Up</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoImage: {
    width: 72,
    height: 72,
    marginBottom: 16,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '300',
    letterSpacing: 2,
  },
  form: {
    gap: 16,
  },
  input: {
    height: 52,
    borderWidth: 2.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '300',
  },
  button: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerText: {
    fontSize: 14,
  },

  // 2FA / Device Verification (matches verify-email UI)
  twoFactorContainer: {
    width: '100%',
  },
  backButton: {
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  twoFactorHeader: {
    alignItems: 'center',
    marginBottom: 36,
  },
  twoFactorTitle: {
    fontSize: 26,
    fontWeight: '300',
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: 'center',
  },
  twoFactorSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
  },
  emailHighlight: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 2.5,
    fontSize: 24,
    fontWeight: '600',
  },
  verifyButton: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resendContainer: {
    alignItems: 'center',
  },
  resendTimerText: {
    fontSize: 14,
  },
  resendActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
