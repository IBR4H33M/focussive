// ============================================================
// Focussive Extension — Content Script
// ============================================================

// Handles violation overlay injection into web pages

let overlayElement: HTMLDivElement | null = null;
let currentSessionId = '';
let currentWebsiteName = '';

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'SHOW_OVERLAY') {
    showOverlay(
      message.sessionId,
      message.websiteName,
      message.allowBreaks ?? false,
      message.remainingBreakSeconds ?? 0,
    );
  }

  if (message.type === 'HIDE_OVERLAY') {
    hideOverlay();
  }
});

// ─── State ────────────────────────────────────────────────────
type Screen = 'idle' | 'selectBreak' | 'selectAllow';

let screen: Screen = 'idle';
let breakMinutes = 1;
let allowMinutes = 1;
let breakAvailable = false;
let breakMaxMinutes = 0;

// ─── Show / Hide ─────────────────────────────────────────────

function showOverlay(sessionId: string, websiteName: string, allowBreaks: boolean, remainingBreakSeconds: number) {
  if (overlayElement) return; // don't duplicate

  currentSessionId = sessionId;
  currentWebsiteName = websiteName;
  breakAvailable = allowBreaks && remainingBreakSeconds > 0;
  breakMaxMinutes = Math.floor(remainingBreakSeconds / 60) || 1;
  screen = 'idle';
  breakMinutes = 1;
  allowMinutes = 1;

  overlayElement = document.createElement('div');
  overlayElement.id = 'focussive-violation-overlay';
  applyBaseStyles(overlayElement);

  document.body.appendChild(overlayElement);
  renderScreen();
  playAlert();
}

function hideOverlay() {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}

// ─── Rendering ───────────────────────────────────────────────

function renderScreen() {
  if (!overlayElement) return;

  if (screen === 'idle') renderIdle();
  else if (screen === 'selectBreak') renderPicker('break');
  else if (screen === 'selectAllow') renderPicker('allow');
}

function renderIdle() {
  if (!overlayElement) return;

  const breakDisabledText = breakAvailable ? '' : 'No break time available';
  const breakBtnStyle = breakAvailable
    ? `background: rgba(144,238,144,0.2); border: 1.5px solid #90EE90; color: #90EE90; cursor: pointer;`
    : `background: rgba(255,255,255,0.05); border: 1.5px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.3); cursor: default;`;

  overlayElement.innerHTML = `
    <div style="text-align:center; padding:32px; max-width:360px; margin:0 auto; width:100%;">
      <h2 style="color:white; font-size:24px; font-weight:600; margin:0 0 8px;">
        Distraction Detected
      </h2>
      <p style="color:rgba(255,255,255,0.85); font-size:15px; font-weight:300; margin:0 0 40px;">
        You're visiting <strong>${currentWebsiteName}</strong> during a focus session
      </p>

      <div style="display:flex; flex-direction:column; gap:12px;">
        <!-- Exit -->
        <button id="foc-exit" style="${BTN_BASE} background:#2a2a2a; border:1.5px solid rgba(255,255,255,0.15); color:white;">
          Exit page
        </button>

        <!-- Take a break -->
        ${breakAvailable
          ? `<button id="foc-break" style="${BTN_BASE} ${breakBtnStyle}">
               ☕ Take a break
               <span style="display:block; font-size:12px; margin-top:3px; color:rgba(144,238,144,0.7);">${breakMaxMinutes} min remaining</span>
             </button>`
          : `<div style="${BTN_BASE} ${breakBtnStyle} cursor:default;">${breakDisabledText}</div>`
        }

        <!-- Allow anyway -->
        <button id="foc-allow" style="${BTN_BASE} background:rgba(255,255,255,0.1); border:1.5px solid rgba(255,255,255,0.2); color:white;">
          Allow anyway
        </button>
      </div>
    </div>
  `;

  // Attach events
  document.getElementById('foc-exit')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
  });

  if (breakAvailable) {
    document.getElementById('foc-break')?.addEventListener('click', () => {
      screen = 'selectBreak';
      breakMinutes = 1;
      renderScreen();
    });
  }

  document.getElementById('foc-allow')?.addEventListener('click', () => {
    screen = 'selectAllow';
    allowMinutes = 1;
    renderScreen();
  });

  attachHoverEffects(['foc-exit', ...(breakAvailable ? ['foc-break'] : []), 'foc-allow']);
}

function renderPicker(mode: 'break' | 'allow') {
  if (!overlayElement) return;

  const isBreak = mode === 'break';
  const max = isBreak ? breakMaxMinutes : 5;
  const current = isBreak ? breakMinutes : allowMinutes;
  const title = isBreak ? 'Take a break' : 'Allow anyway';
  const subtitle = isBreak
    ? 'Choose break duration'
    : 'This will be counted as distracted time';
  const confirmLabel = isBreak ? `Start ${current} min break` : `Allow ${current} min`;
  const confirmStyle = isBreak
    ? `background:rgba(144,238,144,0.2); border:1.5px solid #90EE90; color:#90EE90;`
    : `background:rgba(255,255,255,0.12); border:1.5px solid rgba(255,255,255,0.25); color:white;`;

  overlayElement.innerHTML = `
    <div style="text-align:center; padding:32px; max-width:360px; margin:0 auto; width:100%;">
      <h2 style="color:white; font-size:24px; font-weight:600; margin:0 0 8px;">${title}</h2>
      <p style="color:rgba(255,255,255,0.85); font-size:15px; font-weight:300; margin:0 0 32px;">${subtitle}</p>

      <!-- Picker -->
      <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:36px;">
        <button id="foc-up" style="background:none; border:none; color:rgba(255,255,255,0.65); font-size:22px; cursor:pointer; padding:10px 40px;">▲</button>
        <div>
          <span id="foc-num" style="color:white; font-size:72px; font-weight:200; line-height:1;">${current}</span>
          <div style="color:rgba(255,255,255,0.55); font-size:16px; margin-top:-4px;">min</div>
        </div>
        <button id="foc-down" style="background:none; border:none; color:rgba(255,255,255,0.65); font-size:22px; cursor:pointer; padding:10px 40px;">▼</button>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px;">
        <button id="foc-confirm" style="${BTN_BASE} ${confirmStyle}">${confirmLabel}</button>
        <button id="foc-back" style="background:none; border:none; color:rgba(255,255,255,0.45); font-size:14px; cursor:pointer; padding:12px;">Back</button>
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

  // Confirm
  document.getElementById('foc-confirm')?.addEventListener('click', () => {
    if (isBreak) {
      chrome.runtime.sendMessage({
        type: 'START_BREAK',
        sessionId: currentSessionId,
        minutes: breakMinutes,
      });
      hideOverlay();
    } else {
      chrome.runtime.sendMessage({
        type: 'VIOLATION_RESPONSE',
        sessionId: currentSessionId,
        websiteName: currentWebsiteName,
        action: 'allow_anyway',
        durationSeconds: allowMinutes * 60,
      });
      hideOverlay();
    }
  });

  // Back
  document.getElementById('foc-back')?.addEventListener('click', () => {
    screen = 'idle';
    renderScreen();
  });
}

// ─── Helpers ─────────────────────────────────────────────────

const BTN_BASE = `
  width:100%; padding:14px 24px; border-radius:12px;
  font-size:15px; font-weight:500;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  box-sizing:border-box; text-align:center;
`;

function applyBaseStyles(el: HTMLDivElement) {
  el.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(220, 53, 69, 0.65);
    z-index: 999999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    backdrop-filter: blur(4px);
  `;
}

function attachHoverEffects(ids: string[]) {
  ids.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('mouseenter', () => {
      btn.style.opacity = '0.85';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.opacity = '1';
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
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.value = 0.3;
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 1500);
  } catch {
    // Audio not available
  }
}

// Clean up when navigating away
window.addEventListener('beforeunload', () => {
  hideOverlay();
});
