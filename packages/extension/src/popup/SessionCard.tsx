// ============================================================
// Focussive Extension — Active Session Card
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import type { StoredSession } from '../utils/storage';
import { formatCountdown, getRemainingSeconds } from '@focussive/shared';
import type { Session } from '@focussive/shared';

interface SessionCardProps {
  session: StoredSession;
  onCancel?: () => void;
}

type CardScreen = 'main' | 'breakPicker';

export default function SessionCard({ session, onCancel }: SessionCardProps) {
  const [remaining, setRemaining] = useState(0);
  const [cardScreen, setCardScreen] = useState<CardScreen>('main');
  const [breakMinutes, setBreakMinutes] = useState(1);
  const [breakActive, setBreakActive] = useState(false);
  const [breakSecondsLeft, setBreakSecondsLeft] = useState(0);

  const remainingBreakMin = Math.floor(session.remaining_break_seconds / 60);
  const hasBreakTime = session.allow_breaks && session.remaining_break_seconds > 0 && !breakActive;

  // Session countdown
  useEffect(() => {
    const sessionLike = {
      started_at: session.started_at,
      duration: session.duration,
    } as Session;

    setRemaining(getRemainingSeconds(sessionLike));

    const interval = setInterval(() => {
      setRemaining(getRemainingSeconds(sessionLike));
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  // Break countdown
  useEffect(() => {
    if (!breakActive || breakSecondsLeft <= 0) return;

    const interval = setInterval(() => {
      setBreakSecondsLeft(s => {
        if (s <= 1) {
          setBreakActive(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [breakActive, breakSecondsLeft]);

  // Listen for BREAK_ENDED from background
  useEffect(() => {
    const handler = (msg: { type: string }) => {
      if (msg.type === 'BREAK_ENDED') {
        setBreakActive(false);
        setBreakSecondsLeft(0);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const handleStartBreak = useCallback(() => {
    chrome.runtime.sendMessage({
      type: 'START_BREAK',
      sessionId: session.id,
      minutes: breakMinutes,
    });
    setBreakActive(true);
    setBreakSecondsLeft(breakMinutes * 60);
    setCardScreen('main');
  }, [session.id, breakMinutes]);

  return (
    <div style={s.card}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.name}>{session.name}</span>
        {onCancel && (
          <button style={s.cancelBtn} onClick={onCancel} title="Cancel session">✕</button>
        )}
      </div>

      {/* Main screen */}
      {cardScreen === 'main' && (
        <>
          {/* Countdown or break indicator */}
          {breakActive ? (
            <div style={s.breakDisplay}>
              <div style={s.breakIcon}>☕</div>
              <div style={s.breakCountdown}>{formatCountdown(breakSecondsLeft)}</div>
              <div style={s.breakLabel}>on break</div>
            </div>
          ) : (
            <div style={s.countdown}>{formatCountdown(remaining)}</div>
          )}

          {/* Stats */}
          <div style={s.stats}>
            {session.violations_count > 0 ? (
              <span style={s.violations}>
                {session.violations_count} violation{session.violations_count !== 1 ? 's' : ''}
              </span>
            ) : (
              <span style={s.noViolations}>No violations — keep going! 💪</span>
            )}
          </div>

          {/* Break button */}
          {session.allow_breaks && (
            <div style={{ marginTop: 14 }}>
              {hasBreakTime ? (
                <button
                  style={s.breakBtn}
                  onClick={() => { setBreakMinutes(1); setCardScreen('breakPicker'); }}
                >
                  ☕ Take a break
                  <span style={s.breakBtnSub}>{remainingBreakMin} min remaining</span>
                </button>
              ) : breakActive ? (
                <div style={s.breakBtnDisabled}>On break</div>
              ) : (
                <div style={s.breakBtnDisabled}>No break time available</div>
              )}
            </div>
          )}
        </>
      )}

      {/* Break picker screen */}
      {cardScreen === 'breakPicker' && (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ color: '#E0E0E0', fontSize: 14, marginBottom: 16 }}>Choose break duration</div>

          {/* Picker */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, marginBottom: 16 }}>
            <button
              style={s.arrowBtn}
              onClick={() => setBreakMinutes(m => Math.min(m + 1, remainingBreakMin))}
            >▲</button>
            <div>
              <span style={s.pickerNum}>{breakMinutes}</span>
              <div style={s.pickerLabel}>min</div>
            </div>
            <button
              style={s.arrowBtn}
              onClick={() => setBreakMinutes(m => Math.max(m - 1, 1))}
            >▼</button>
          </div>

          <button style={s.confirmBreakBtn} onClick={handleStartBreak}>
            Start {breakMinutes} min break
          </button>
          <button style={s.backBtn} onClick={() => setCardScreen('main')}>Back</button>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    width: 320,
    margin: '0 auto',
    padding: 20,
    borderRadius: 14,
    border: '2px solid #90EE90',
    backgroundColor: '#252525',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  name: { fontSize: 18, fontWeight: 500, color: '#E0E0E0' },
  cancelBtn: {
    width: 28, height: 28, borderRadius: 14,
    border: '1.5px solid #DC3545',
    background: 'none', color: '#DC3545',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  countdown: {
    textAlign: 'center',
    fontSize: 42, fontWeight: 200,
    color: '#90EE90',
    fontVariantNumeric: 'tabular-nums',
    margin: '8px 0', letterSpacing: 2,
  },
  breakDisplay: {
    textAlign: 'center', margin: '8px 0',
  },
  breakIcon: { fontSize: 28, marginBottom: 4 },
  breakCountdown: {
    fontSize: 36, fontWeight: 200,
    color: '#FFD580', fontVariantNumeric: 'tabular-nums', letterSpacing: 2,
  },
  breakLabel: { fontSize: 12, color: '#FFD580', opacity: 0.7, marginTop: 2 },
  stats: { textAlign: 'center', marginTop: 8 },
  violations: { fontSize: 13, fontWeight: 500, color: '#DC3545' },
  noViolations: { fontSize: 13, fontWeight: 400, color: '#999' },
  breakBtn: {
    width: '100%', padding: '12px 16px',
    borderRadius: 10, border: '1.5px solid #90EE90',
    background: 'rgba(144,238,144,0.15)', color: '#90EE90',
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  },
  breakBtnSub: { fontSize: 11, color: 'rgba(144,238,144,0.65)', fontWeight: 400 },
  breakBtnDisabled: {
    width: '100%', padding: '12px 16px',
    borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)',
    fontSize: 13, textAlign: 'center', boxSizing: 'border-box',
  },
  arrowBtn: {
    background: 'none', border: 'none',
    color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer', padding: '6px 32px',
  },
  pickerNum: {
    color: '#E0E0E0', fontSize: 52, fontWeight: 200, lineHeight: 1,
  },
  pickerLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 0 },
  confirmBreakBtn: {
    width: '100%', padding: '11px 16px',
    borderRadius: 10, border: '1.5px solid #90EE90',
    background: 'rgba(144,238,144,0.18)', color: '#90EE90',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
  },
  backBtn: {
    background: 'none', border: 'none',
    color: 'rgba(255,255,255,0.4)', fontSize: 13, cursor: 'pointer',
    padding: '8px 0', width: '100%',
  },
};
