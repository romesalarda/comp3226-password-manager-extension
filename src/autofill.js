// Autofill content script for password manager functionality
console.log('[Autofill] Content script loaded');

let autofillBadge = null;

// Inject page-level script for OPAQUE UI and event handling
function injectPageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('opaque-page-injected.js');
  script.type = 'text/javascript';
  script.onload = () => {
    console.log('[Autofill] Page script injected successfully');
    script.remove(); // Clean up after injection
  };
  script.onerror = (error) => {
    console.error('[Autofill] Failed to inject page script:', error);
  };
  (document.head || document.documentElement).appendChild(script);
}

// Listen for credential check request from page script
window.addEventListener('OPAQUE:CheckCredentials', async (event) => {
  console.log('[Autofill] Received OPAQUE:CheckCredentials from page');
  
  const domain = getCurrentDomain();
  const credentials = await getStoredCredentials(domain);
  const hasCredentials = credentials !== null;
  
  console.log('[Autofill] Has credentials for domain:', hasCredentials);
  
  // Send response back to page script
  window.dispatchEvent(new CustomEvent('OPAQUE:CredentialsStatus', {
    detail: { hasCredentials }
  }));
});

// Listen for OPAQUE login request from page script
window.addEventListener('OPAQUE:RequestLogin', (event) => {
  console.log('[Autofill] Received OPAQUE:RequestLogin from page', event.detail);
  
  // Forward to background script to open popup
  chrome.runtime.sendMessage({ 
    type: 'open-opaque-popup',
    origin: event.detail.origin 
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Autofill] Failed to request popup:', chrome.runtime.lastError);
    } else {
      console.log('[Autofill] Popup open request sent:', response);
    }
  });
});


// Listen for OPAQUE results from background/popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'opaque-result') {
    console.log('[Autofill] Received OPAQUE result, forwarding to page');
    
    // Dispatch result to page script
    window.dispatchEvent(new CustomEvent('OPAQUE:Complete', {
      detail: request.data
    }));
    
    sendResponse({ received: true });
    return true;
  }
});

/**
 * Get current page domain/URL
 */
function getCurrentDomain() {
  return window.location.origin;
}

/**
 * Find login form fields on the page
 */
function findLoginFields() {
  // Find password fields
  const passwordFields = Array.from(document.querySelectorAll('input[type="password"]'));
  
  if (passwordFields.length === 0) {
    return null;
  }

  // For each password field, try to find associated username field
  const loginForms = [];
  
  passwordFields.forEach(passwordField => {
    const form = passwordField.closest('form') || document;
    
    // Find potential username fields (email, text, tel inputs before password)
    const usernameField = findUsernameField(form, passwordField);
    
    loginForms.push({
      usernameField,
      passwordField,
      form: passwordField.closest('form')
    });
  });

  return loginForms.length > 0 ? loginForms : null;
}

/**
 * Find username field associated with a password field
 */
function findUsernameField(container, passwordField) {
  // Common username field types and names
  const usernameSelectors = [
    'input[type="email"]',
    'input[type="text"][name*="user"]',
    'input[type="text"][name*="email"]',
    'input[type="text"][name*="login"]',
    'input[type="text"][id*="user"]',
    'input[type="text"][id*="email"]',
    'input[type="text"][id*="login"]',
    'input[type="tel"]',
    'input[type="text"]' // fallback to any text input
  ];

  for (const selector of usernameSelectors) {
    const fields = Array.from(container.querySelectorAll(selector));
    
    // Find field that comes before password field in DOM
    for (const field of fields) {
      if (field.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING) {
        return field;
      }
    }
  }

  return null;
}

/**
 * Get stored credentials for current domain
 */
async function getStoredCredentials(domain) {
  return new Promise((resolve) => {
    chrome.storage.local.get([`credentials_${domain}`], (result) => {
      if (chrome.runtime.lastError) {
        console.error('[Autofill] Error getting credentials:', chrome.runtime.lastError);
        resolve(null);
      } else {
        resolve(result[`credentials_${domain}`] || null);
      }
    });
  });
}

/**
 * Save credentials for a domain
 */
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
        console.error('[Autofill] Error saving credentials:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        console.log('[Autofill] Credentials saved for domain:', domain);
        resolve();
      }
    });
  });
}

/**
 * Fill login form with credentials
 */
function fillLoginForm(loginForm, credentials) {
  if (loginForm.usernameField && credentials.username) {
    loginForm.usernameField.value = credentials.username;
    loginForm.usernameField.dispatchEvent(new Event('input', { bubbles: true }));
    loginForm.usernameField.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (loginForm.passwordField && credentials.password) {
    loginForm.passwordField.value = credentials.password;
    loginForm.passwordField.dispatchEvent(new Event('input', { bubbles: true }));
    loginForm.passwordField.dispatchEvent(new Event('change', { bubbles: true }));
  }

  console.log('[Autofill] Form filled with stored credentials');
}

/**
 * Create and show autofill badge/button
 */
function showAutofillBadge(loginForms, credentials) {
  // Remove existing badge if any
  removeAutofillBadge();

  // Create badge
  autofillBadge = document.createElement('div');
  autofillBadge.id = 'opaque-autofill-badge';
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

  // Add styles
  const style = document.createElement('style');
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

  // Add click handler for fill button
  const fillButton = document.getElementById('autofill-trigger');
  if (fillButton) {
    fillButton.addEventListener('click', () => {
      loginForms.forEach(form => fillLoginForm(form, credentials));
      
      // Hide badge after filling
      setTimeout(() => {
        if (autofillBadge) {
          autofillBadge.style.opacity = '0';
          setTimeout(removeAutofillBadge, 300);
        }
      }, 500);
    });
  }

  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (autofillBadge) {
      autofillBadge.style.opacity = '0';
      setTimeout(removeAutofillBadge, 300);
    }
  }, 10000);
}

/**
 * Remove autofill badge
 */
function removeAutofillBadge() {
  if (autofillBadge && autofillBadge.parentNode) {
    autofillBadge.parentNode.removeChild(autofillBadge);
    autofillBadge = null;
  }
}

/**
 * Show confirmation that credentials were saved
 */
function showSaveConfirmation(isUpdate = false) {
  const notification = document.createElement('div');
  notification.id = 'opaque-save-notification';
  notification.innerHTML = `
    <div class="notification-content">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>Password ${isUpdate ? 'updated' : 'saved'} for this site</span>
    </div>
  `;

  const style = document.createElement('style');
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
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(20px)';
    notification.style.transition = 'all 0.3s ease-out';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

/**
 * Show save password prompt
 */
function showSavePasswordPrompt(username, password, domain, isUpdate = false) { // TODO: fix issue with it showing up even when already exists
  // Remove any existing prompt
  const existingPrompt = document.getElementById('opaque-save-prompt');
  if (existingPrompt) {
    console.log('[Autofill] Prompt already exists, skipping duplicate');
    return;
  }
  
  // Small delay to avoid immediate removal in SPAs
  setTimeout(() => {
    createAndShowPrompt(username, password, domain, isUpdate);
  }, 100);
}

/**
 * Create and display the save password prompt with SPA protection
 */
function createAndShowPrompt(username, password, domain, isUpdate = false) {
  // Double-check no prompt exists
  if (document.getElementById('opaque-save-prompt')) {
    return;
  }

  const prompt = document.createElement('div');
  prompt.id = 'opaque-save-prompt';
  prompt.setAttribute('data-opaque-extension', 'true'); // Mark as extension element
  prompt.innerHTML = `
    <div class="prompt-content">
      <div class="prompt-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <h4>${isUpdate ? 'Update password?' : 'Save password?'}</h4>
      </div>
      <p>${isUpdate ? 'Would you like to update the saved password' : 'Would you like to save this password'} for <strong>${new URL(domain).hostname}</strong>?</p>
      <div class="prompt-info">
        <span class="username-display">👤 ${username}</span>
      </div>
      <div class="prompt-actions">
        <button class="btn-save">${isUpdate ? 'Update' : 'Save'}</button>
        <button class="btn-never">Never</button>
        <button class="btn-not-now">Not Now</button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
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
  
  // Ensure prompt is added directly to body (not nested in any container)
  if (document.body) {
    document.body.appendChild(prompt);
  } else {
    // Body not ready, wait for it
    const observer = new MutationObserver(() => {
      if (document.body) {
        document.body.appendChild(prompt);
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true });
  }
  
  // Setup MutationObserver to detect if prompt is removed by SPA navigation
  const promptObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === prompt && prompt.dataset.userDismissed !== 'true') {
          console.log('[Autofill] Prompt removed by page navigation, re-adding');
          // Re-add the prompt if it was removed by SPA navigation (not by user action)
          setTimeout(() => {
            if (document.body && !document.getElementById('opaque-save-prompt')) {
              document.body.appendChild(prompt);
            }
          }, 100);
        }
      });
    });
  });
  
  // Observe the body for removal of our prompt
  if (document.body) {
    promptObserver.observe(document.body, { childList: true });
  }

  // Add event listeners
  const saveBtn = prompt.querySelector('.btn-save');
  const neverBtn = prompt.querySelector('.btn-never');
  const notNowBtn = prompt.querySelector('.btn-not-now');

  saveBtn.addEventListener('click', async () => {
    try {
      prompt.dataset.userDismissed = 'true'; // Mark as user action
      promptObserver.disconnect(); // Stop observing
      await saveCredentials(domain, username, password);
      clearDraft(); // Clear draft after successful save
      console.log(`[Autofill] Credentials ${isUpdate ? 'updated' : 'saved'} by user choice`);
      prompt.remove();
      showSaveConfirmation(isUpdate);
      
      // Check if OPAQUE is supported and trigger registration
      const opaqueSupported = await checkOpaqueSupport();
      if (opaqueSupported) {
        console.log('[Autofill] OPAQUE supported - triggering auto-registration');
        // Send message to background/popup to handle OPAQUE registration
        chrome.runtime.sendMessage({
          action: 'registerWithOpaque',
          username: username,
          password: password
        }, (response) => {
          if (response && response.success) {
            console.log('[Autofill] OPAQUE registration completed successfully');
          } else {
            console.log('[Autofill] OPAQUE registration failed or not supported');
          }
        });
      }
    } catch (error) {
      console.error('[Autofill] Failed to save credentials:', error);
    }
  });

  neverBtn.addEventListener('click', () => {
    prompt.dataset.userDismissed = 'true'; // Mark as user action
    promptObserver.disconnect(); // Stop observing
    // Save a flag to never ask for this domain
    chrome.storage.local.set({ [`never_save_${domain}`]: true });
    clearDraft(); // Clear draft when user chooses never
    console.log('[Autofill] User chose "Never" for domain:', domain);
    prompt.remove();
  });

  notNowBtn.addEventListener('click', () => {
    prompt.dataset.userDismissed = 'true'; // Mark as user action
    promptObserver.disconnect(); // Stop observing
    console.log('[Autofill] User chose "Not Now" - keeping draft');
    // Don't clear draft - keep it so user can save later via extension popup
    prompt.remove();
  });

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    if (prompt.parentNode) {
      prompt.dataset.userDismissed = 'true'; // Mark as dismissed
      promptObserver.disconnect(); // Stop observing
      prompt.style.opacity = '0';
      prompt.style.transform = 'translateX(100%)';
      prompt.style.transition = 'all 0.3s ease-out';
      setTimeout(() => prompt.remove(), 300);
    }
  }, 30000);
}

/**
 * Handle credential capture logic using localStorage draft
 */
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
    console.log('[Autofill] Credentials match stored ones, not saving draft');
    return;
  }
  
  try {
    localStorage.setItem('opaque_credential_draft', JSON.stringify(draft));
    console.log('[Autofill] Credentials saved to draft');
  } catch (error) {
    console.error('[Autofill] Failed to save draft to localStorage:', error);
  }
}

/**
 * Get credential draft from localStorage
 */
function getDraft() {
  try {
    const draftStr = localStorage.getItem('opaque_credential_draft');
    if (!draftStr) return null;
    
    const draft = JSON.parse(draftStr);
    
    // Check if draft is stale (older than 5 minutes)
    if (Date.now() - draft.timestamp > 5 * 60 * 1000) {
      clearDraft();
      return null;
    }
    
    return draft;
  } catch (error) {
    console.error('[Autofill] Failed to read draft from localStorage:', error);
    return null;
  }
}

/**
 * Clear credential draft from localStorage
 */
function clearDraft() {
  try {
    localStorage.removeItem('opaque_credential_draft');
    console.log('[Autofill] Draft cleared');
  } catch (error) {
    console.error('[Autofill] Failed to clear draft:', error);
  }
}

/**
 * Check if user chose "Never" for this domain
 */
async function shouldNeverSave(domain) {
  return new Promise((resolve) => {
    chrome.storage.local.get([`never_save_${domain}`], (result) => {
      resolve(result[`never_save_${domain}`] === true);
    });
  });
}
/**
 * Check if OPAQUE is supported on current site
 */
async function checkOpaqueSupport() {
  try {
    const domain = getCurrentDomain();
    const response = await fetch(`${domain}/o/check`, {
      method: 'GET',
      credentials: 'include'
    });

    if (response) {
      const data = await response.json();
      if (data.opaque_supported) {
        console.log('[Autofill] OPAQUE endpoint accessible - OPAQUE is supported');
        return true;
      }
    }
  } catch (error) {
    console.log('[Autofill] OPAQUE not supported on this site:', error.message);
    return false;
  }
}

/**
 * Perform OPAQUE login directly from content script
 * This sends a message to background script which handles the login
 */
async function performOpaqueLogin(username, password) {
  return new Promise((resolve) => {
    console.log('[Autofill] Requesting OPAQUE login for:', username);
    
    chrome.runtime.sendMessage({
      action: 'performOpaqueLogin',
      username: username,
      password: password,
      origin: getCurrentDomain()
    }, (response) => {
      if (response && response.success) {
        console.log('[Autofill] OPAQUE login successful');
        resolve(true);
      } else {
        console.error('[Autofill] OPAQUE login failed:', response?.error);
        resolve(false);
      }
    });
  });
}

/**
 * Show badge indicating OPAQUE is available
 */
function showOpaqueAvailableBadge() {
  // Remove existing badge if any
  removeAutofillBadge();

  // Create badge
  autofillBadge = document.createElement('div');
  autofillBadge.id = 'opaque-autofill-badge';
  autofillBadge.innerHTML = `
    <div class="badge-content">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
      <span>OPAQUE Authentication Available</span>
      <button id="opaque-signin-direct">Sign In with OPAQUE</button>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #opaque-autofill-badge {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
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
      color: #11998e;
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

  // Add click handler to directly sign in with OPAQUE
  const signInBtn = document.getElementById('opaque-signin-direct');
  if (signInBtn) {
    signInBtn.addEventListener('click', async () => {
      console.log('[Autofill] Direct OPAQUE login initiated');
      signInBtn.disabled = true;
      signInBtn.textContent = 'Signing in...';
      
      try {
        const credentials = await getStoredCredentials(getCurrentDomain());
        if (credentials && credentials.username && credentials.password) {
          // Trigger OPAQUE login directly
          const success = await performOpaqueLogin(credentials.username, credentials.password);
          
          if (success) {
            signInBtn.textContent = '✓ Success!';
            setTimeout(() => {
              removeAutofillBadge();
              // Reload page to activate session
              window.location.reload();
            }, 1000);
          } else {
            signInBtn.textContent = '✗ Failed';
            setTimeout(() => {
              signInBtn.disabled = false;
              signInBtn.textContent = 'Retry';
            }, 2000);
          }
        }
      } catch (error) {
        console.error('[Autofill] OPAQUE login failed:', error);
        signInBtn.textContent = '✗ Error';
        setTimeout(() => {
          signInBtn.disabled = false;
          signInBtn.textContent = 'Retry';
        }, 2000);
      }
    });
  }

  // Auto-hide after 15 seconds
  setTimeout(() => {
    if (autofillBadge) {
      autofillBadge.style.opacity = '0';
      autofillBadge.style.transition = 'opacity 0.3s';
      setTimeout(() => removeAutofillBadge(), 300);
    }
  }, 15000);
}
/**
 * Monitor credential input fields and save to draft
 */
function monitorCredentialInputs() {
  console.log('[Autofill] Setting up credential input monitoring');
  
  // Cache to track field states
  const fieldCache = new Map();
  
  const handleInput = (event) => {
    const target = event.target;
    
    // Check if this is a credential field
    const isPasswordField = target.type === 'password';
    const isUsernameField = target.type === 'email' || 
                           target.type === 'text' || 
                           target.type === 'tel';
    
    if (!isPasswordField && !isUsernameField) return;
    
    // Find the form or container
    const form = target.closest('form') || document;
    
    // Find both username and password fields
    let usernameField = null;
    let passwordField = null;
    
    if (isPasswordField) {
      passwordField = target;
      usernameField = findUsernameField(form, passwordField);
    } else {
      usernameField = target;
      // Look for password field in the same form
      passwordField = form.querySelector('input[type="password"]');
    }
    
    // Only save if we have both fields with values
    if (usernameField && passwordField && 
        usernameField.value && passwordField.value) {
      
      const username = usernameField.value;
      const password = passwordField.value;
      
      // Check if values have changed (to avoid unnecessary writes)
      const cacheKey = `${usernameField}:${passwordField}`;
      const cachedValues = fieldCache.get(cacheKey);
      
      if (!cachedValues || 
          cachedValues.username !== username || 
          cachedValues.password !== password) {
        
        fieldCache.set(cacheKey, { username, password });
        saveToDraft(username, password);
      }
    }
  };
  
  // Listen to input events on the entire document
  document.addEventListener('input', handleInput, true);
  
  // Also set up observer for dynamically added fields
  const observer = new MutationObserver(() => {
    // Clear cache when DOM changes significantly
    fieldCache.clear();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Setup focus detection for credential fields
 */
function setupFocusDetection() {
  console.log('[Autofill] Setting up focus detection for credential fields');
  
  let focusDebounceTimer = null;
  
  document.addEventListener('focusin', (event) => {
    const target = event.target;
    
    // Check if focused element is a credential field
    const isCredentialField = 
      target.type === 'password' ||
      target.type === 'email' ||
      (target.type === 'text' && (
        target.name?.toLowerCase().includes('user') ||
        target.name?.toLowerCase().includes('email') ||
        target.name?.toLowerCase().includes('login') ||
        target.id?.toLowerCase().includes('user') ||
        target.id?.toLowerCase().includes('email') ||
        target.id?.toLowerCase().includes('login')
      ));
    
    if (isCredentialField) {
      console.log('[Autofill] Credential field focused, checking for autofill opportunity');
      
      // Debounce to avoid multiple rapid calls
      if (focusDebounceTimer) {
        clearTimeout(focusDebounceTimer);
      }
      
      focusDebounceTimer = setTimeout(() => {
        attemptAutofill();
      }, 200);
    }
  });
}
/**
 * Check for existing draft and show prompt if found
 */
async function checkForDraftAndPrompt() {
  const draft = getDraft();
  const credential = await getStoredCredentials(getCurrentDomain());
  if (draft && draft.username && draft.password && credential === null) {
    console.log('[Autofill] Found existing draft, showing save prompt');
    
    // Small delay to ensure page is ready
    setTimeout(() => {
      showSavePasswordPrompt(draft.username, draft.password, draft.domain, false);
    }, 1000);
  }
}

/**
 * Initialize autofill
 */
async function init() {
  console.log('[Autofill] Initializing autofill system');
  
  // Inject page-level script for OPAQUE UI
  injectPageScript();

  const credentials = await getStoredCredentials(getCurrentDomain());
  if (credentials) {
    console.log('[Autofill] Stored credentials found');
  }
  
  setupSPARouteDetection();
  
  monitorCredentialInputs();
  
  // Check for existing draft on page load and show prompt
  checkForDraftAndPrompt();
  
  // Check if OPAQUE is supported before auto-filling
  const opaqueSupported = await checkOpaqueSupport();
  
  if (opaqueSupported && credentials) {
    console.log('[Autofill] OPAQUE supported - page script will handle UI');
    // Page script will show the "Sign in via OPAQUE" button
    // Don't auto-fill in this case
  } else {
    // OPAQUE not supported or no credentials - proceed with normal autofill
    console.log('[Autofill] Using standard autofill behavior');
    
    // Attempt auto-fill on page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attemptAutofill);
    } else {
      attemptAutofill();
    }

    // Also try again after a short delay for dynamic content
    setTimeout(attemptAutofill, 2000);
  }
}

/**
 * Listen for messages from popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("listener triggered", request);
  
  if (request.action === 'saveCredentials') {
    const domain = getCurrentDomain();
    saveCredentials(domain, request.username, request.password)
      .then(() => {
        clearDraft(); // Clear the draft after saving
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.action === 'fillCredentials') {
    attemptAutofill();
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'getDraft') {
    const draft = getDraft();
    console.log("draft is as follow :", draft);
    
    sendResponse({ draft });
    return true;
  }
  
  if (request.action === 'clearDraft') {
    clearDraft();
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'getStoredCredentials') {
    const domain = getCurrentDomain();
    getStoredCredentials(domain)
      .then(credentials => {
        console.log('[Autofill] Credentials retrieved for popup');
        sendResponse({ success: true, credentials });
      })
      .catch(error => {
        console.error('[Autofill] Failed to get credentials:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }
  
  if (request.action === 'clearCredentials') {
    const domain = getCurrentDomain();
    chrome.storage.local.remove([`credentials_${domain}`], () => {
      if (chrome.runtime.lastError) {
        console.error('[Autofill] Failed to clear credentials:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[Autofill] Credentials cleared for domain:', domain);
        sendResponse({ success: true });
      }
    });
    return true; // Async response
  }
  
  // Handle OPAQUE login execution request from background
  if (request.action === 'executeOpaqueLogin') {
    console.log('[Autofill] Received OPAQUE login request');
    
    const username = request.username;
    const password = request.password;
    
    // Store login request for popup to handle
    chrome.storage.local.set({
      'pending_opaque_login': {
        username: username,
        password: password,
        timestamp: Date.now()
      }
    }, () => {
      console.log('[Autofill] Stored pending login, opening popup...');
      
      // Open the extension popup which will handle the login
      chrome.runtime.sendMessage({ action: 'openPopupForLogin' }, (response) => {
        // Popup will be opened, it will check for pending login
        sendResponse({ success: true, queued: true, message: 'Login queued for popup' });
      });
    });
    
    return true; // Async response
  }
});

init();/**
 * Auto-fill if credentials are available
 */
async function attemptAutofill() {
  const domain = getCurrentDomain();
  const credentials = await getStoredCredentials(domain);

  if (!credentials) {
    console.log('[Autofill] No stored credentials for domain:', domain);
    // Remove badge if no credentials
    removeAutofillBadge();
    return;
  }

  console.log('[Autofill] Found stored credentials for domain:', domain);

  // Wait a bit for page to fully load and render forms
  setTimeout(async () => {
    const loginForms = findLoginFields();

    if (!loginForms || loginForms.length === 0) {
      console.log('[Autofill] No login forms found on page');
      // Remove badge if no forms
      removeAutofillBadge();
      return;
    }

    console.log('[Autofill] Found', loginForms.length, 'login form(s)');

    // Auto-fill the first form
    fillLoginForm(loginForms[0], credentials);

    // Show badge for manual trigger option (always refresh it)
    showAutofillBadge(loginForms, credentials);
  }, 1000);
}

/**
 * Setup SPA route change detection for autofill
 */
function setupSPARouteDetection() {
  console.log('[Autofill] Setting up SPA route change detection');
  
  // Throttle autofill attempts to avoid excessive calls
  let autofillThrottleTimer = null;
  const throttledAutofill = () => {
    if (autofillThrottleTimer) {
      clearTimeout(autofillThrottleTimer);
    }
    autofillThrottleTimer = setTimeout(() => {
      console.log('[Autofill] Route change detected, attempting autofill');
      attemptAutofill();
    }, 500);
  };
  
  // Hook into history.pushState
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    console.log('[Autofill] pushState intercepted');
    throttledAutofill();
  };
  
  // Hook into history.replaceState
  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    console.log('[Autofill] replaceState intercepted');
    throttledAutofill();
  };
  
  // Listen for popstate (browser back/forward)
  window.addEventListener('popstate', () => {
    console.log('[Autofill] popstate event detected');
    throttledAutofill();
  });
  
  // Listen for hashchange (hash-based routing)
  window.addEventListener('hashchange', () => {
    console.log('[Autofill] hashchange event detected');
    throttledAutofill();
  });
}