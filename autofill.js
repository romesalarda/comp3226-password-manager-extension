(() => {
  // src/autofill.js
  console.log("[Autofill] Content script loaded");
  var autofillBadge = null;
  function getCurrentDomain() {
    return window.location.origin;
  }
  function findLoginFields() {
    const passwordFields = Array.from(document.querySelectorAll('input[type="password"]'));
    if (passwordFields.length === 0) {
      return null;
    }
    const loginForms = [];
    passwordFields.forEach((passwordField) => {
      const form = passwordField.closest("form") || document;
      const usernameField = findUsernameField(form, passwordField);
      loginForms.push({
        usernameField,
        passwordField,
        form: passwordField.closest("form")
      });
    });
    return loginForms.length > 0 ? loginForms : null;
  }
  function findUsernameField(container, passwordField) {
    const usernameSelectors = [
      'input[type="email"]',
      'input[type="text"][name*="user"]',
      'input[type="text"][name*="email"]',
      'input[type="text"][name*="login"]',
      'input[type="text"][id*="user"]',
      'input[type="text"][id*="email"]',
      'input[type="text"][id*="login"]',
      'input[type="tel"]',
      'input[type="text"]'
      // fallback to any text input
    ];
    for (const selector of usernameSelectors) {
      const fields = Array.from(container.querySelectorAll(selector));
      for (const field of fields) {
        if (field.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING) {
          return field;
        }
      }
    }
    return null;
  }
  async function getStoredCredentials(domain) {
    return new Promise((resolve) => {
      chrome.storage.local.get([`credentials_${domain}`], (result) => {
        if (chrome.runtime.lastError) {
          console.error("[Autofill] Error getting credentials:", chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve(result[`credentials_${domain}`] || null);
        }
      });
    });
  }
  async function saveCredentials(domain, username, password) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({
        [`credentials_${domain}`]: {
          username,
          password,
          savedAt: Date.now()
        }
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("[Autofill] Error saving credentials:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log("[Autofill] Credentials saved for domain:", domain);
          resolve();
        }
      });
    });
  }
  function fillLoginForm(loginForm, credentials) {
    if (loginForm.usernameField && credentials.username) {
      loginForm.usernameField.value = credentials.username;
      loginForm.usernameField.dispatchEvent(new Event("input", { bubbles: true }));
      loginForm.usernameField.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (loginForm.passwordField && credentials.password) {
      loginForm.passwordField.value = credentials.password;
      loginForm.passwordField.dispatchEvent(new Event("input", { bubbles: true }));
      loginForm.passwordField.dispatchEvent(new Event("change", { bubbles: true }));
    }
    console.log("[Autofill] Form filled with stored credentials");
  }
  function showAutofillBadge(loginForms, credentials) {
    removeAutofillBadge();
    autofillBadge = document.createElement("div");
    autofillBadge.id = "opaque-autofill-badge";
    autofillBadge.innerHTML = `
    <div class="badge-content">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      <span>Password saved</span>
      <button id="autofill-trigger">Fill</button>
    </div>
  `;
    const style = document.createElement("style");
    style.textContent = `
    #opaque-autofill-badge {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 14px;
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    #opaque-autofill-badge .badge-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #opaque-autofill-badge button {
      background: white;
      color: #667eea;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    #opaque-autofill-badge button:hover {
      transform: scale(1.05);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    #opaque-autofill-badge button:active {
      transform: scale(0.98);
    }
  `;
    document.head.appendChild(style);
    document.body.appendChild(autofillBadge);
    const fillButton = document.getElementById("autofill-trigger");
    if (fillButton) {
      fillButton.addEventListener("click", () => {
        loginForms.forEach((form) => fillLoginForm(form, credentials));
        setTimeout(() => {
          if (autofillBadge) {
            autofillBadge.style.opacity = "0";
            setTimeout(removeAutofillBadge, 300);
          }
        }, 500);
      });
    }
    setTimeout(() => {
      if (autofillBadge) {
        autofillBadge.style.opacity = "0";
        setTimeout(removeAutofillBadge, 300);
      }
    }, 1e4);
  }
  function removeAutofillBadge() {
    if (autofillBadge && autofillBadge.parentNode) {
      autofillBadge.parentNode.removeChild(autofillBadge);
      autofillBadge = null;
    }
  }
  function showSaveConfirmation(isUpdate = false) {
    const notification = document.createElement("div");
    notification.id = "opaque-save-notification";
    notification.innerHTML = `
    <div class="notification-content">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>Password ${isUpdate ? "updated" : "saved"} for this site</span>
    </div>
  `;
    const style = document.createElement("style");
    style.textContent = `
    #opaque-save-notification {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 14px;
      animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    #opaque-save-notification .notification-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `;
    document.head.appendChild(style);
    document.body.appendChild(notification);
    setTimeout(() => {
      notification.style.opacity = "0";
      notification.style.transform = "translateY(20px)";
      notification.style.transition = "all 0.3s ease-out";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3e3);
  }
  function showSavePasswordPrompt(username, password, domain, isUpdate = false) {
    const existingPrompt = document.getElementById("opaque-save-prompt");
    if (existingPrompt) {
      console.log("[Autofill] Prompt already exists, skipping duplicate");
      return;
    }
    setTimeout(() => {
      createAndShowPrompt(username, password, domain, isUpdate);
    }, 100);
  }
  function createAndShowPrompt(username, password, domain, isUpdate = false) {
    if (document.getElementById("opaque-save-prompt")) {
      return;
    }
    const prompt = document.createElement("div");
    prompt.id = "opaque-save-prompt";
    prompt.setAttribute("data-opaque-extension", "true");
    prompt.innerHTML = `
    <div class="prompt-content">
      <div class="prompt-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <h4>${isUpdate ? "Update password?" : "Save password?"}</h4>
      </div>
      <p>${isUpdate ? "Would you like to update the saved password" : "Would you like to save this password"} for <strong>${new URL(domain).hostname}</strong>?</p>
      <div class="prompt-info">
        <span class="username-display">\u{1F464} ${username}</span>
      </div>
      <div class="prompt-actions">
        <button class="btn-save">${isUpdate ? "Update" : "Save"}</button>
        <button class="btn-never">Never</button>
        <button class="btn-not-now">Not Now</button>
      </div>
    </div>
  `;
    const style = document.createElement("style");
    style.textContent = `
    #opaque-save-prompt {
      position: fixed;
      top: 60px;
      right: 20px;
      z-index: 2147483647;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      width: 360px;
      animation: slideInRight 0.3s ease-out;
      border: 1px solid #e0e0e0;
    }

    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    #opaque-save-prompt .prompt-content {
      padding: 20px;
    }

    #opaque-save-prompt .prompt-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    #opaque-save-prompt .prompt-header svg {
      color: #667eea;
      flex-shrink: 0;
    }

    #opaque-save-prompt .prompt-header h4 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    #opaque-save-prompt p {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: #555;
      line-height: 1.4;
    }

    #opaque-save-prompt p strong {
      color: #333;
      font-weight: 600;
    }

    #opaque-save-prompt .prompt-info {
      background: #f5f5f5;
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 16px;
    }

    #opaque-save-prompt .username-display {
      font-size: 13px;
      color: #666;
      font-family: monospace;
    }

    #opaque-save-prompt .prompt-actions {
      display: flex;
      gap: 8px;
    }

    #opaque-save-prompt button {
      flex: 1;
      padding: 10px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    #opaque-save-prompt .btn-save {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    #opaque-save-prompt .btn-save:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    #opaque-save-prompt .btn-never {
      background: #f5f5f5;
      color: #666;
    }

    #opaque-save-prompt .btn-never:hover {
      background: #e0e0e0;
    }

    #opaque-save-prompt .btn-not-now {
      background: #f5f5f5;
      color: #666;
    }

    #opaque-save-prompt .btn-not-now:hover {
      background: #e0e0e0;
    }

    #opaque-save-prompt button:active {
      transform: translateY(0);
    }
  `;
    document.head.appendChild(style);
    if (document.body) {
      document.body.appendChild(prompt);
    } else {
      const observer = new MutationObserver(() => {
        if (document.body) {
          document.body.appendChild(prompt);
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }
    const promptObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node === prompt && prompt.dataset.userDismissed !== "true") {
            console.log("[Autofill] Prompt removed by page navigation, re-adding");
            setTimeout(() => {
              if (document.body && !document.getElementById("opaque-save-prompt")) {
                document.body.appendChild(prompt);
              }
            }, 100);
          }
        });
      });
    });
    if (document.body) {
      promptObserver.observe(document.body, { childList: true });
    }
    const saveBtn = prompt.querySelector(".btn-save");
    const neverBtn = prompt.querySelector(".btn-never");
    const notNowBtn = prompt.querySelector(".btn-not-now");
    saveBtn.addEventListener("click", async () => {
      try {
        prompt.dataset.userDismissed = "true";
        promptObserver.disconnect();
        await saveCredentials(domain, username, password);
        clearDraft();
        console.log(`[Autofill] Credentials ${isUpdate ? "updated" : "saved"} by user choice`);
        prompt.remove();
        showSaveConfirmation(isUpdate);
      } catch (error) {
        console.error("[Autofill] Failed to save credentials:", error);
      }
    });
    neverBtn.addEventListener("click", () => {
      prompt.dataset.userDismissed = "true";
      promptObserver.disconnect();
      chrome.storage.local.set({ [`never_save_${domain}`]: true });
      clearDraft();
      console.log('[Autofill] User chose "Never" for domain:', domain);
      prompt.remove();
    });
    notNowBtn.addEventListener("click", () => {
      prompt.dataset.userDismissed = "true";
      promptObserver.disconnect();
      console.log('[Autofill] User chose "Not Now" - keeping draft');
      prompt.remove();
    });
    setTimeout(() => {
      if (prompt.parentNode) {
        prompt.dataset.userDismissed = "true";
        promptObserver.disconnect();
        prompt.style.opacity = "0";
        prompt.style.transform = "translateX(100%)";
        prompt.style.transition = "all 0.3s ease-out";
        setTimeout(() => prompt.remove(), 300);
      }
    }, 3e4);
  }
  function saveToDraft(username, password) {
    const domain = getCurrentDomain();
    const draft = {
      domain,
      username,
      password,
      timestamp: Date.now()
    };
    const credentials = getStoredCredentials(domain);
    if (credentials && credentials.username === username && credentials.password === password) {
      console.log("[Autofill] Credentials match stored ones, not saving draft");
      return;
    }
    try {
      localStorage.setItem("opaque_credential_draft", JSON.stringify(draft));
      console.log("[Autofill] Credentials saved to draft");
    } catch (error) {
      console.error("[Autofill] Failed to save draft to localStorage:", error);
    }
  }
  function getDraft() {
    try {
      const draftStr = localStorage.getItem("opaque_credential_draft");
      if (!draftStr)
        return null;
      const draft = JSON.parse(draftStr);
      if (Date.now() - draft.timestamp > 5 * 60 * 1e3) {
        clearDraft();
        return null;
      }
      return draft;
    } catch (error) {
      console.error("[Autofill] Failed to read draft from localStorage:", error);
      return null;
    }
  }
  function clearDraft() {
    try {
      localStorage.removeItem("opaque_credential_draft");
      console.log("[Autofill] Draft cleared");
    } catch (error) {
      console.error("[Autofill] Failed to clear draft:", error);
    }
  }
  function monitorCredentialInputs() {
    console.log("[Autofill] Setting up credential input monitoring");
    const fieldCache = /* @__PURE__ */ new Map();
    const handleInput = (event) => {
      const target = event.target;
      const isPasswordField = target.type === "password";
      const isUsernameField = target.type === "email" || target.type === "text" || target.type === "tel";
      if (!isPasswordField && !isUsernameField)
        return;
      const form = target.closest("form") || document;
      let usernameField = null;
      let passwordField = null;
      if (isPasswordField) {
        passwordField = target;
        usernameField = findUsernameField(form, passwordField);
      } else {
        usernameField = target;
        passwordField = form.querySelector('input[type="password"]');
      }
      if (usernameField && passwordField && usernameField.value && passwordField.value) {
        const username = usernameField.value;
        const password = passwordField.value;
        const cacheKey = `${usernameField}:${passwordField}`;
        const cachedValues = fieldCache.get(cacheKey);
        if (!cachedValues || cachedValues.username !== username || cachedValues.password !== password) {
          fieldCache.set(cacheKey, { username, password });
          saveToDraft(username, password);
        }
      }
    };
    document.addEventListener("input", handleInput, true);
    const observer = new MutationObserver(() => {
      fieldCache.clear();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  function checkForDraftAndPrompt() {
    const draft = getDraft();
    if (draft && draft.username && draft.password) {
      console.log("[Autofill] Found existing draft, showing save prompt");
      setTimeout(() => {
        showSavePasswordPrompt(draft.username, draft.password, draft.domain, false);
      }, 1e3);
    }
  }
  async function init() {
    console.log("[Autofill] Initializing autofill system");
    const credentials = await getStoredCredentials(getCurrentDomain());
    if (credentials) {
      console.log("[Autofill] Stored credentials found, setting up focus detection");
      localStorage.removeItem("opaque_credential_draft");
    }
    setupSPARouteDetection();
    monitorCredentialInputs();
    checkForDraftAndPrompt();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attemptAutofill);
    } else {
      attemptAutofill();
    }
    setTimeout(attemptAutofill, 2e3);
  }
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("listener triggered", request);
    if (request.action === "saveCredentials") {
      const domain = getCurrentDomain();
      saveCredentials(domain, request.username, request.password).then(() => {
        clearDraft();
        sendResponse({ success: true });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
    if (request.action === "fillCredentials") {
      attemptAutofill();
      sendResponse({ success: true });
      return true;
    }
    if (request.action === "getDraft") {
      const draft = getDraft();
      console.log("draft is as follow :", draft);
      sendResponse({ draft });
      return true;
    }
    if (request.action === "clearDraft") {
      clearDraft();
      sendResponse({ success: true });
      return true;
    }
  });
  init();
  async function attemptAutofill() {
    const domain = getCurrentDomain();
    const credentials = await getStoredCredentials(domain);
    if (!credentials) {
      console.log("[Autofill] No stored credentials for domain:", domain);
      removeAutofillBadge();
      return;
    }
    console.log("[Autofill] Found stored credentials for domain:", domain);
    setTimeout(async () => {
      const loginForms = findLoginFields();
      if (!loginForms || loginForms.length === 0) {
        console.log("[Autofill] No login forms found on page");
        removeAutofillBadge();
        return;
      }
      console.log("[Autofill] Found", loginForms.length, "login form(s)");
      fillLoginForm(loginForms[0], credentials);
      showAutofillBadge(loginForms, credentials);
    }, 1e3);
  }
  function setupSPARouteDetection() {
    console.log("[Autofill] Setting up SPA route change detection");
    let autofillThrottleTimer = null;
    const throttledAutofill = () => {
      if (autofillThrottleTimer) {
        clearTimeout(autofillThrottleTimer);
      }
      autofillThrottleTimer = setTimeout(() => {
        console.log("[Autofill] Route change detected, attempting autofill");
        attemptAutofill();
      }, 500);
    };
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      console.log("[Autofill] pushState intercepted");
      throttledAutofill();
    };
    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      console.log("[Autofill] replaceState intercepted");
      throttledAutofill();
    };
    window.addEventListener("popstate", () => {
      console.log("[Autofill] popstate event detected");
      throttledAutofill();
    });
    window.addEventListener("hashchange", () => {
      console.log("[Autofill] hashchange event detected");
      throttledAutofill();
    });
  }
})();
