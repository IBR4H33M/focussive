// ============================================================
// Focussive Extension — Content Script
// ============================================================

// Handles violation overlay injection into web pages

let overlayElement: HTMLDivElement | null = null;
let violationStartTime: number = 0;

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'SHOW_OVERLAY') {
    showOverlay(message.sessionId, message.websiteName);
  }

  if (message.type === 'HIDE_OVERLAY') {
    hideOverlay();
  }
});

function showOverlay(sessionId: string, websiteName: string) {
  // Don't show duplicate overlays
  if (overlayElement) return;

  violationStartTime = Date.now();

  // Create overlay
  overlayElement = document.createElement('div');
  overlayElement.id = 'focussive-violation-overlay';
  overlayElement.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(220, 53, 69, 0.6);
    z-index: 999999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    backdrop-filter: blur(4px);
  `;

  overlayElement.innerHTML = `
    <div style="text-align: center; padding: 32px;">

      <h2 style="color: white; font-size: 24px; font-weight: 600; margin: 0 0 8px 0;">
        Distraction Detected
      </h2>
      <p style="color: rgba(255,255,255,0.9); font-size: 16px; font-weight: 300; margin: 0 0 40px 0;">
        You're visiting <strong>${websiteName}</strong> during a focus session
      </p>

      <!-- Action Buttons -->
      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 320px; margin: 0 auto; width: 100%;">
        <button id="focussive-exit" style="
          background: #333333;
          color: white;
          border: 1px solid transparent;
          padding: 16px 32px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        ">Exit page</button>

        <button id="focussive-allow" style="
          background: #333333;
          color: white;
          border: 1px solid transparent;
          padding: 16px 32px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        ">Allow anyway 🫥</button>

        <button id="focussive-necessary" style="
          background: #333333;
          color: white;
          border: 1px solid transparent;
          padding: 16px 32px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        ">Mark as necessary</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlayElement);

  // Button handlers
  const exitBtn = document.getElementById('focussive-exit');
  const allowBtn = document.getElementById('focussive-allow');
  const necessaryBtn = document.getElementById('focussive-necessary');

  exitBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
  });

  allowBtn?.addEventListener('click', () => {
    const duration = Math.floor((Date.now() - violationStartTime) / 1000);
    chrome.runtime.sendMessage({
      type: 'VIOLATION_RESPONSE',
      sessionId,
      websiteName,
      action: 'allow_anyway',
      durationSeconds: duration,
    });
    hideOverlay();
  });

  necessaryBtn?.addEventListener('click', () => {
    const duration = Math.floor((Date.now() - violationStartTime) / 1000);
    chrome.runtime.sendMessage({
      type: 'VIOLATION_RESPONSE',
      sessionId,
      websiteName,
      action: 'mark_necessary',
      durationSeconds: duration,
    });
    hideOverlay();
  });

  // Hover effects
  [exitBtn, allowBtn, necessaryBtn].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('mouseenter', () => {
      btn.style.borderColor = '#90EE90';
      btn.style.color = '#90EE90';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.borderColor = 'transparent';
      btn.style.color = 'white';
    });
  });

  // Play beep sound (simple oscillator)
  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 2000);
  } catch {
    // Audio may not be available
  }
}

function hideOverlay() {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}

// Clean up when navigating away
window.addEventListener('beforeunload', () => {
  if (overlayElement) {
    const duration = Math.floor((Date.now() - violationStartTime) / 1000);
    // User navigated away — treat as "closed" (no violation logged)
    hideOverlay();
  }
});
