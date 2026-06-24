// ============================================================
// Focussive Extension — Login View
// ============================================================

import React, { useState } from 'react';
import { authApi, setToken, setRefreshToken } from '../utils/api';

interface LoginViewProps {
  onSuccess: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px 20px',
  },
  logo: {
    textAlign: 'center' as const,
    marginBottom: 32,
  },
  logoIcon: {
    fontSize: 48,
    color: '#90EE90',
  },
  logoText: {
    fontSize: 24,
    fontWeight: 300,
    letterSpacing: 2,
    color: '#E0E0E0',
    marginTop: 8,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  input: {
    height: 44,
    border: '1px solid #333',
    borderRadius: 10,
    paddingLeft: 14,
    paddingRight: 14,
    fontSize: 14,
    fontWeight: 300,
    backgroundColor: '#252525',
    color: '#E0E0E0',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  button: {
    height: 44,
    borderRadius: 10,
    border: 'none',
    backgroundColor: '#2D5016',
    color: 'white',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
  error: {
    color: '#DC3545',
    fontSize: 13,
    textAlign: 'center' as const,
    marginTop: 8,
  },
  divider: {
    textAlign: 'center' as const,
    color: '#666',
    fontSize: 13,
    margin: '20px 0',
  },
  qrSection: {
    textAlign: 'center' as const,
  },
  qrInput: {
    height: 44,
    border: '1px solid #333',
    borderRadius: 10,
    paddingLeft: 14,
    paddingRight: 14,
    fontSize: 14,
    fontWeight: 300,
    backgroundColor: '#252525',
    color: '#E0E0E0',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    textAlign: 'center' as const,
    letterSpacing: 2,
    marginBottom: 12,
  },
  qrButton: {
    height: 44,
    borderRadius: 10,
    border: '1px solid #90EE90',
    backgroundColor: 'transparent',
    color: '#90EE90',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    width: '100%',
  },
  footer: {
    textAlign: 'center' as const,
    marginTop: 24,
    fontSize: 12,
    color: '#666',
  },
  link: {
    color: '#90EE90',
    cursor: 'pointer',
    textDecoration: 'none',
  },
};

export default function LoginView({ onSuccess }: LoginViewProps) {
  const [mode, setMode] = useState<'email' | 'qr'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await authApi.login(email, password);
      await setToken(response.token);
      await setRefreshToken(response.refresh_token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleQRLogin() {
    if (!qrCode.trim()) {
      setError('Please enter the connection code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await authApi.qrLogin(qrCode.trim());
      await setToken(response.token);
      await setRefreshToken(response.refresh_token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'QR login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.logo}>
        <div style={styles.logoIcon}>↩</div>
        <div style={styles.logoText}>Focussive</div>
      </div>

      {mode === 'email' ? (
        <form style={styles.form} onSubmit={handleEmailLogin}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
      ) : (
        <div style={styles.qrSection}>
          <p style={{ color: '#999', fontSize: 13, marginBottom: 16 }}>
            Enter the connection code from your Focussive mobile app
          </p>
          <input
            style={styles.qrInput}
            type="text"
            placeholder="Connection Code"
            value={qrCode}
            onChange={(e) => setQrCode(e.target.value)}
          />
          <button
            style={{ ...styles.qrButton, opacity: loading ? 0.6 : 1 }}
            onClick={handleQRLogin}
            disabled={loading}
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.divider}>
        {mode === 'email' ? (
          <span style={styles.link} onClick={() => { setMode('qr'); setError(''); }}>
            Login with QR Code →
          </span>
        ) : (
          <span style={styles.link} onClick={() => { setMode('email'); setError(''); }}>
            ← Login with Email
          </span>
        )}
      </div>

      <div style={styles.footer}>
        New user? <span style={styles.link}>Get the Focussive app!</span>
      </div>
    </div>
  );
}
