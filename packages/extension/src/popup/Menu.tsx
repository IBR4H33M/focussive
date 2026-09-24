// ============================================================
// Focussive Extension — Sidebar Menu
// ============================================================

import React from 'react';
import { clearTokens } from '../utils/api';
import { clearDeviceId } from '../utils/storage';

interface MenuProps {
  onClose: () => void;
  onLogout: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 100,
  },
  sidebar: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    width: 240,
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderLeft: '1px solid #333',
    zIndex: 101,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '20px 0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 20px 16px 20px',
    borderBottom: '1px solid #333',
  },
  title: {
    fontSize: 16,
    fontWeight: 300,
    color: '#E0E0E0',
    letterSpacing: 1,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#999',
    fontSize: 18,
    cursor: 'pointer',
  },
  menuItems: {
    flex: 1,
    padding: '8px 0',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '14px 20px',
    background: 'none',
    border: 'none',
    color: '#E0E0E0',
    fontSize: 15,
    fontWeight: 300,
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  footer: {
    padding: '16px 20px',
    borderTop: '1px solid #333',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 16px',
    background: 'none',
    border: 'none',
    color: '#8B1E1E',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default function Menu({ onClose, onLogout }: MenuProps) {
  async function handleLogout() {
    await clearTokens();
    await clearDeviceId();
    onLogout();
  }

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.sidebar}>
        <div style={styles.header}>
          <span style={styles.title}>Menu</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.menuItems}>
          <button style={styles.menuItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10, verticalAlign: 'middle' }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Profile
          </button>
          <button style={styles.menuItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10, verticalAlign: 'middle' }}>
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
            </svg>
            Settings
          </button>
          <button style={styles.menuItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10, verticalAlign: 'middle' }}>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Contact
          </button>
        </div>

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
