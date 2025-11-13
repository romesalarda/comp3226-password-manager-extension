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
    return true;
  });
})();
