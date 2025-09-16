// uKnob — popup.js (simplified + tick marks)

document.addEventListener('DOMContentLoaded', function () {
  const STEP = 1.25; // internal step = 5% display
  let volumeDb = 0; // Use a persistent variable for state

  var slider = document.getElementById('volumeSlider');
  var knob = document.getElementById('controlKnob');
  var knobValue = document.getElementById('knobValue');
  var tickMarks = document.getElementById('tickMarks');
  var plusBtn = document.getElementById('plusBtn');
  var minusBtn = document.getElementById('minusBtn');
  var toggleOverlayBtn = document.getElementById('toggleOverlay');
  var returnToExtensionBtn = document.getElementById('returnToExtension');
  var mainControls = document.getElementById('main-controls');
  var overlayActiveView = document.getElementById('overlay-active-view');

  if (!slider || !knob || !knobValue) {
    console.warn('[uKnob popup] missing DOM elements');
    return;
  }

  // make knob rotation smoother
  try { knob.style.transition = 'transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)'; } catch (e) {}

  function sendToBackground(message) {
    try {
      chrome.runtime.sendMessage(message, () => {
        if (chrome.runtime.lastError) {
          console.warn(`[uKnob popup] sendMessage failed for ${message.type}: ${chrome.runtime.lastError.message}`);
        }
      });
    } catch (e) {
      console.warn('[uKnob popup] sendMessage failed', e);
    }
  }

  function getDbFromValue(v) {
    return (v - 50) * 0.5;
  }

  function getValueFromDb(db) {
    return db * 2 + 50;
  }

  function updateUIFromDb(db) {
    var v = getValueFromDb(db);
    var percentSigned = (db / 25) * 100;
    var displayPercent = Math.round(percentSigned);
    knobValue.textContent = (displayPercent === 0 ? '0' : displayPercent) + '%';
    knobValue.style.color = '#888';
    var rotation = ((db + 25) / 50) * 270 - 135;
    knob.style.transform = 'rotate(' + rotation + 'deg)';
    slider.value = v;
  }

  function setOverlayMode(isOverlayActive) {
    mainControls.style.display = isOverlayActive ? 'none' : 'block';
    overlayActiveView.style.display = isOverlayActive ? 'block' : 'none';
  }

  slider.addEventListener('input', function () {
    try {
      volumeDb = getDbFromValue(Number(slider.value));
      updateUIFromDb(volumeDb);
      try { chrome.storage.local.set({ volumeDb: volumeDb }); } catch (e) {}
      sendToBackground({ namespace: 'uknob', type: 'update-volume-db', value: volumeDb });
    } catch (e) { console.error('[uKnob popup] input handler error', e); }
  });

  // keyboard support
  slider.addEventListener('keydown', function (ev) {
    var step = 5;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') {
      slider.value = Number(slider.value) - step; slider.dispatchEvent(new Event('input'));
    } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') {
      slider.value = Number(slider.value) + step; slider.dispatchEvent(new Event('input'));
    }
  });

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
    volumeDb += STEP;
    if (volumeDb > 25) volumeDb = 25;
    updateUIFromDb(volumeDb);
    try { chrome.storage.local.set({ volumeDb: volumeDb }); } catch (e) {}
    sendToBackground({ namespace: 'uknob', type: 'update-volume-db', value: volumeDb });
  };

  const minusAction = () => {
    volumeDb -= STEP;
    if (volumeDb < -25) volumeDb = -25;
    updateUIFromDb(volumeDb);
    try { chrome.storage.local.set({ volumeDb: volumeDb }); } catch (e) {}
    sendToBackground({ namespace: 'uknob', type: 'update-volume-db', value: volumeDb });
  };

  plusBtn.addEventListener('mousedown', function () {
    startHolding(plusAction);
  });
  plusBtn.addEventListener('mouseup', stopHolding);
  plusBtn.addEventListener('mouseleave', stopHolding);

  minusBtn.addEventListener('mousedown', function () {
    startHolding(minusAction);
  });
  minusBtn.addEventListener('mouseup', stopHolding);
  minusBtn.addEventListener('mouseleave', stopHolding);

  toggleOverlayBtn.addEventListener('click', function () {
    sendToBackground({ namespace: 'uknob', type: 'toggle-overlay', show: true });
    setOverlayMode(true);
  });

  returnToExtensionBtn.addEventListener('click', function () {
    sendToBackground({ namespace: 'uknob', type: 'toggle-overlay', show: false });
    setOverlayMode(false);
  });

  // render tick marks (visual)
  try {
    if (tickMarks) {
      tickMarks.innerHTML = '';
      var tickValues = [];
      for (var i = -100; i <= 100; i += 5) tickValues.push(i);
      for (var i = 0; i < tickValues.length; i++) {
        var signed = tickValues[i];
        var v = (signed / 100) * 25;
        var sliderPos = getValueFromDb(v);
        var tick = document.createElement('div');
        var isMajor = (signed % 25 === 0);
        tick.className = isMajor ? 'tick major' : 'tick';
        tick.style.left = sliderPos + '%';
        tickMarks.appendChild(tick);
        if (isMajor) { // label every 25% only
          var lbl = document.createElement('div');
          lbl.className = 'label';
          lbl.style.left = sliderPos + '%';
          lbl.textContent = (signed === 0 ? '0' : signed) + '%';
          tickMarks.appendChild(lbl);
        }
      }
    }
  } catch (e) {}

  // initialize
  try {
    chrome.storage.local.get(['volumeDb', 'overlayActive'], function (data) {
      if (data && typeof data.volumeDb !== 'undefined') {
        volumeDb = Number(data.volumeDb);
        if (volumeDb < -25) volumeDb = -25;
        if (volumeDb > 25) volumeDb = 25;
      } else {
        volumeDb = 0;
      }
      updateUIFromDb(volumeDb);
      sendToBackground({ namespace: 'uknob', type: 'update-volume-db', value: volumeDb });

      setOverlayMode(!!data.overlayActive);

      // Persist defaults if not stored
      if (data && typeof data.volumeDb === 'undefined') {
        chrome.storage.local.set({ volumeDb: volumeDb });
      }
    });
  } catch (e) { console.warn('[uKnob popup] chrome.storage.local.get failed', e); }

  // listen for messages
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.namespace !== 'uknob') return;
    if (msg.type === 'update-volume-db') {
      volumeDb = Number(msg.value);
      updateUIFromDb(volumeDb);
    } else if (msg.type === 'overlay-state-changed') {
      setOverlayMode(msg.isActive);
    }
  });
});
