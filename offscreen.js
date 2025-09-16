// Flatline — offscreen.js
// Handles tab audio capture and processing in an offscreen document.

let audioCtx = null;
let source = null;
let gainNode = null;
let workletNode = null;
let stream = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.namespace !== 'flatline') return;

  if (msg.type === 'start-capture') {
    startCapture(msg.tabId);
  } else if (msg.type === 'stop-capture') {
    stopCapture();
  } else if (msg.type === 'update-volume-db') {
    updateVolume(msg.value);
  }
});

async function startCapture(tabId) {
  try {
    stopCapture(); // stop any existing

    stream = await chrome.tabCapture.capture({ audio: true, video: false });
    if (!stream) throw new Error('No stream');

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    source = audioCtx.createMediaStreamSource(stream);

    // Load worklet
    await audioCtx.audioWorklet.addModule(chrome.runtime.getURL('worklet.js'));

    workletNode = new AudioWorkletNode(audioCtx, 'flatline-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });

    gainNode = audioCtx.createGain();
    gainNode.gain.value = 1; // default

    source.connect(workletNode);
    workletNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Forward level messages
    workletNode.port.onmessage = (ev) => {
      if (ev.data.type === 'level') {
        chrome.runtime.sendMessage({ namespace: 'flatline', type: 'level', db: ev.data.db });
      }
    };

    console.debug('[Flatline offscreen] capture started');
  } catch (e) {
    console.warn('[Flatline offscreen] start capture failed', e);
  }
}

function stopCapture() {
  try {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (gainNode) gainNode.disconnect();
    if (workletNode) workletNode.disconnect();
    if (source) source.disconnect();
    if (audioCtx) audioCtx.close();
    audioCtx = null;
    console.debug('[Flatline offscreen] capture stopped');
  } catch (e) {
    console.warn('[Flatline offscreen] stop capture error', e);
  }
}

function updateVolume(db) {
  if (!gainNode) return;
  const linear = Math.pow(10, db / 20);
  gainNode.gain.value = linear;
  console.debug('[Flatline offscreen] volume updated to', db, 'dB');
}
