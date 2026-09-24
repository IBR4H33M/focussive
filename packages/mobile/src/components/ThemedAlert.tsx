// ============================================================
// Focussive Mobile — Themed Alert Dialog System
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Alert as RNAlert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark } from '@/utils/theme';

export interface AlertButton {
  text?: string;
  onPress?: (value?: string) => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

export interface AlertPayload {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
}

type AlertListener = (payload: AlertPayload | null) => void;
const listeners = new Set<AlertListener>();

let currentPayload: AlertPayload | null = null;

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions
) {
  currentPayload = { title, message, buttons, options };
  listeners.forEach((l) => l(currentPayload));
}

export function hideAlert() {
  currentPayload = null;
  listeners.forEach((l) => l(null));
}

// Monkey-patch React Native's default Alert.alert so ALL existing and future
// prompts in the entire app automatically use this sleek theme!
let isPatched = false;
export function installThemedAlert() {
  if (isPatched) return;
  isPatched = true;
  RNAlert.alert = (title: string, message?: string, buttons?: any[], options?: any) => {
    showAlert(title, message, buttons, options);
  };
}

export default function ThemedAlert() {
  const theme = useTheme();
  const isDark = useIsDark();
  const [alert, setAlert] = useState<AlertPayload | null>(null);
  const [scaleAnim] = useState(new Animated.Value(0.92));
  const [opacityAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    const listener: AlertListener = (payload) => {
      setAlert(payload);
      if (payload) {
        scaleAnim.setValue(0.92);
        opacityAnim.setValue(0);
        Animated.parallel([
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 8,
            tension: 65,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start();
      }
    };

    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [scaleAnim, opacityAnim]);

  if (!alert) return null;

  const titleLower = (alert.title || '').toLowerCase();
  const messageLower = (alert.message || '').toLowerCase();
  const combined = `${titleLower} ${messageLower}`;

  const isError =
    combined.includes('failed') ||
    combined.includes('error') ||
    combined.includes('invalid') ||
    combined.includes('required') ||
    combined.includes('unable');

  const isSuccess =
    combined.includes('success') ||
    combined.includes('activated') ||
    combined.includes('restored') ||
    combined.includes('welcome') ||
    combined.includes('awesome');

  const isDelete =
    combined.includes('delete') ||
    combined.includes('remove') ||
    combined.includes('cannot be undone');

  const isWarning =
    !isDelete && combined.includes('warning');

  const isNoContainerIcon = isSuccess || isDelete || isWarning;

  const iconName = isError
    ? 'alert-circle'
    : isSuccess
    ? 'checkmark'
    : (isDelete || isWarning)
    ? 'warning-outline'
    : 'information-circle';

  const iconColor = isError
    ? theme.danger
    : isSuccess
    ? '#34C759'
    : (isDelete || isWarning)
    ? theme.danger
    : theme.accent;

  const iconBg = isError
    ? theme.dangerBg
    : isNoContainerIcon
    ? 'transparent'
    : isDark
    ? 'rgba(139, 167, 148, 0.18)'
    : 'rgba(88, 112, 66, 0.15)';

  const buttons =
    alert.buttons && alert.buttons.length > 0
      ? alert.buttons
      : [{ text: 'OK', style: 'default' as const }];

  const handleButtonPress = (btn: AlertButton) => {
    hideAlert();
    if (btn.onPress) {
      btn.onPress();
    }
  };

  const handleBackdropPress = () => {
    if (alert.options?.cancelable !== false) {
      hideAlert();
      if (alert.options?.onDismiss) {
        alert.options.onDismiss();
      }
    }
  };

  return (
    <Modal
      transparent
      visible={Boolean(alert)}
      animationType="none"
      onRequestClose={handleBackdropPress}
    >
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <Animated.View
              style={[
                styles.dialog,
                {
                  backgroundColor: theme.surface,
                  opacity: opacityAnim,
                  transform: [{ scale: scaleAnim }],
                  shadowOpacity: isSuccess ? 0 : 0.3,
                  elevation: isSuccess ? 0 : 8,
                },
              ]}
            >
              {/* Content Row: Left Icon, Right Text Details */}
              <View style={styles.bodyRow}>
                <View
                  style={[
                    styles.iconContainer,
                    {
                      backgroundColor: iconBg,
                      width: isNoContainerIcon ? 32 : 44,
                      height: isNoContainerIcon ? 32 : 44,
                      borderRadius: isNoContainerIcon ? 0 : 22,
                    },
                  ]}
                >
                  <Ionicons
                    name={iconName}
                    size={isSuccess ? 36 : (isDelete || isWarning ? 28 : 24)}
                    color={iconColor}
                  />
                </View>

                <View style={styles.textColumn}>
                  <Text style={[styles.title, { color: theme.text }]}>
                    {alert.title}
                  </Text>

                  {Boolean(alert.message) && (
                    <Text style={[styles.message, { color: theme.textSecondary }]}>
                      {alert.message}
                    </Text>
                  )}
                </View>
              </View>

              {/* Action Buttons */}
              <View
                style={[
                  styles.buttonRow,
                  buttons.length > 2 ? styles.buttonColumn : null,
                ]}
              >
                {buttons.map((btn, index) => {
                  const isCancel = btn.style === 'cancel';
                  const isDestructive = btn.style === 'destructive';

                  let btnBg = theme.accent;
                  let textColor = '#FFFFFF';

                  if (isDestructive) {
                    btnBg = theme.danger;
                    textColor = '#FFFFFF';
                  } else if (isCancel) {
                    btnBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
                    textColor = theme.text;
                  }

                  return (
                    <TouchableOpacity
                      key={`${btn.text}-${index}`}
                      style={[
                        styles.btn,
                        buttons.length <= 2 ? styles.flexBtn : styles.fullBtn,
                        { backgroundColor: btnBg },
                      ]}
                      onPress={() => handleButtonPress(btn)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.btnText, { color: textColor }]}>
                        {btn.text || 'OK'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 16,
    gap: 14,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'left',
    marginBottom: 4,
    lineHeight: 22,
  },
  message: {
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'left',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  buttonColumn: {
    flexDirection: 'column',
    gap: 8,
  },
  btn: {
    paddingVertical: 13,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flexBtn: {
    flex: 1,
  },
  fullBtn: {
    width: '100%',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
