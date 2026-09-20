// ============================================================
// Focussive Mobile — Verify Email Screen
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
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/utils/theme';

export default function VerifyEmailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email || '';

  const { verifyEmail, resendVerificationCode } = useAuth();

  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(60);

  const inputRefs = useRef<Array<TextInput | null>>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

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
        submitVerification(sanitized);
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
      submitVerification(fullCode);
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !codeDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const submitVerification = async (codeToVerify?: string) => {
    const code = codeToVerify || codeDigits.join('');
    if (code.length < 6) {
      Alert.alert('Incomplete Code', 'Please enter the full 6-digit verification code.');
      return;
    }

    if (!email) {
      Alert.alert('Error', 'Missing email address. Please return to login and try again.');
      return;
    }

    setLoading(true);
    try {
      await verifyEmail(email, code);
      // Navigation is handled automatically by root layout once authenticated,
      // but we can also optionally navigate to extension-qr:
      router.replace('/(auth)/extension-qr' as never);
    } catch (err: unknown) {
      const msg =
        (err as { errors?: Array<{ message?: string; longMessage?: string }> })?.errors?.[0]?.longMessage ||
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ||
        (err instanceof Error ? err.message : 'Verification failed. Please check the code and try again.');
      Alert.alert('Verification Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0 || resending) return;
    if (!email) {
      Alert.alert('Error', 'Email address not found.');
      return;
    }

    setResending(true);
    try {
      await resendVerificationCode(email);
      setTimer(60);
      setCodeDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      Alert.alert('Code Sent', `A fresh 6-digit code was sent to ${email}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not resend code. Please try again later.';
      Alert.alert('Resend Failed', msg);
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* Header Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace('/(auth)/login' as never)}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={theme.textSecondary} style={{ marginRight: 2 }} />
          <Text style={[styles.backButtonText, { color: theme.textSecondary }]}>Back to Login</Text>
        </TouchableOpacity>

        {/* Title & Info */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Check your email</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            We sent a 6-digit verification code to
          </Text>
          <Text style={[styles.emailHighlight, { color: theme.accent }]}>
            {email || 'your email'}
          </Text>
        </View>

        {/* OTP Input Boxes */}
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
          onPress={() => submitVerification()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.verifyButtonText}>Verify & Continue</Text>
          )}
        </TouchableOpacity>

        {/* Resend Section */}
        <View style={styles.resendContainer}>
          {timer > 0 ? (
            <Text style={[styles.resendTimerText, { color: theme.textSecondary }]}>
              Resend code in <Text style={{ color: theme.accent, fontWeight: '600' }}>{timer}s</Text>
            </Text>
          ) : (
            <TouchableOpacity onPress={handleResend} disabled={resending}>
              <Text style={[styles.resendActionText, { color: theme.accent }]}>
                {resending ? 'Sending new code...' : "Didn't receive a code? Resend"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '300',
    letterSpacing: 1,
    marginBottom: 10,
  },
  subtitle: {
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
    borderWidth: 1.5,
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
  buttonDisabled: {
    opacity: 0.6,
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
