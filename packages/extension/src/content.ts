// ============================================================
// Focussive Extension — Content Script (Violation Overlay)
// ============================================================

// ─── Element refs ─────────────────────────────────────────────

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
type OverlayScreen = 'idle' | 'selectBreak' | 'selectAllow';

let overlayScreen: OverlayScreen = 'idle';
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
  overlayScreen = 'idle';
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

  if (overlayScreen === 'idle') renderIdle();
  else if (overlayScreen === 'selectBreak') renderPicker('break');
  else if (overlayScreen === 'selectAllow') renderPicker('allow');
}

function renderIdle() {
  if (!overlayElement) return;

  overlayElement.innerHTML = `
    <div style="text-align:center; padding:36px 28px; max-width:380px; margin:0 auto; width:100%;">
      <h2 style="color:white; font-size:26px; font-weight:700; margin:0 0 10px; letter-spacing:0.3px;">
        Distraction Detected
      </h2>
      <p style="color:rgba(255,255,255,0.8); font-size:14px; font-weight:300; margin:0 0 36px; line-height:1.5;">
        You're visiting <strong style="font-weight:600;">${currentWebsiteName}</strong> during a focus session
      </p>

      <div style="display:flex; flex-direction:column; gap:10px;">

        <!-- Exit -->
        <button id="foc-exit" style="${BTN_BASE} background:rgba(0,0,0,0.55); border:1.5px solid rgba(255,255,255,0.25); color:white;">
          Exit page
        </button>

        <!-- Take a break — only if break time available -->
        ${breakAvailable
          ? `<button id="foc-break" style="${BTN_BASE} background:rgba(30,80,30,0.75); border:1.5px solid #90EE90; color:#90EE90;">
               Take a break
               <span style="display:block; font-size:11px; margin-top:3px; color:rgba(144,238,144,0.75);">${breakMaxMinutes} min remaining</span>
             </button>`
          : ''
        }

        <!-- Allow anyway -->
        <button id="foc-allow" style="${BTN_BASE} background:rgba(60,20,20,0.7); border:1.5px solid rgba(255,100,100,0.5); color:rgba(255,180,180,0.9);">
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
      overlayScreen = 'selectBreak';
      breakMinutes = 1;
      renderScreen();
    });
  }

  document.getElementById('foc-allow')?.addEventListener('click', () => {
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
    ? "Breaks don't count as distracted time"
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
        <button id="foc-back" style="background:none; border:none; color:rgba(255,255,255,0.4); font-size:13px; cursor:pointer; padding:10px;">Back</button>
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
    showOverlay(currentSessionId, currentWebsiteName, breakAvailable, breakMaxMinutes * 60);
  }, durationSeconds * 1000);
}

// ─── Helpers ─────────────────────────────────────────────────

const BTN_BASE = `
  width:100%; padding:14px 24px; border-radius:12px;
  font-size:15px; font-weight:500; cursor:pointer;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  box-sizing:border-box; text-align:center;
  transition: transform 0.12s, opacity 0.12s;
`;

function applyBaseStyles(el: HTMLDivElement) {
  el.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(160, 30, 40, 0.82);
    z-index: 999999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  `;
}

function attachHoverEffects(ids: string[]) {
  ids.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-1px) scale(1.02)';
      btn.style.opacity = '0.88';
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
