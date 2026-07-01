// ============================================================
// Focussive Extension — Sidebar Menu
// ============================================================

import React from 'react';
import { clearTokens } from '../utils/api';

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
  },
  logoutBtn: {
    width: '100%',
    padding: '12px 20px',
    background: 'none',
    border: '1px solid #DC3545',
    borderRadius: 8,
    color: '#DC3545',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
};

export default function Menu({ onClose, onLogout }: MenuProps) {
  async function handleLogout() {
    await clearTokens();
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
            Log Out
          </button>
        </div>
      </div>
    </>
  );
}
