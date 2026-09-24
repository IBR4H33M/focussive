// ============================================================
// Focussive Extension — Content Script (Violation Overlay)
// ============================================================

import { MOTIVATIONAL_QUOTES } from '@focussive/shared';
import { getExtensionSettings, type ExtensionSettings, DEFAULT_EXTENSION_SETTINGS } from './utils/storage';

// ─── Element refs ─────────────────────────────────────────────

let overlayElement: HTMLDivElement | null = null;
let currentSessionId = '';
let currentWebsiteName = '';
let countdownInterval: ReturnType<typeof setInterval> | null = null;
let countdownRemaining = 5;

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'SHOW_OVERLAY') {
    showOverlay(
      message.sessionId,
      message.websiteName,
      message.allowBreaks ?? false,
      message.remainingBreakSeconds ?? 0,
      message.settings
    );
  }

  if (message.type === 'HIDE_OVERLAY') {
    hideOverlay();
  }
});

// ─── State ────────────────────────────────────────────────────
type OverlayScreen = 'idle' | 'selectBreak' | 'selectAllow';

let overlayScreen: OverlayScreen = 'idle';
let breakMinutes = 1;
let allowMinutes = 1;
let breakAvailable = false;
let breakMaxMinutes = 0;
let currentSettings: ExtensionSettings = DEFAULT_EXTENSION_SETTINGS;
let selectedQuote = '';

// ─── Show / Hide ─────────────────────────────────────────────

async function showOverlay(
  sessionId: string,
  websiteName: string,
  allowBreaks: boolean,
  remainingBreakSeconds: number,
  initialSettings?: ExtensionSettings
) {
  if (overlayElement) return; // don't duplicate

  currentSessionId = sessionId;
  currentWebsiteName = websiteName;
  breakAvailable = allowBreaks && remainingBreakSeconds > 0;
  breakMaxMinutes = Math.floor(remainingBreakSeconds / 60) || 1;
  overlayScreen = 'idle';
  breakMinutes = 1;
  allowMinutes = 1;

  // Load latest settings
  if (initialSettings) {
    currentSettings = initialSettings;
  } else {
    try {
      currentSettings = await getExtensionSettings();
    } catch {
      currentSettings = DEFAULT_EXTENSION_SETTINGS;
    }
  }

  // Pick random quote
  if (currentSettings.overlay_quote_enabled && MOTIVATIONAL_QUOTES.length > 0) {
    const qIdx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
    selectedQuote = MOTIVATIONAL_QUOTES[qIdx];
  } else {
    selectedQuote = '';
  }

  countdownRemaining = currentSettings.auto_close_seconds || 5;

  overlayElement = document.createElement('div');
  overlayElement.id = 'focussive-violation-overlay';
  applyBaseStyles(overlayElement);

  document.body.appendChild(overlayElement);
  renderScreen();

  if (currentSettings.sound_enabled) {
    playAlert();
  }

  // Start auto-close countdown if enabled
  if (currentSettings.auto_close_tab) {
    startCountdown();
  }
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function startCountdown() {
  stopCountdown();
  countdownInterval = setInterval(() => {
    countdownRemaining -= 1;
    const numEl = document.getElementById('foc-countdown-number');
    if (numEl) {
      numEl.textContent = String(countdownRemaining);
    }
    if (countdownRemaining <= 0) {
      stopCountdown();
      chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
    }
  }, 1000);
}

function hideOverlay() {
  stopCountdown();
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}

function resolveImageSrc(urlOrId?: string | null): string | null {
  if (!urlOrId) return chrome.runtime.getURL('blockimages/cat-no.gif');
  if (urlOrId.startsWith('http://') || urlOrId.startsWith('https://')) {
    return urlOrId;
  }
  if (urlOrId.includes('dog-really')) {
    return chrome.runtime.getURL('blockimages/dog-really.gif');
  }
  if (urlOrId.includes('dont-answer')) {
    return chrome.runtime.getURL('blockimages/dont-answer.gif');
  }
  return chrome.runtime.getURL('blockimages/cat-no.gif');
}

// ─── Rendering ───────────────────────────────────────────────

function renderScreen() {
  if (!overlayElement) return;

  if (overlayScreen === 'idle') renderIdle();
  else if (overlayScreen === 'selectBreak') renderPicker('break');
  else if (overlayScreen === 'selectAllow') renderPicker('allow');
}

function renderIdle() {
  if (!overlayElement) return;

  const imageSrc = currentSettings.overlay_gif_enabled
    ? resolveImageSrc(currentSettings.overlay_gif_url)
    : null;

  overlayElement.innerHTML = `
    <div style="text-align:center; padding:32px 24px; max-width:400px; margin:0 auto; width:100%; box-sizing:border-box;">
      <h2 style="color:#FFFFFF; font-size:24px; font-weight:700; margin:0 0 8px; letter-spacing:0.3px;">
        Distraction Detected
      </h2>
      <p style="color:rgba(255,255,255,0.7); font-size:14px; font-weight:400; margin:0 0 16px; line-height:1.4;">
        You're visiting <strong style="color:#FFFFFF; font-weight:600;">${currentWebsiteName}</strong> during a focus session
      </p>

      ${imageSrc ? `
        <div style="margin:0 auto 16px auto; width:130px; height:130px; border-radius:14px; overflow:hidden; border:2px solid rgba(255,255,255,0.15); box-shadow:0 8px 24px rgba(0,0,0,0.5);">
          <img src="${imageSrc}" alt="Block" style="width:100%; height:100%; object-fit:cover; display:block;" />
        </div>
      ` : ''}

      ${currentSettings.overlay_quote_enabled && selectedQuote ? `
        <p style="font-style:italic; color:rgba(255,255,255,0.85); font-size:13px; margin:0 0 18px; line-height:1.5; padding:0 8px;">
          "${selectedQuote}"
        </p>
      ` : ''}

      ${currentSettings.auto_close_tab ? `
        <!-- Large countdown container -->
        <div id="foc-countdown-box" style="margin: 0 0 20px; background:rgba(0,0,0,0.45); border:1.5px solid rgba(255,107,107,0.35); border-radius:14px; padding:12px 16px; text-align:center;">
          <div style="font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:rgba(255,255,255,0.6); margin-bottom:2px;">
            CLOSING TAB IN
          </div>
          <div id="foc-countdown-number" style="font-size:54px; font-weight:800; color:#FF6B6B; font-family:-apple-system, BlinkMacSystemFont, monospace; line-height:1.1;">
            ${countdownRemaining}
          </div>
          <div style="font-size:11px; color:rgba(255,255,255,0.45); margin-top:2px;">
            seconds · Select an option below to stay
          </div>
        </div>
      ` : ''}

      <div style="display:flex; flex-direction:column; gap:10px;">

        <!-- Exit / Close Tab -->
        <button id="foc-exit" style="${BTN_BASE} background:rgba(255,255,255,0.08); border:1.5px solid rgba(255,255,255,0.22); color:#FFFFFF;">
          Close tab now
        </button>

        <!-- Take a break — only if break time available -->
        ${breakAvailable
          ? `<button id="foc-break" style="${BTN_BASE} background:rgba(30,80,30,0.75); border:1.5px solid #90EE90; color:#90EE90;">
               Take a break
               <span style="display:block; font-size:11px; margin-top:2px; color:rgba(144,238,144,0.75);">${breakMaxMinutes} min remaining</span>
             </button>`
          : ''
        }

        <!-- Allow anyway -->
        <button id="foc-allow" style="${BTN_BASE} background:rgba(80,20,20,0.65); border:1.5px solid rgba(255,100,100,0.4); color:rgba(255,180,180,0.9);">
          Allow anyway
        </button>

      </div>
    </div>
  `;

  // Attach events
  document.getElementById('foc-exit')?.addEventListener('click', () => {
    stopCountdown();
    chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
  });

  if (breakAvailable) {
    document.getElementById('foc-break')?.addEventListener('click', () => {
      stopCountdown();
      overlayScreen = 'selectBreak';
      breakMinutes = 1;
      renderScreen();
    });
  }

  document.getElementById('foc-allow')?.addEventListener('click', () => {
    stopCountdown();
    overlayScreen = 'selectAllow';
    allowMinutes = 1;
    renderScreen();
  });

  attachHoverEffects([
    'foc-exit',
    ...(breakAvailable ? ['foc-break'] : []),
    'foc-allow',
  ]);
}

function renderPicker(mode: 'break' | 'allow') {
  if (!overlayElement) return;

  const isBreak = mode === 'break';
  const max = isBreak ? breakMaxMinutes : 5;
  const current = isBreak ? breakMinutes : allowMinutes;

  const title = isBreak ? 'Take a break' : 'WARNING!';
  const subtitle = isBreak
    ? "Breaks don't count as<br />distracted time."
    : 'You are getting distracted within a focus session!';
  const titleColor = isBreak ? '#90EE90' : '#FF6B6B';
  const subtitleColor = isBreak ? 'rgba(255,255,255,0.7)' : 'rgba(255,180,180,0.85)';
  const confirmLabel = isBreak ? `Start ${current} min break` : `Allow ${current} min`;
  const confirmStyle = isBreak
    ? `background:rgba(30,80,30,0.8); border:1.5px solid #90EE90; color:#90EE90;`
    : `background:rgba(80,20,20,0.8); border:1.5px solid #FF6B6B; color:#FF6B6B;`;

  overlayElement.innerHTML = `
    <div style="text-align:center; padding:36px 28px; max-width:380px; margin:0 auto; width:100%;">
      <h2 style="color:${titleColor}; font-size:26px; font-weight:700; margin:0 0 8px;">${title}</h2>
      <p style="color:${subtitleColor}; font-size:13px; font-weight:400; margin:0 0 28px; line-height:1.5;">${subtitle}</p>

      <!-- Picker -->
      <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:32px;">
        <button id="foc-up" style="background:none; border:none; color:rgba(255,255,255,0.7); font-size:24px; cursor:pointer; padding:8px 48px; transition:color 0.15s;">▲</button>
        <div>
          <span id="foc-num" style="color:white; font-size:76px; font-weight:200; line-height:1;">${current}</span>
          <div style="color:rgba(255,255,255,0.5); font-size:15px; margin-top:-6px;">min</div>
        </div>
        <button id="foc-down" style="background:none; border:none; color:rgba(255,255,255,0.7); font-size:24px; cursor:pointer; padding:8px 48px; transition:color 0.15s;">▼</button>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px;">
        <button id="foc-confirm" style="${BTN_BASE} ${confirmStyle}">${confirmLabel}</button>
        <button id="foc-back" style="background:none; border:none; color:rgba(255,255,255,0.4); font-size:13px; cursor:pointer; padding:10px;">&lt; Back</button>
      </div>
    </div>
  `;

  // Up/down
  document.getElementById('foc-up')?.addEventListener('click', () => {
    if (isBreak) {
      breakMinutes = Math.min(breakMinutes + 1, max);
    } else {
      allowMinutes = Math.min(allowMinutes + 1, max);
    }
    renderScreen();
  });

  document.getElementById('foc-down')?.addEventListener('click', () => {
    if (isBreak) {
      breakMinutes = Math.max(breakMinutes - 1, 1);
    } else {
      allowMinutes = Math.max(allowMinutes - 1, 1);
    }
    renderScreen();
  });

  // Arrow hover effects
  ['foc-up', 'foc-down'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('mouseenter', () => { el.style.color = 'white'; el.style.transform = 'scale(1.15)'; });
    el.addEventListener('mouseleave', () => { el.style.color = 'rgba(255,255,255,0.7)'; el.style.transform = 'scale(1)'; });
  });

  // Confirm
  document.getElementById('foc-confirm')?.addEventListener('click', () => {
    if (isBreak) {
      confirmBreak();
    } else {
      confirmAllow();
    }
  });

  attachHoverEffects(['foc-confirm']);

  // Back
  document.getElementById('foc-back')?.addEventListener('click', () => {
    overlayScreen = 'idle';
    renderScreen();
  });
}

// ─── Actions ─────────────────────────────────────────────────

function confirmBreak() {
  chrome.runtime.sendMessage({
    type: 'START_BREAK',
    sessionId: currentSessionId,
    minutes: breakMinutes,
  });
  hideOverlay();
}

function confirmAllow() {
  const durationSeconds = allowMinutes * 60;
  chrome.runtime.sendMessage({
    type: 'VIOLATION_RESPONSE',
    sessionId: currentSessionId,
    websiteName: currentWebsiteName,
    action: 'allow_anyway',
    durationSeconds,
  });
  hideOverlay();

  // Re-show overlay after the allow window expires
  setTimeout(() => {
    showOverlay(currentSessionId, currentWebsiteName, breakAvailable, breakMaxMinutes * 60, currentSettings);
  }, durationSeconds * 1000);
}

// ─── Helpers ─────────────────────────────────────────────────

const BTN_BASE = `
  width:100%; padding:13px 20px; border-radius:12px;
  font-size:14px; font-weight:600; cursor:pointer;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  box-sizing:border-box; text-align:center;
  transition: transform 0.12s, opacity 0.12s;
`;

function applyBaseStyles(el: HTMLDivElement) {
  el.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(14, 14, 18, 0.94);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  `;
}

function attachHoverEffects(ids: string[]) {
  ids.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-1px) scale(1.02)';
      btn.style.opacity = '0.9';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0) scale(1)';
      btn.style.opacity = '1';
    });
    btn.addEventListener('mousedown', () => {
      btn.style.transform = 'translateY(0) scale(0.98)';
    });
    btn.addEventListener('mouseup', () => {
      btn.style.transform = 'translateY(-1px) scale(1.02)';
    });
  });
}

function playAlert() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 650;
    osc.type = 'sine';
    gain.gain.value = 0.25;
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 400);
  } catch {
    // Audio context not allowed or unavailable
  }
}

// Clean up when navigating away
window.addEventListener('beforeunload', () => {
  hideOverlay();
});
