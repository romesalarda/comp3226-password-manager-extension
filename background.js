(() => {
  // src/background.js
  console.log("OPAQUE Extension background script loaded");
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background received message:", request);
    if (request.action === "ping") {
      sendResponse({ status: "ok" });
    }
    if (request.action === "getCSRFToken") {
      chrome.cookies.get({
        url: request.url,
        name: "csrftoken"
      }, (cookie) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ token: cookie?.value || null });
        }
      });
      return true;
    }
    if (request.action === "registerWithOpaque") {
      console.log("[Background] Received OPAQUE registration request for:", request.username);
      chrome.storage.local.set({
        "pending_opaque_registration": {
          username: request.username,
          password: request.password,
          timestamp: Date.now()
        }
      }, () => {
        console.log("[Background] Stored pending registration request");
        sendResponse({ success: true, queued: true });
      });
      return true;
    }
    if (request.action === "performOpaqueLogin") {
      console.log("[Background] Received OPAQUE login request for:", request.username);
      const username = request.username;
      const password = request.password;
      const origin = request.origin;
      chrome.cookies.get({
        url: origin,
        name: "csrftoken"
      }, async (cookie) => {
        const csrfToken = cookie?.value;
        try {
          if (sender && sender.tab) {
            chrome.tabs.sendMessage(sender.tab.id, {
              action: "executeOpaqueLogin",
              username,
              password,
              csrfToken
            }, (response) => {
              sendResponse(response || { success: false, error: "No response from tab" });
            });
          } else {
            chrome.storage.local.set({
              "pending_opaque_login": {
                username,
                password,
                timestamp: Date.now()
              }
            });
            sendResponse({ success: false, error: "Queued for popup", queued: true });
          }
        } catch (error) {
          console.error("[Background] Login setup failed:", error);
          sendResponse({ success: false, error: error.message });
        }
      });
      return true;
    }
    if (request.type === "open-opaque-popup") {
      console.log("[Background] Received request to open OPAQUE popup");
      if (chrome.action && chrome.action.openPopup) {
        chrome.action.openPopup().then(() => {
          console.log("[Background] Popup opened successfully");
          sendResponse({ success: true, method: "action.openPopup" });
        }).catch((error) => {
          console.error("[Background] Failed to open popup via action API:", error);
          openPopupWindow(sendResponse);
        });
      } else {
        console.log("[Background] chrome.action.openPopup not available, using window fallback");
        openPopupWindow(sendResponse);
      }
      return true;
    }
    if (request.action === "openPopupForLogin") {
      console.log("[Background] Opening popup to process queued login");
      if (chrome.action && chrome.action.openPopup) {
        chrome.action.openPopup().then(() => {
          console.log("[Background] Popup opened for queued login");
          sendResponse({ success: true, method: "action.openPopup" });
        }).catch((error) => {
          console.error("[Background] Failed to open popup:", error);
          openPopupWindow(sendResponse);
        });
      } else {
        openPopupWindow(sendResponse);
      }
      return true;
    }
    if (request.type === "opaque-login-complete") {
      console.log("[Background] Forwarding OPAQUE result to content script");
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: "opaque-result",
            data: request.data
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error("[Background] Failed to send result to tab:", chrome.runtime.lastError);
            } else {
              console.log("[Background] Result forwarded to tab");
            }
          });
        }
      });
      sendResponse({ forwarded: true });
      return true;
    }
    return true;
  });
  function openPopupWindow(sendResponse) {
    chrome.windows.create({
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      width: 400,
      height: 600
    }, (window) => {
      if (chrome.runtime.lastError) {
        console.error("[Background] Failed to create popup window:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log("[Background] Popup window created");
        sendResponse({ success: true, windowId: window.id, method: "window" });
      }
    });
  }
})();
