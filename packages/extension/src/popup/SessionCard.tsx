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

function getBreakSecondsLeft(breakEndsAt: string | null): number {
  if (!breakEndsAt) return 0;
  return Math.max(0, Math.floor((new Date(breakEndsAt).getTime() - Date.now()) / 1000));
}

export default function SessionCard({ session, onCancel }: SessionCardProps) {
  const [remaining, setRemaining] = useState(0);
  const [cardScreen, setCardScreen] = useState<CardScreen>('main');
  const [breakMinutes, setBreakMinutes] = useState(1);

  // Break state comes from storage (synced from API) — universal across mobile + extension
  const isOnBreak = session.is_on_break;
  const [breakSecondsLeft, setBreakSecondsLeft] = useState(() => getBreakSecondsLeft(session.break_ends_at));

  const remainingBreakMin = Math.floor(session.remaining_break_seconds / 60);
  const hasBreakTime = session.allow_breaks && session.remaining_break_seconds > 0 && !isOnBreak;

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

  // Break countdown — derived from break_ends_at
  useEffect(() => {
    if (!isOnBreak || !session.break_ends_at) {
      setBreakSecondsLeft(0);
      return;
    }
    setBreakSecondsLeft(getBreakSecondsLeft(session.break_ends_at));
    const interval = setInterval(() => {
      setBreakSecondsLeft(getBreakSecondsLeft(session.break_ends_at!));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOnBreak, session.break_ends_at]);

  const handleStartBreak = useCallback(() => {
    chrome.runtime.sendMessage({
      type: 'START_BREAK',
      sessionId: session.id,
      minutes: breakMinutes,
    });
    setCardScreen('main');
  }, [session.id, breakMinutes]);

  // Main timer reads amber during break, dark green otherwise (both sit on the green card fill)
  const timerColor = isOnBreak ? AMBER_DARK : GREEN_DARK;

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
          {/* Main session countdown — always visible, amber on break */}
          <div style={{ ...s.countdown, color: timerColor }}>{formatCountdown(remaining)}</div>

          {/* Break ongoing indicator */}
          {isOnBreak && (
            <div style={s.breakRow}>
              <span style={s.breakLabel}>Break ongoing</span>
              <span style={s.breakCountdown}>{formatCountdown(breakSecondsLeft)}</span>
            </div>
          )}

          {/* Stats */}
          <div style={s.stats}>
            {session.violations_count > 0 ? (
              <span style={s.violations}>
                {session.violations_count} violation{session.violations_count !== 1 ? 's' : ''}
              </span>
            ) : (
              <span style={s.noViolations}>No violations</span>
            )}
          </div>

          {/* Break button — only show if not currently on break */}
          {session.allow_breaks && !isOnBreak && (
            <div style={{ marginTop: 14 }}>
              {hasBreakTime ? (
                <button
                  style={s.breakBtn}
                  onClick={() => { setBreakMinutes(1); setCardScreen('breakPicker'); }}
                >
                  Take a break
                  <span style={s.breakBtnSub}>{remainingBreakMin} min available</span>
                </button>
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
          <div style={{ color: GREEN_DARK, fontSize: 14, marginBottom: 16 }}>Choose break duration</div>

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

// Active-session card is filled green; all foreground colors below are dark
// shades chosen for solid contrast against that fill (no reliance on borders).
const GREEN = '#90EE90';
const GREEN_DARK = '#154D27';
const GREEN_DARK_MUTED = '#2B5E3C';
const AMBER_DARK = '#7A4A00';
const RED_DARK = '#A32020';

const s: Record<string, React.CSSProperties> = {
  card: {
    width: 320,
    margin: '0 auto',
    padding: 20,
    borderRadius: 14,
    backgroundColor: GREEN,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  name: { fontSize: 18, fontWeight: 500, color: GREEN_DARK },
  cancelBtn: {
    width: 28, height: 28, borderRadius: 14,
    border: 'none',
    background: 'rgba(21,77,39,0.12)', color: RED_DARK,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  countdown: {
    textAlign: 'center',
    fontSize: 42, fontWeight: 200,
    fontVariantNumeric: 'tabular-nums',
    margin: '8px 0', letterSpacing: 2,
    // color set inline (dark green or dark amber)
  },
  breakRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 4,
    padding: '6px 12px',
    borderRadius: 8,
    backgroundColor: 'rgba(21,77,39,0.10)',
  },
  breakLabel: {
    fontSize: 12,
    color: AMBER_DARK,
    fontWeight: 500,
    letterSpacing: 0.5,
  },
  breakCountdown: {
    fontSize: 18,
    fontWeight: 300,
    color: AMBER_DARK,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 1,
  },
  stats: { textAlign: 'center', marginTop: 8 },
  violations: { fontSize: 13, fontWeight: 500, color: RED_DARK },
  noViolations: { fontSize: 13, fontWeight: 400, color: GREEN_DARK_MUTED },
  breakBtn: {
    width: '100%', padding: '12px 16px',
    borderRadius: 10, border: 'none',
    background: GREEN_DARK, color: '#FFFFFF',
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  },
  breakBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 400 },
  breakBtnDisabled: {
    width: '100%', padding: '12px 16px',
    borderRadius: 10, border: 'none',
    background: 'rgba(21,77,39,0.08)', color: 'rgba(21,77,39,0.45)',
    fontSize: 13, textAlign: 'center', boxSizing: 'border-box',
  },
  arrowBtn: {
    background: 'none', border: 'none',
    color: GREEN_DARK_MUTED, fontSize: 18, cursor: 'pointer', padding: '6px 32px',
  },
  pickerNum: {
    color: GREEN_DARK, fontSize: 52, fontWeight: 200, lineHeight: 1,
  },
  pickerLabel: { color: GREEN_DARK_MUTED, fontSize: 13, marginTop: 0 },
  confirmBreakBtn: {
    width: '100%', padding: '11px 16px',
    borderRadius: 10, border: 'none',
    background: GREEN_DARK, color: '#FFFFFF',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
  },
  backBtn: {
    background: 'none', border: 'none',
    color: GREEN_DARK_MUTED, fontSize: 13, cursor: 'pointer',
    padding: '8px 0', width: '100%',
  },
};
