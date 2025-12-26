// Background service worker for OPAQUE extension

console.log('OPAQUE Extension background script loaded');

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  if (request.action === 'ping') {
    sendResponse({ status: 'ok' });
  }
  
  // Handle CSRF token request
  if (request.action === 'getCSRFToken') {
    chrome.cookies.get({
      url: request.url,
      name: 'csrftoken'
    }, (cookie) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ token: cookie?.value || null });
      }
    });
    return true; 
  }
  
  // Handle OPAQUE registration request from content script
  if (request.action === 'registerWithOpaque') {
    console.log('[Background] Received OPAQUE registration request for:', request.username);
    
    // Store registration request for popup to handle
    chrome.storage.local.set({
      'pending_opaque_registration': {
        username: request.username,
        password: request.password,
        timestamp: Date.now()
      }
    }, () => {
      console.log('[Background] Stored pending registration request');
      
      // Try to open popup or notify extension
      // The popup will check for pending registrations on load
      sendResponse({ success: true, queued: true });
    });
    
    return true;
  }
  
  // Handle OPAQUE login request from content script
  if (request.action === 'performOpaqueLogin') {
    console.log('[Background] Received OPAQUE login request for:', request.username);
    
    const username = request.username;
    const password = request.password;
    const origin = request.origin;
    
    // Get CSRF token first
    chrome.cookies.get({
      url: origin,
      name: 'csrftoken'
    }, async (cookie) => {
      const csrfToken = cookie?.value;
      
      try {
        // Forward to the sender tab to execute
        if (sender && sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'executeOpaqueLogin',
            username: username,
            password: password,
            csrfToken: csrfToken
          }, (response) => {
            sendResponse(response || { success: false, error: 'No response from tab' });
          });
        } else {
          // No tab context, queue for popup
          chrome.storage.local.set({
            'pending_opaque_login': {
              username: username,
              password: password,
              timestamp: Date.now()
            }
          });
          sendResponse({ success: false, error: 'Queued for popup', queued: true });
        }
      } catch (error) {
        console.error('[Background] Login setup failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    });
    
    return true;
  }
  
  // Handle popup open request (new message type from page via content script)
  if (request.type === 'open-opaque-popup') {
    console.log('[Background] Received request to open OPAQUE popup');
    
    // Try to use chrome.action.openPopup() (Chrome 127+)
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup()
        .then(() => {
          console.log('[Background] Popup opened successfully');
          sendResponse({ success: true, method: 'action.openPopup' });
        })
        .catch((error) => {
          console.error('[Background] Failed to open popup via action API:', error);
          // Fallback to window creation
          openPopupWindow(sendResponse);
        });
    } else {
      // Fallback for older Chrome versions
      console.log('[Background] chrome.action.openPopup not available, using window fallback');
      openPopupWindow(sendResponse);
    }
    
    return true; // Async response
  }
  
  // Handle popup open request (for queued operations) - legacy action name
  if (request.action === 'openPopupForLogin') {
    console.log('[Background] Opening popup to process queued login');
    
    // Use the same popup opening logic
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup()
        .then(() => {
          console.log('[Background] Popup opened for queued login');
          sendResponse({ success: true, method: 'action.openPopup' });
        })
        .catch((error) => {
          console.error('[Background] Failed to open popup:', error);
          openPopupWindow(sendResponse);
        });
    } else {
      openPopupWindow(sendResponse);
    }
    
    return true;
  }
  
  // Handle OPAQUE result forwarding to content script
  if (request.type === 'opaque-login-complete') {
    console.log('[Background] Forwarding OPAQUE result to content script');
    
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'opaque-result',
          data: request.data
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[Background] Failed to send result to tab:', chrome.runtime.lastError);
          } else {
            console.log('[Background] Result forwarded to tab');
          }
        });
      }
    });
    
    sendResponse({ forwarded: true });
    return true;
  }
  
  return true;
});

// Helper function to open popup as a window
function openPopupWindow(sendResponse) {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 400,
    height: 600
  }, (window) => {
    if (chrome.runtime.lastError) {
      console.error('[Background] Failed to create popup window:', chrome.runtime.lastError);
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      console.log('[Background] Popup window created');
      sendResponse({ success: true, windowId: window.id, method: 'window' });
    }
  });
}
