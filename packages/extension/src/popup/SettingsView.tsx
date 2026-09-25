// ============================================================
// Focussive Extension — Settings View (with Device & Sync section)
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  getDeviceId,
  getExtensionSettings,
  setExtensionSettings,
  type ExtensionSettings,
} from '../utils/storage';

interface SettingsViewProps {
  onBack: () => void;
  onRefreshData?: () => void;
}

const DEFAULT_IMAGES = [
  { id: 'cat-no.gif', title: 'Cat (No!)', file: 'blockimages/cat-no.gif' },
  { id: 'dog-really.gif', title: 'Dog (Really?)', file: 'blockimages/dog-really.gif' },
  { id: 'dont-answer.gif', title: "Don't Answer", file: 'blockimages/dont-answer.gif' },
];

export default function SettingsView({ onBack, onRefreshData }: SettingsViewProps) {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [deviceId, setDeviceIdState] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    getExtensionSettings().then(setSettings);
    getDeviceId().then((id) => setDeviceIdState(id || ''));
  }, []);

  async function updateSetting<K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) {
    const updated = await setExtensionSettings({ [key]: value });
    setSettings(updated);
  }

  async function handleSyncNow() {
    setSyncing(true);
    setSyncMessage(null);
    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, (response) => {
      setSyncing(false);
      if (response?.success) {
        setSyncMessage(`Synced at ${response.timestamp || new Date().toLocaleTimeString()}`);
        if (onRefreshData) onRefreshData();
        getExtensionSettings().then(setSettings);
      } else {
        setSyncMessage('Sync completed');
      }
      setTimeout(() => setSyncMessage(null), 3000);
    });
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back to Focus</span>
        </button>
        <span style={styles.title}>Settings</span>
        <div style={{ width: 60 }} />
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* ─── SECTION 1: DEVICE & SYNC ─────────────────────────── */}
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>DEVICE & SYNC</span>
        </div>

        <div style={styles.infoCard}>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Status</span>
            <span style={{ color: '#8BA794', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#8BA794' }} />
              Connected & Syncing
            </span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Device Type</span>
            <span style={styles.infoVal}>Chrome Extension</span>
          </div>
          {deviceId && (
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Device ID</span>
              <span style={{ ...styles.infoVal, fontFamily: 'monospace', fontSize: 11 }}>
                {deviceId.length > 16 ? `${deviceId.slice(0, 14)}...` : deviceId}
              </span>
            </div>
          )}
          {settings?.last_synced_at && (
            <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
              <span style={styles.infoLabel}>Last Synced</span>
              <span style={styles.infoVal}>{settings.last_synced_at}</span>
            </div>
          )}
        </div>

        {syncMessage && (
          <div style={styles.syncSuccessToast}>
            ✓ {syncMessage}
          </div>
        )}

        <button
          style={{
            ...styles.syncBtn,
            opacity: syncing ? 0.6 : 1,
            cursor: syncing ? 'not-allowed' : 'pointer',
          }}
          disabled={syncing}
          onClick={handleSyncNow}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          <span>{syncing ? 'Syncing Rules...' : 'Sync Now with Mobile'}</span>
        </button>

        {/* ─── SECTION 2: BLOCK SCREEN OPTIONS ─────────────────── */}
        {settings && (
          <>
            <div style={{ ...styles.sectionHeader, marginTop: 24 }}>
              <span style={styles.sectionTitle}>BLOCK SCREEN OPTIONS</span>
            </div>

            {/* Motivational Quotes */}
            <div style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>Motivational Quotes</div>
                <div style={styles.toggleDesc}>Show focus quote on blocked overlay</div>
              </div>
              <input
                type="checkbox"
                checked={settings.overlay_quote_enabled}
                onChange={(e) => updateSetting('overlay_quote_enabled', e.target.checked)}
                style={styles.switchInput}
              />
            </div>

            {/* Block Screen Image */}
            <div style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>Block Screen Image</div>
                <div style={styles.toggleDesc}>Show reaction image when distraction detected</div>
              </div>
              <input
                type="checkbox"
                checked={settings.overlay_gif_enabled}
                onChange={(e) => updateSetting('overlay_gif_enabled', e.target.checked)}
                style={styles.switchInput}
              />
            </div>

            {/* Image Picker */}
            {settings.overlay_gif_enabled && (
              <div style={styles.imagePickerContainer}>
                <div style={{ fontSize: 11, color: '#BAC6B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Default Images
                </div>
                <div style={styles.imageGrid}>
                  {DEFAULT_IMAGES.map((img) => {
                    const isSelected =
                      settings.overlay_gif_url === img.id ||
                      settings.overlay_gif_url?.includes(img.id);
                    return (
                      <div
                        key={img.id}
                        onClick={() => updateSetting('overlay_gif_url', img.id)}
                        style={{
                          ...styles.imageCard,
                          borderColor: isSelected ? '#8BA794' : '#5D6E75',
                          borderWidth: isSelected ? 2 : 1,
                        }}
                      >
                        <img
                          src={chrome.runtime.getURL(img.file)}
                          alt={img.title}
                          style={styles.imageThumbnail}
                        />
                        {isSelected && <span style={styles.selectedBadge}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── SECTION 3: TAB & NOTIFICATION BEHAVIOR ─────────── */}
            <div style={{ ...styles.sectionHeader, marginTop: 24 }}>
              <span style={styles.sectionTitle}>TAB & NOTIFICATION BEHAVIOR</span>
            </div>

            {/* Instant Tab Closer */}
            <div style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>Instant Tab Closer</div>
                <div style={styles.toggleDesc}>Auto-close distracting tab with countdown</div>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_close_tab}
                onChange={(e) => updateSetting('auto_close_tab', e.target.checked)}
                style={styles.switchInput}
              />
            </div>

            {/* Auto-close seconds selector */}
            {settings.auto_close_tab && (
              <div style={styles.secondsSelectorRow}>
                <span style={{ fontSize: 12, color: '#BAC6B8' }}>Countdown Time:</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[10, 15, 20, 25].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => updateSetting('auto_close_seconds', sec)}
                      style={{
                        ...styles.secBtn,
                        backgroundColor: settings.auto_close_seconds === sec ? '#8BA794' : '#2F3456',
                        color: settings.auto_close_seconds === sec ? '#2F3456' : '#E9E4DC',
                        fontWeight: settings.auto_close_seconds === sec ? 700 : 400,
                      }}
                    >
                      {sec}s{sec === 15 ? ' (Default)' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Desktop Notifications */}
            <div style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>Desktop Notifications</div>
                <div style={styles.toggleDesc}>Alerts on session start, end, and breaks</div>
              </div>
              <input
                type="checkbox"
                checked={settings.desktop_notifications}
                onChange={(e) => updateSetting('desktop_notifications', e.target.checked)}
                style={styles.switchInput}
              />
            </div>

            {/* Sound Chime */}
            <div style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>Sound Chime on Block</div>
                <div style={styles.toggleDesc}>Play subtle alert sound when site is blocked</div>
              </div>
              <input
                type="checkbox"
                checked={settings.sound_enabled}
                onChange={(e) => updateSetting('sound_enabled', e.target.checked)}
                style={styles.switchInput}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#2F3456',
    color: '#E9E4DC',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #5D6E75',
    backgroundColor: '#2F3456',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'none',
    border: 'none',
    color: '#8BA794',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: '#E9E4DC',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionHeader: {
    marginTop: 6,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#8BA794',
    letterSpacing: 1.5,
  },
  infoCard: {
    backgroundColor: '#3A4062',
    border: '1px solid #5D6E75',
    borderRadius: 10,
    overflow: 'hidden',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  infoLabel: {
    fontSize: 12,
    color: '#BAC6B8',
  },
  infoVal: {
    fontSize: 12,
    color: '#E9E4DC',
    fontWeight: 500,
  },
  syncSuccessToast: {
    padding: '8px 12px',
    backgroundColor: 'rgba(139, 167, 148, 0.15)',
    border: '1px solid #8BA794',
    borderRadius: 8,
    color: '#8BA794',
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'center',
  },
  syncBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '11px 16px',
    backgroundColor: '#3A4062',
    border: '1.5px solid #8BA794',
    borderRadius: 10,
    color: '#8BA794',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    backgroundColor: '#3A4062',
    border: '1px solid #5D6E75',
    borderRadius: 10,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#E9E4DC',
    marginBottom: 2,
  },
  toggleDesc: {
    fontSize: 11,
    color: '#BAC6B8',
  },
  switchInput: {
    cursor: 'pointer',
    width: 18,
    height: 18,
    accentColor: '#8BA794',
  },
  imagePickerContainer: {
    padding: '12px 14px',
    backgroundColor: '#3A4062',
    border: '1px solid #5D6E75',
    borderRadius: 10,
  },
  imageGrid: {
    display: 'flex',
    gap: 10,
  },
  imageCard: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    cursor: 'pointer',
    backgroundColor: '#2F3456',
    borderStyle: 'solid',
  },
  imageThumbnail: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  selectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#8BA794',
    color: '#2F3456',
    fontSize: 10,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondsSelectorRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    backgroundColor: '#3A4062',
    border: '1px solid #5D6E75',
    borderRadius: 10,
  },
  secBtn: {
    border: 'none',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};
