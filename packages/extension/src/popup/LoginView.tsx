// ============================================================
// Focussive Extension — Login View
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
// @ts-expect-error qrcode untyped in extension
import QRCode from 'qrcode';
import { authApi, setToken, setRefreshToken } from '../utils/api';
import { setDeviceId } from '../utils/storage';

interface LoginViewProps {
  onSuccess: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px 18px',
    color: '#E0E0E0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  logo: {
    textAlign: 'center' as const,
    marginBottom: 20,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 400,
    letterSpacing: 2,
    color: '#E0E0E0',
    marginTop: 6,
  },
  tabs: {
    display: 'flex',
    borderRadius: 8,
    backgroundColor: '#1E1E1E',
    padding: 3,
    marginBottom: 18,
    gap: 4,
  },
  tab: {
    flex: 1,
    padding: '7px 4px',
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'center' as const,
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: '#888',
    transition: 'all 0.2s ease',
  },
  tabActive: {
    backgroundColor: '#2A2A2A',
    color: '#FFF',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  input: {
    height: 40,
    border: '1px solid #333',
    borderRadius: 8,
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 13,
    backgroundColor: '#222',
    color: '#E0E0E0',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  button: {
    height: 40,
    borderRadius: 8,
    border: 'none',
    backgroundColor: '#435432',
    color: 'white',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 6,
    transition: 'opacity 0.2s',
  },
  error: {
    color: '#EF4444',
    fontSize: 12,
    textAlign: 'center' as const,
    marginTop: 10,
    padding: '6px 10px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 6,
    border: '1px solid rgba(239, 68, 68, 0.2)',
  },
  qrContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    textAlign: 'center' as const,
  },
  qrBox: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  pinText: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 4,
    color: '#90EE90',
    fontFamily: 'monospace',
    marginTop: 4,
  },
  qrPrompt: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    lineHeight: 1.4,
  },
  refreshButton: {
    background: 'none',
    border: 'none',
    color: '#90EE90',
    fontSize: 12,
    cursor: 'pointer',
    marginTop: 10,
    textDecoration: 'underline',
  },
};

export default function LoginView({ onSuccess }: LoginViewProps) {
  const [tab, setTab] = useState<'qr' | 'code' | 'email'>('qr');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // QR Pairing State
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pairingPin, setPairingPin] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleLoginResponse(response: {
    token?: string;
    refresh_token?: string;
    device_id?: string | null;
  }) {
    if (response.token) await setToken(response.token);
    if (response.refresh_token) await setRefreshToken(response.refresh_token);
    if (response.device_id) await setDeviceId(response.device_id);
    onSuccess();
  }

  // Start QR Pairing session
  async function initQRPairing() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setQrLoading(true);
    setError('');
    try {
      const res = await authApi.pairingStart();
      setPairingPin(res.pin);
      setTimeLeft(res.expires_in_seconds || 300);

      // Generate QR data URL
      const dataUrl = await QRCode.toDataURL(res.code, {
        width: 170,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      setQrDataUrl(dataUrl);

      // Poll for approval every 2 seconds
      pollTimerRef.current = setInterval(async () => {
        try {
          const check = await authApi.pairingCheck(res.pin);
          if (check.approved && check.token && check.refresh_token) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            await handleLoginResponse(check);
          }
        } catch {
          // ignore transient poll errors
        }
      }, 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to start QR pairing');
    } finally {
      setQrLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'qr') {
      initQRPairing();
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [tab]);

  // Countdown timer for QR
  useEffect(() => {
    if (tab !== 'qr' || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [tab, timeLeft]);

  // Handle manual code login (code generated on mobile)
  async function handleManualCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualCode.trim()) {
      setError('Please enter the connection code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await authApi.qrLogin(manualCode.trim());
      await handleLoginResponse(response);
    } catch (err: any) {
      const msg = err?.message || 'Connection failed';
      if (msg.includes('INVALID_QR') || msg.includes('Invalid or expired')) {
        setError('This code is invalid or expired. Check your mobile app.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  // Handle email login
  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await authApi.login(email.trim(), password);
      await handleLoginResponse(response);
    } catch (err: any) {
      const msg = err?.message || 'Login failed';
      if (msg.includes('INVALID_CREDENTIALS') || msg.includes('Invalid email')) {
        setError('Incorrect email or password');
      } else if (msg.includes('EMAIL_NOT_VERIFIED')) {
        setError('Please verify your email address in the mobile app first');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.logo}>
        <img
          src="/icons/icon-128.png"
          alt="Focussive"
          style={{ width: 48, height: 48, objectFit: 'contain', margin: '0 auto', display: 'block' }}
        />
        <div style={styles.logoText}>Focussive</div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(tab === 'qr' ? styles.tabActive : {}) }}
          onClick={() => { setTab('qr'); setError(''); }}
        >
          Scan QR Code
        </button>
        <button
          style={{ ...styles.tab, ...(tab === 'code' ? styles.tabActive : {}) }}
          onClick={() => { setTab('code'); setError(''); }}
        >
          Enter Code
        </button>
        <button
          style={{ ...styles.tab, ...(tab === 'email' ? styles.tabActive : {}) }}
          onClick={() => { setTab('email'); setError(''); }}
        >
          Email
        </button>
      </div>

      {/* TAB 1: Real QR Code + 6-digit PIN */}
      {tab === 'qr' && (
        <div style={styles.qrContainer}>
          {qrLoading ? (
            <div style={{ padding: '40px 0', color: '#888', fontSize: 13 }}>
              Generating QR code...
            </div>
          ) : qrDataUrl && timeLeft > 0 ? (
            <>
              <div style={styles.qrBox}>
                <img
                  src={qrDataUrl}
                  alt="Pairing QR Code"
                  style={{ width: 170, height: 170, display: 'block' }}
                />
              </div>
              <div style={styles.qrPrompt}>
                Scan with Focussive mobile app, or enter PIN:
              </div>
              {pairingPin && <div style={styles.pinText}>{pairingPin}</div>}
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                Expires in {formatSeconds(timeLeft)}
              </div>
            </>
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <p style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>
                QR code expired
              </p>
              <button style={styles.refreshButton} onClick={initQRPairing}>
                Generate New Code
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Enter Mobile One-Time Code */}
      {tab === 'code' && (
        <form style={styles.form} onSubmit={handleManualCodeSubmit}>
          <p style={{ color: '#999', fontSize: 12, textAlign: 'center', margin: '4px 0 10px 0', lineHeight: 1.4 }}>
            Generate a connection code from the Focussive mobile app (Settings &gt; Extension) and enter it below:
          </p>
          <input
            style={{ ...styles.input, textAlign: 'center', letterSpacing: 3, fontWeight: 600, fontSize: 16 }}
            type="text"
            placeholder="CODE"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            autoFocus
          />
          <button
            style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Connecting...' : 'Connect Extension'}
          </button>
        </form>
      )}

      {/* TAB 3: Email & Password */}
      {tab === 'email' && (
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
      )}

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}
