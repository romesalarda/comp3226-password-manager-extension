(() => {
  // src/popup-ui.js
  console.log("popup-ui.js loaded and executing");
  async function saveCredentialsForAutofill(username, password) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "saveCredentials",
          username,
          password
        });
        console.log("Credentials sent to autofill system:", response);
      }
    } catch (error) {
      console.log("Could not send to autofill (tab may not be ready):", error.message);
    }
  }
  async function getCredentialDraft() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "getDraft"
        });
        console.log("Draft retrieved from content script:", response);
        return response?.draft || null;
      }
    } catch (error) {
      console.log("Could not get draft from content script:", error.message);
      return null;
    }
  }
  async function clearCredentialDraft() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "clearDraft"
        });
        console.log("Draft cleared in content script:", response);
        return response?.success || false;
      }
    } catch (error) {
      console.log("Could not clear draft in content script:", error.message);
      return false;
    }
  }
  function waitForOpaqueAPI(timeoutMs = 5e3) {
    if (window.opaqueAPI)
      return Promise.resolve(window.opaqueAPI);
    return new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve(window.opaqueAPI);
      };
      const onTimeout = () => {
        cleanup();
        reject(new Error("opaqueAPI not available within timeout"));
      };
      function cleanup() {
        window.removeEventListener("opaqueAPIReady", onReady);
        clearTimeout(timer);
      }
      window.addEventListener("opaqueAPIReady", onReady);
      const timer = setTimeout(onTimeout, timeoutMs);
    });
  }
  function updateStatus(message, type = "info") {
    const statusDiv = document.getElementById("status");
    if (statusDiv) {
      statusDiv.textContent = message;
      statusDiv.className = `show ${type}`;
    }
  }
  function getFormValues() {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    return { email, password };
  }
  async function validateForm(email, password) {
    const api = await waitForOpaqueAPI();
    if (!email) {
      updateStatus("Please enter an email address", "error");
      return false;
    }
    if (!password) {
      updateStatus("Please enter a password", "error");
      return false;
    }
    if (!email.includes("@")) {
      updateStatus("Please enter a valid email address", "error");
      return false;
    }
    try {
      await api.getPasswordFromStorage(email);
    } catch (error) {
      if (password.length < 6) {
        updateStatus("Password must be at least 6 characters", "error");
        return false;
      }
    }
    return true;
  }
  var registerBtn = document.getElementById("registerBtn");
  if (registerBtn) {
    console.log("Adding click event listener to registerBtn");
    registerBtn.addEventListener("click", async () => {
      console.log("Register button clicked!");
      const { email, password } = getFormValues();
      if (!validateForm(email, password)) {
        return;
      }
      try {
        updateStatus("Initializing OPAQUE registration...", "info");
        console.log("Waiting for opaqueAPI...");
        const api = await waitForOpaqueAPI();
        console.log("opaqueAPI received:", api);
        updateStatus("Step 1: Sending registration request...", "info");
        console.log("Step 1: Starting registration for:", email);
        const step1Result = await api.startRegistration(email, password);
        console.log("Step 1 response:", step1Result);
        updateStatus("Step 2: Completing registration...", "info");
        const registrationResponse = typeof step1Result === "string" ? step1Result : step1Result.registration_response;
        if (!registrationResponse) {
          throw new Error("Server did not return registration_response");
        }
        console.log("Step 2: Finishing registration with response:", registrationResponse);
        const step2Result = await api.finishRegistration(registrationResponse);
        console.log("Step 2 response:", step2Result);
        updateStatus(`\u2713 Registration successful for ${email}!`, "success");
        console.log("Full registration complete:", step2Result);
        api.savePasswordToStorage(email, password);
        console.log("Username and password saved in local storage");
        await saveCredentialsForAutofill(email, password);
      } catch (error) {
        console.error("Registration error:", error);
        if (error.message.includes("404") || error.message.includes("not found")) {
          updateStatus("\u26A0 OPAQUE not supported. Using standard autofill fallback.", "warning");
          await saveCredentialsForAutofill(email, password);
          console.log("[Fallback] Credentials saved for autofill (OPAQUE not available)");
        } else {
          updateStatus(`\u2717 Registration failed: ${error.message}`, "error");
        }
      }
    });
  } else {
    console.warn("popup-ui: #registerBtn not found in DOM");
  }
  var loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    console.log("Adding click event listener to loginBtn");
    loginBtn.addEventListener("click", async () => {
      console.log("Login button clicked!");
      let { email, password } = getFormValues();
      if (!validateForm(email, password)) {
        return;
      }
      try {
        updateStatus("Initializing OPAQUE login...", "info");
        const api = await waitForOpaqueAPI();
        if (!password) {
          password = await api.getPasswordFromStorage(email);
          console.log("Password retrieved from local storage");
        }
        console.log("Waiting for opaqueAPI...");
        console.log("opaqueAPI received:", api);
        updateStatus("Step 1: Sending login request...", "info");
        console.log("Step 1: Starting login for:", email);
        const step1Result = await api.startLogin(email, password);
        console.log("Step 1 response:", step1Result);
        console.log("Cache key received:", step1Result.cache_key);
        updateStatus("Step 2: Completing login...", "info");
        if (!step1Result.client_response) {
          throw new Error("Server did not return client_response");
        }
        if (!step1Result.cache_key) {
          throw new Error("Server did not return cache_key");
        }
        console.log("Step 2: Finishing login with cache key:", step1Result.cache_key);
        const step2Result = await api.finishLogin(
          step1Result.client_response,
          step1Result.cache_key
        );
        console.log("Step 2 response:", step2Result);
        updateStatus(`\u2713 Login successful! Welcome ${email}`, "success");
        console.log("Full login complete:", step2Result);
        console.log("Session key established");
        console.log("Verifying session...");
        const sessionCheck = await api.verifySession();
        const websiteOrigin = await api.getWebsiteOrigin();
        if (sessionCheck.authenticated) {
          console.log("Session verified successfully:", sessionCheck);
          updateStatus(`\u2713 Login successful! Opening Django site...`, "success");
          await saveCredentialsForAutofill(email, password);
          setTimeout(() => {
            chrome.tabs.create({ url: `${websiteOrigin}/o/session/redirect` });
          }, 1e3);
        } else {
          console.warn("Session verification failed:", sessionCheck);
          updateStatus(`\u26A0 Login completed but session verification failed`, "warning");
        }
      } catch (error) {
        console.error("Login error:", error);
        if (error.message.includes("404") || error.message.includes("not found")) {
          updateStatus("\u26A0 OPAQUE not supported. Using standard autofill fallback.", "warning");
          await saveCredentialsForAutofill(email, password);
          console.log("[Fallback] Credentials saved for autofill (OPAQUE not available)");
        } else {
          updateStatus(`\u2717 Login failed: ${error.message}`, "error");
        }
      }
    });
  } else {
    console.warn("popup-ui: #loginBtn not found in DOM");
  }
  window.addEventListener("DOMContentLoaded", async () => {
    console.log("Popup loaded, checking session status and credential draft...");
    try {
      const draft = await getCredentialDraft();
      if (draft && draft.username && draft.password) {
        console.log("Credential draft found:", { domain: draft.domain, username: draft.username });
        const draftNotification = document.getElementById("draftNotification");
        const draftUsernameDisplay = document.getElementById("draftUsername");
        if (draftNotification && draftUsernameDisplay) {
          draftUsernameDisplay.textContent = `\u{1F464} ${draft.username}`;
          draftNotification.classList.add("show");
          const saveDraftBtn = document.getElementById("saveDraftBtn");
          if (saveDraftBtn) {
            saveDraftBtn.addEventListener("click", async () => {
              console.log("Saving draft credentials...");
              updateStatus("Saving credentials...", "info");
              try {
                await saveCredentialsForAutofill(draft.username, draft.password);
                await clearCredentialDraft();
                draftNotification.classList.remove("show");
                updateStatus("\u2713 Credentials saved successfully!", "success");
              } catch (error) {
                console.error("Failed to save draft:", error);
                updateStatus(`\u2717 Failed to save: ${error.message}`, "error");
              }
            });
          }
          const discardDraftBtn = document.getElementById("discardDraftBtn");
          if (discardDraftBtn) {
            discardDraftBtn.addEventListener("click", async () => {
              console.log("Discarding draft credentials...");
              try {
                await clearCredentialDraft();
                draftNotification.classList.remove("show");
                updateStatus("Draft discarded", "info");
                setTimeout(() => {
                  const statusDiv = document.getElementById("status");
                  if (statusDiv)
                    statusDiv.classList.remove("show");
                }, 2e3);
              } catch (error) {
                console.error("Failed to discard draft:", error);
              }
            });
          }
        }
      }
    } catch (error) {
      console.log("Draft check failed:", error.message);
    }
    try {
      const api = await waitForOpaqueAPI();
      const sessionCheck = await api.verifySession();
      if (sessionCheck.authenticated) {
        console.log("Active session found:", sessionCheck);
        const draftNotification = document.getElementById("draftNotification");
        if (!draftNotification || !draftNotification.classList.contains("show")) {
          updateStatus(`\u2713 Logged in as ${sessionCheck.email}`, "success");
        }
      } else {
        console.log("No active session");
      }
    } catch (error) {
      console.log("Session check skipped:", error.message);
    }
  });
  console.log("popup-ui.js initialization complete");
})();
