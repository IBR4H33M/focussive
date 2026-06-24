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
    display: 'block',
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
          <button style={styles.menuItem}>👤  Profile</button>
          <button style={styles.menuItem}>⚙️  Settings</button>
          <button style={styles.menuItem}>📧  Contact</button>
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
