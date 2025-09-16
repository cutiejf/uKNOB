// uKnob — background.js (MV3)
// Bridges popup <-> content and handles messages.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.namespace !== 'uknob') return;

  // Generic forwarder for messages that go to the content script
  const forwardToContentScript = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, msg, () => {
          // Optional: Check for errors if the content script isn't ready
          if (chrome.runtime.lastError) {
            console.warn(`[uKnob background] Could not send ${msg.type}: ${chrome.runtime.lastError.message}`);
          }
        });
      }
    });
  };

  if (msg.type === 'update-volume-db') {
    // If the message comes from a content script (sender.tab will exist),
    // broadcast it to the extension pages (the popup).
    if (sender.tab) {
      chrome.runtime.sendMessage(msg);
    } else {
      // Otherwise, it came from the popup, so forward it to the content script.
      forwardToContentScript();
    }
  } else if (msg.type === 'toggle-overlay') {
    // This message always originates from the popup and goes to the content script.
    forwardToContentScript();
  }
});
