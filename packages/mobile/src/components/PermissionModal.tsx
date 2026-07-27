import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/utils/theme';

interface PermissionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onGrantPermissions: () => void;
}

export default function PermissionModal({
  visible,
  onDismiss,
  onGrantPermissions,
}: PermissionModalProps) {
  const theme = useTheme();
  const router = useRouter();

  const handleGrantPermissions = async () => {
    onGrantPermissions();
    // Navigate to Settings with app permissions expanded
    onDismiss();
    setTimeout(() => {
      router.push({
        pathname: '/(tabs)/settings',
        params: { expandPermissions: 'true' },
      } as never);
    }, 300);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
          <Text style={[styles.title, { color: theme.text }]}>
            Permissions Required
          </Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            Focussive needs permissions to run and monitor effectively.
          </Text>

          <View style={[styles.permissionsList, { borderTopColor: theme.border }]}>
            <PermissionItem
              name="Usage Access"
              description="To detect which app is in the foreground"
              theme={theme}
            />
            <PermissionItem
              name="Display Over Other Apps"
              description="To show the block overlay on top of apps"
              theme={theme}
            />
            {Platform.OS === 'android' && (
              <>
                <PermissionItem
                  name="Precise Alarms"
                  description="For accurate session reminder notifications"
                  theme={theme}
                />
                <PermissionItem
                  name="Post Notifications"
                  description="To send session alerts and reminders"
                  theme={theme}
                  isLast
                />
              </>
            )}
            {Platform.OS !== 'android' && (
              <PermissionItem
                name="Notifications"
                description="To send session alerts and reminders"
                theme={theme}
                isLast
              />
            )}
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.buttonLater}
              onPress={onDismiss}
            >
              <Text style={styles.buttonText}>
                Later
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.buttonGrant}
              onPress={handleGrantPermissions}
            >
              <Text style={styles.buttonTextGrant}>
                Grant Permissions
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PermissionItem({
  name,
  description,
  theme,
  isLast,
}: {
  name: string;
  description: string;
  theme: any;
  isLast?: boolean;
}) {
  return (
    <>
      <View style={styles.permissionItem}>
        <Text style={[styles.permName, { color: theme.text }]}>{name}</Text>
        <Text style={[styles.permDesc, { color: theme.textSecondary }]}>
          {description}
        </Text>
      </View>
      {!isLast && (
        <View
          style={[styles.permDivider, { backgroundColor: theme.border }]}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 20,
    lineHeight: 20,
  },
  permissionsList: {
    borderTopWidth: 1,
    paddingVertical: 16,
    marginBottom: 20,
  },
  permissionItem: {
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  permName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  permDesc: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  permDivider: {
    height: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  buttonLater: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#757575',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGrant: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#3D5730',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  buttonTextGrant: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
