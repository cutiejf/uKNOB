// uKnob — content.js
// Controls volume by setting el.volume on media elements.

let knobValue = 0; // internal -25..25
const STEP = 1.25; // 5% display step
let isOverlayVisible = false;

// element -> { origState, useVolumeFallback }
const mediaMap = new Map();

// Ensure we can receive volume updates immediately from the popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.namespace !== "uknob") return;
  if (msg.type === "update-volume-db") {
    knobValue = Number(msg.value);
    applyKnobValue();
    updatePageUI();
  } else if (msg.type === "toggle-overlay") {
    const controlDiv = document.getElementById('uknob-control');
    if (controlDiv) {
      isOverlayVisible = msg.show;
      controlDiv.style.display = isOverlayVisible ? 'block' : 'none';
      chrome.storage.local.set({ overlayActive: isOverlayVisible });
    }
  }
});

// expose debug helper
window.__uknob = {
  getMediaEntries() { return Array.from(mediaMap.entries()).map(([el, entry]) => ({ el, volume: el.volume, muted: el.muted })); },
  getKnobValue() { return knobValue; }
};

init().catch(console.error);

function injectInterceptor() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('worklet.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => {
      // Once the script is loaded, we can remove it from the DOM.
      script.remove();
      console.log('[uKnob] Web Audio interceptor injected.');
      // Apply the initial volume to any already-existing AudioContexts.
      applyKnobValue();
    };
  } catch (e) {
    console.error('[uKnob] Failed to inject Web Audio interceptor:', e);
  }
}

async function init() {
  // The interceptor must run in all frames, as early as possible.
  injectInterceptor();

  // However, the UI and the rest of the logic should only run in the top-level window
  // to avoid creating multiple overlays.
  if (window.top !== window) {
    return;
  }

  // existing media
  document.querySelectorAll("video, audio").forEach(ensureMedia);

  // watch for new media
  const observer = new MutationObserver((muts) => {
    muts.forEach((m) => {
      if (m.type === "childList") {
        m.addedNodes.forEach(scanNode);
      }
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Add floating control
  if (document.body) {
    const controlDiv = document.createElement('div');
    controlDiv.id = 'uknob-control';
    controlDiv.style.position = 'fixed';
    controlDiv.style.top = '10px';
    controlDiv.style.left = '50%';
    controlDiv.style.transform = 'translateX(-50%)';
    controlDiv.style.zIndex = '9999';
    controlDiv.style.background = '#1a2230';
    controlDiv.style.padding = '5px';
    controlDiv.style.borderRadius = '5px';
    controlDiv.style.display = 'none'; // Initially hidden
    controlDiv.style.flexDirection = 'column';
    controlDiv.style.alignItems = 'center';
    controlDiv.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    controlDiv.style.cursor = 'move';
    controlDiv.innerHTML = `
      <style>
        #uknob-control button {
          position: relative;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.1s;
          box-shadow: 0 2px 3px rgba(0,0,0,0.3);
          background: #555;
          color: #fff;
          border: none;
          border-radius: 3px;
        }
        #uknob-control button:active {
          transform: translateY(2px);
          box-shadow: 0 1px 1px rgba(0,0,0,0.4);
        }
        #page-minus, #page-plus {
          padding: 3px 6px;
          font-size: 12px;
        }
        #page-hide {
          padding: 2px 6px;
          font-size: 10px;
          margin-top: 2px;
        }
      </style>
      <div style="display:flex; flex-direction:column; align-items:center;">
        <div style="display:flex; align-items:center; margin-bottom:4px;">
          <button id="page-minus">-</button>
          <div style="position:relative; display:inline-block; margin:0 6px;">
            <img id="page-knob" src="${chrome.runtime.getURL('icons/icon48.png')}" style="width:48px; height:48px;" />
            <div id="page-value" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:#000080; font-size:14px; font-weight:bold; text-align:center;">0%</div>
          </div>
          <button id="page-plus">+</button>
        </div>
        <button id="page-hide">Hide</button>
      </div>
    `;
    document.body.appendChild(controlDiv);

    const pageMinus = controlDiv.querySelector('#page-minus');
    const pagePlus = controlDiv.querySelector('#page-plus');
    const pageKnob = controlDiv.querySelector('#page-knob');
    const pageValue = controlDiv.querySelector('#page-value');
    const pageHide = controlDiv.querySelector('#page-hide');

    // make knob rotation smoother
    try { pageKnob.style.transition = 'transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)'; } catch (e) {}

    function updatePageUI() {
      const controlDiv = document.getElementById('uknob-control');
      if (controlDiv) {
        const pageValue = controlDiv.querySelector('#page-value');
        const pageKnob = controlDiv.querySelector('#page-knob');
        var percentSigned = (knobValue / 25) * 100; // -100..+100
        var displayPercent = Math.round(percentSigned);
        pageValue.textContent = (displayPercent === 0 ? '0' : displayPercent) + '%';
        pageValue.style.color = '#888';
        var rotation = ((knobValue + 25) / 50) * 270 - 135;
        pageKnob.style.transform = 'rotate(' + rotation + 'deg)';
      }
    }

    let holdTimeout;
    let holdInterval;

    function startHolding(action) {
      action(); // immediate action
      holdTimeout = setTimeout(() => {
        holdInterval = setInterval(action, 200);
      }, 700);
    }

    function stopHolding() {
      clearTimeout(holdTimeout);
      clearInterval(holdInterval);
    }

    const plusAction = () => {
      knobValue += STEP;
      if (knobValue > 25) knobValue = 25;
      applyKnobValue();
      updatePageUI();
      chrome.runtime.sendMessage({ namespace: 'uknob', type: 'update-volume-db', value: knobValue });
      try { chrome.storage.local.set({ volumeDb: knobValue }); } catch (e) {}
    };

    const minusAction = () => {
      knobValue -= STEP;
      if (knobValue < -25) knobValue = -25;
      applyKnobValue();
      updatePageUI();
      chrome.runtime.sendMessage({ namespace: 'uknob', type: 'update-volume-db', value: knobValue });
      try { chrome.storage.local.set({ volumeDb: knobValue }); } catch (e) {}
    };

    pagePlus.addEventListener('mousedown', function () {
      startHolding(plusAction);
    });
    pagePlus.addEventListener('mouseup', stopHolding);
    pagePlus.addEventListener('mouseleave', stopHolding);

    pageMinus.addEventListener('mousedown', function () {
      startHolding(minusAction);
    });
    pageMinus.addEventListener('mouseup', stopHolding);
    pageMinus.addEventListener('mouseleave', stopHolding);

    pageHide.addEventListener('click', () => {
      isOverlayVisible = false;
      controlDiv.style.display = 'none';
      chrome.storage.local.set({ overlayActive: false });
      chrome.runtime.sendMessage({ namespace: 'uknob', type: 'overlay-state-changed', isActive: false });
    });

    // Make draggable
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    controlDiv.addEventListener('mousedown', (e) => {
      // Only start dragging if the click is on the control div itself, not a button within it
      if (e.target !== e.currentTarget && e.target.parentElement !== e.currentTarget) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = controlDiv.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      controlDiv.style.transform = 'none'; // Remove translateX for dragging
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      controlDiv.style.left = (startLeft + dx) + 'px';
      controlDiv.style.top = (startTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey) {
        if (e.key === 'z' || e.key === 'Z') {
          knobValue -= STEP;
          if (knobValue < -25) knobValue = -25;
          applyKnobValue();
          updatePageUI();
          chrome.runtime.sendMessage({ namespace: 'uknob', type: 'update-volume-db', value: knobValue });
          try { chrome.storage.local.set({ volumeDb: knobValue }); } catch (e) {}
        } else if (e.key === '/') {
          knobValue += STEP;
          if (knobValue > 25) knobValue = 25;
          applyKnobValue();
          updatePageUI();
          chrome.runtime.sendMessage({ namespace: 'uknob', type: 'update-volume-db', value: knobValue });
          try { chrome.storage.local.set({ volumeDb: knobValue }); } catch (e) {}
        }
      }
    });

    // Initial state from storage
    chrome.storage.local.get(['overlayActive'], (data) => {
      isOverlayVisible = !!data.overlayActive;
      controlDiv.style.display = isOverlayVisible ? 'block' : 'none';
    });
    updatePageUI();
  }
}

function scanNode(node) {
  if (node.nodeType !== 1) return;
  if (node.matches?.("video, audio")) ensureMedia(node);
  node.querySelectorAll?.("video, audio").forEach(ensureMedia);
}

async function ensureMedia(el) {
  if (mediaMap.has(el)) return;

  try {
    // Always use volume fallback to avoid conflicts with page's Web Audio
    const useVolumeFallback = true;

    // Remember original state
    const origState = { muted: undefined, volume: undefined };
    try { origState.muted = el.muted; } catch (e) {}
    try { origState.volume = el.volume; } catch (e) {}

    // Ensure not muted
    try { el.muted = false; } catch (e) {}

    // Apply initial volume
    applyVolumeToElement(el);

    mediaMap.set(el, { origState, useVolumeFallback });

    // Handle src changes
    const reloadHandler = () => {
      try {
        const current = el.currentSrc || el.src || '';
        const prev = el.__flatline_last_src || '';
        if (current && current !== prev) {
          console.debug('[uKnob] media src changed');
          teardown(el);
          setTimeout(() => ensureMedia(el), 200);
        }
      } catch (e) {}
    };

    const playingHandler = () => {
      applyKnobValue();
    };

    el.addEventListener('loadedmetadata', reloadHandler);
    el.addEventListener('loadstart', reloadHandler);
    el.addEventListener('playing', playingHandler);
    el.addEventListener('emptied', () => teardown(el));
    el.addEventListener('ended', () => teardown(el));
    el.addEventListener('abort', () => teardown(el));

    el.__flatline_last_src = el.currentSrc || el.src || '';

    console.debug("[uKnob] wired", el.tagName);
  } catch (err) {
    console.warn("[uKnob] could not process element:", err);
  }
}

function teardown(el) {
  const entry = mediaMap.get(el);
  if (!entry) return;

  // Restore original state
  try {
    if (entry.origState.muted !== undefined) {
      el.muted = entry.origState.muted;
    }
    if (entry.origState.volume !== undefined) {
      el.volume = entry.origState.volume;
    }
  } catch (e) {}

  try { delete el.__flatline_last_src; } catch (e) {}
  mediaMap.delete(el);
}

function applyKnobValue() {
  // Control <video> and <audio> elements.
  for (const [el, entry] of mediaMap.entries()) {
    applyVolumeToElement(el);
  }
  // Control Web Audio API contexts by sending a message to the injected script.
  try {
    window.postMessage({
      namespace: 'uknob-worklet',
      type: 'set-volume',
      db: knobValue
    }, '*');
  } catch (e) {
    console.warn('[uKnob] Could not post message to worklet.', e);
  }
}

function applyVolumeToElement(el) {
  const entry = mediaMap.get(el);
  if (!entry) return;

  const volumeLinear = Math.pow(10, knobValue / 20);
  const clampedLinear = Math.max(0, Math.min(1, volumeLinear));

  if (!entry.useVolumeFallback) {
    // Use AudioContext for gain
    if (!entry.gainNode) {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const gainNode = audioContext.createGain();
        const source = audioContext.createMediaElementSource(el);
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        entry.audioContext = audioContext;
        entry.gainNode = gainNode;
      } catch (e) {
        console.warn('[uKnob] could not create AudioContext, falling back to volume', e);
        entry.useVolumeFallback = true;
      }
    }
    if (entry.gainNode) {
      try {
        entry.gainNode.gain.setValueAtTime(clampedLinear, 0);
      } catch (e) {
        console.warn('[uKnob] could not set gain value', e);
      }
    }
  } else {
    // Fallback to element.volume
    try {
      el.volume = clampedLinear;
    } catch (e) {
      console.warn('[uKnob] could not set element volume', e);
    }
  }
}
