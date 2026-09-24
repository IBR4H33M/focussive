// ============================================================
// Focussive Extension — Sidebar Menu & Preferences
// ============================================================

import React, { useState, useEffect } from 'react';
import { clearTokens } from '../utils/api';
import {
  clearDeviceId,
  getDeviceId,
  getExtensionSettings,
  setExtensionSettings,
  type ExtensionSettings,
} from '../utils/storage';

interface MenuProps {
  onClose: () => void;
  onLogout: () => void;
  onRefreshData?: () => void;
}

type MenuView = 'menu' | 'settings' | 'device_sync';

const DEFAULT_IMAGES = [
  { id: 'cat-no.gif', title: 'Cat (No!)', file: 'blockimages/cat-no.gif' },
  { id: 'dog-really.gif', title: 'Dog (Really?)', file: 'blockimages/dog-really.gif' },
  { id: 'dont-answer.gif', title: "Don't Answer", file: 'blockimages/dont-answer.gif' },
];

export default function Menu({ onClose, onLogout, onRefreshData }: MenuProps) {
  const [currentView, setCurrentView] = useState<MenuView>('menu');
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

  async function handleLogout() {
    await clearTokens();
    await clearDeviceId();
    onLogout();
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
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.sidebar}>
        {/* Header */}
        <div style={styles.header}>
          {currentView === 'menu' ? (
            <>
              <span style={styles.title}>Menu</span>
              <button style={styles.iconBtn} onClick={onClose} aria-label="Close">
                ✕
              </button>
            </>
          ) : (
            <>
              <button
                style={styles.backBtn}
                onClick={() => setCurrentView('menu')}
              >
                &lt; Back
              </button>
              <span style={styles.subViewTitle}>
                {currentView === 'settings' && 'Settings'}
                {currentView === 'device_sync' && 'Device & Sync'}
              </span>
              <button style={styles.iconBtn} onClick={onClose} aria-label="Close">
                ✕
              </button>
            </>
          )}
        </div>

        {/* Content Body */}
        <div style={styles.content}>
          {currentView === 'menu' && (
            <div style={styles.menuList}>
              <button style={styles.menuItem} onClick={() => setCurrentView('settings')}>
                <div style={styles.menuItemLeft}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#90EE90" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Settings</span>
                </div>
                <span style={styles.chevron}>›</span>
              </button>

              <button style={styles.menuItem} onClick={() => setCurrentView('device_sync')}>
                <div style={styles.menuItemLeft}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#90EE90" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  <span>Device & Sync</span>
                </div>
                <span style={styles.chevron}>›</span>
              </button>
            </div>
          )}

          {/* SubView: Settings */}
          {currentView === 'settings' && settings && (
            <div style={styles.subViewContainer}>
              <div style={styles.sectionHeader}>
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
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
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
                            borderColor: isSelected ? '#90EE90' : '#333',
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

              <div style={styles.sectionHeader}>
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

              {/* Auto-close seconds selector: 10, 15 (Default), 20, 25 */}
              {settings.auto_close_tab && (
                <div style={styles.secondsSelectorRow}>
                  <span style={{ fontSize: 12, color: '#AAA' }}>Countdown Time:</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[10, 15, 20, 25].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => updateSetting('auto_close_seconds', sec)}
                        style={{
                          ...styles.secBtn,
                          backgroundColor: settings.auto_close_seconds === sec ? '#90EE90' : '#2A2A2A',
                          color: settings.auto_close_seconds === sec ? '#111' : '#E0E0E0',
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
            </div>
          )}

          {/* SubView: Device & Sync */}
          {currentView === 'device_sync' && (
            <div style={styles.subViewContainer}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>DEVICE CONNECTION</span>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Status</span>
                  <span style={{ color: '#90EE90', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#90EE90' }} />
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
                  <div style={styles.infoRow}>
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
            </div>
          )}
        </div>

        {/* Footer: Standalone Logout */}
        <div style={styles.footer}>
          <button style={styles.logoutBtn} onClick={handleLogout}>
            <span>Log Out</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#8B1E1E"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 100,
  },
  sidebar: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: 320,
    height: '100%',
    backgroundColor: '#18181B',
    borderLeft: '1px solid #2E2E34',
    zIndex: 101,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 18px',
    borderBottom: '1px solid #27272A',
    backgroundColor: '#18181B',
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  subViewTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#FFFFFF',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#90EE90',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 0',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 16,
    cursor: 'pointer',
    padding: '4px 8px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
  },
  menuList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingTop: 8,
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '14px 14px',
    backgroundColor: '#202024',
    border: '1px solid #2A2A30',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  menuItemLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  chevron: {
    fontSize: 18,
    color: '#666',
  },
  subViewContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    paddingTop: 4,
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#90EE90',
    letterSpacing: 1.5,
  },
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    backgroundColor: '#202024',
    border: '1px solid #2A2A30',
    borderRadius: 10,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  toggleDesc: {
    fontSize: 11,
    color: '#8E8E93',
  },
  switchInput: {
    cursor: 'pointer',
    width: 18,
    height: 18,
    accentColor: '#90EE90',
  },
  imagePickerContainer: {
    padding: '12px 14px',
    backgroundColor: '#1E1E22',
    border: '1px solid #2A2A30',
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
    backgroundColor: '#2A2A30',
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
    backgroundColor: '#90EE90',
    color: '#000',
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
    backgroundColor: '#202024',
    border: '1px solid #2A2A30',
    borderRadius: 10,
  },
  secBtn: {
    border: 'none',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 11,
    cursor: 'pointer',
  },
  infoCard: {
    padding: '14px',
    backgroundColor: '#202024',
    border: '1px solid #2A2A30',
    borderRadius: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
  },
  infoLabel: {
    color: '#8E8E93',
  },
  infoVal: {
    color: '#FFFFFF',
    fontWeight: 500,
  },
  syncBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 16px',
    backgroundColor: '#16652D',
    border: 'none',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 600,
    width: '100%',
    boxSizing: 'border-box',
    marginTop: 6,
    cursor: 'pointer',
  },
  syncSuccessToast: {
    padding: '8px 12px',
    backgroundColor: 'rgba(144, 238, 144, 0.15)',
    color: '#90EE90',
    borderRadius: 8,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: 500,
  },
  footer: {
    padding: '14px 18px',
    borderTop: '1px solid #27272A',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#18181B',
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 20px',
    background: 'none',
    border: 'none',
    color: '#8B1E1E',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
