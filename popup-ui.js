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
        const opaqueSupported = await checkOpaqueSupport();
        if (opaqueSupported) {
          console.log("OPAQUE supported - auto-registering credentials...");
          await autoRegisterWithOpaque(username, password);
        } else {
          console.log("OPAQUE not supported - credentials saved for autofill only");
        }
      }
    } catch (error) {
      console.log("Could not send to autofill (tab may not be ready):", error.message);
    }
  }
  async function autoRegisterWithOpaque(username, password) {
    try {
      console.log("[OPAQUE Auto-Register] Starting registration for:", username);
      const api = await waitForOpaqueAPI();
      try {
        const existingPassword = await api.getPasswordFromStorage(username);
        if (existingPassword) {
          console.log("[OPAQUE Auto-Register] Credentials already registered, skipping");
          return;
        }
      } catch (e) {
      }
      const step1Result = await api.startRegistration(username, password);
      console.log("[OPAQUE Auto-Register] Step 1 complete");
      const registrationResponse = typeof step1Result === "string" ? step1Result : step1Result.registration_response;
      if (!registrationResponse) {
        throw new Error("Server did not return registration_response");
      }
      const step2Result = await api.finishRegistration(registrationResponse);
      console.log("[OPAQUE Auto-Register] Registration complete:", step2Result);
      api.savePasswordToStorage(username, password);
      console.log("[OPAQUE Auto-Register] Password saved to storage");
      updateStatus(`\u2713 Credentials registered with OPAQUE for ${username}`, "success");
    } catch (error) {
      console.error("[OPAQUE Auto-Register] Failed:", error);
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
  async function checkOpaqueSupport() {
    try {
      const api = await waitForOpaqueAPI();
      const websiteOrigin = await api.getWebsiteOrigin();
      const response = await fetch(`${websiteOrigin}/o/session/verify`, {
        method: "GET",
        credentials: "include"
      });
      if (response) {
        const data = await response.json();
        if (data.opaque_supported) {
          console.log("OPAQUE endpoint accessible - OPAQUE is supported");
          return true;
        }
      }
      return true;
    } catch (error) {
      console.log("OPAQUE not supported on this site:", error.message);
      return false;
    }
  }
  async function getStoredCredentialsForCurrentSite() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "getStoredCredentials"
        });
        return response?.credentials || null;
      }
    } catch (error) {
      console.log("Could not get stored credentials:", error.message);
      return null;
    }
  }
  async function clearCredentialsForCurrentSite() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "clearCredentials"
        });
        return response?.success || false;
      }
    } catch (error) {
      console.log("Could not clear credentials:", error.message);
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
          updateStatus(`\u2713 Login successful! Opening site...`, "success");
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
          updateStatus("\u2717 Login failed: Username or password incorrect", "error");
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
    const opaqueSupported = await checkOpaqueSupport();
    const opaqueForm = document.getElementById("opaqueForm");
    const autofillOnly = document.getElementById("autofillOnly");
    if (opaqueSupported) {
      console.log("OPAQUE supported - showing registration/login form");
      if (opaqueForm)
        opaqueForm.classList.add("show");
      if (autofillOnly)
        autofillOnly.classList.remove("show");
    } else {
      console.log("OPAQUE not supported - hiding form, showing autofill-only message");
      if (opaqueForm)
        opaqueForm.classList.remove("show");
      if (autofillOnly)
        autofillOnly.classList.add("show");
    }
    try {
      chrome.storage.local.get(["pending_opaque_registration"], async (result) => {
        const pending = result.pending_opaque_registration;
        if (pending && pending.username && pending.password) {
          const age = Date.now() - pending.timestamp;
          if (age < 5 * 60 * 1e3) {
            console.log("[Popup] Processing pending OPAQUE registration:", pending.username);
            try {
              await autoRegisterWithOpaque(pending.username, pending.password);
              console.log("[Popup] Pending registration processed successfully");
            } catch (error) {
              console.error("[Popup] Failed to process pending registration:", error);
            }
          }
          chrome.storage.local.remove(["pending_opaque_registration"]);
        }
      });
    } catch (error) {
      console.log("[Popup] Error checking pending registrations:", error.message);
    }
    try {
      chrome.storage.local.get(["pending_opaque_login"], async (result) => {
        const pending = result.pending_opaque_login;
        if (pending && pending.username && pending.password) {
          const age = Date.now() - pending.timestamp;
          if (age < 5 * 60 * 1e3) {
            console.log("[Popup] Processing pending OPAQUE login:", pending.username);
            updateStatus("Processing automatic OPAQUE login...", "info");
            try {
              const api = await waitForOpaqueAPI();
              const step1Result = await api.startLogin(pending.username, pending.password);
              console.log("[Popup] Login Step 1 complete");
              const step2Result = await api.finishLogin(
                step1Result.client_response,
                step1Result.cache_key
              );
              console.log("[Popup] Login Step 2 complete");
              const sessionCheck = await api.verifySession();
              const websiteOrigin = await api.getWebsiteOrigin();
              if (sessionCheck.authenticated) {
                updateStatus("\u2713 Automatic login successful!", "success");
                console.log("[Popup] Automatic login successful");
                chrome.runtime.sendMessage({
                  type: "opaque-login-complete",
                  data: {
                    success: true,
                    username: pending.username,
                    redirectUrl: `${websiteOrigin}/o/session/redirect`,
                    message: "Login successful"
                  }
                }, () => {
                  if (chrome.runtime.lastError) {
                    console.error("[Popup] Failed to send result:", chrome.runtime.lastError);
                  }
                });
                setTimeout(() => {
                  window.close();
                }, 1500);
              } else {
                updateStatus("\u26A0 Login completed but verification failed", "warning");
                chrome.runtime.sendMessage({
                  type: "opaque-login-complete",
                  data: {
                    success: false,
                    error: "Session verification failed",
                    message: "Login completed but session verification failed"
                  }
                });
              }
            } catch (error) {
              console.error("[Popup] Failed to process pending login:", error);
              updateStatus(`\u2717 Automatic login failed: ${error.message}`, "error");
              chrome.runtime.sendMessage({
                type: "opaque-login-complete",
                data: {
                  success: false,
                  error: error.message,
                  message: `Login failed: ${error.message}`
                }
              });
            }
          }
          chrome.storage.local.remove(["pending_opaque_login"]);
        }
      });
    } catch (error) {
      console.log("[Popup] Error checking pending logins:", error.message);
    }
    let hasDraft = false;
    try {
      const draft = await getCredentialDraft();
      if (draft && draft.username && draft.password) {
        console.log("Credential draft found:", { domain: draft.domain, username: draft.username });
        hasDraft = true;
        const draftNotification = document.getElementById("draftNotification");
        const draftUsernameDisplay = document.getElementById("draftUsername");
        const credentials = await getStoredCredentialsForCurrentSite();
        if (draftNotification && draftUsernameDisplay && credentials === null) {
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
    let isAuthenticated = false;
    try {
      const api = await waitForOpaqueAPI();
      const sessionCheck = await api.verifySession();
      if (sessionCheck.authenticated) {
        console.log("Active session found:", sessionCheck);
        isAuthenticated = true;
        if (!hasDraft) {
          updateStatus(`\u2713 Logged in as ${sessionCheck.email}`, "success");
        }
      } else {
        console.log("No active session");
      }
    } catch (error) {
      console.log("Session check skipped:", error.message);
    }
    if (!isAuthenticated) {
      try {
        const credentials = await getStoredCredentialsForCurrentSite();
        if (credentials && credentials.username && credentials.password) {
          console.log("Stored credentials found, checking OPAQUE support...");
          const opaqueSupported2 = await checkOpaqueSupport();
          if (opaqueSupported2) {
            console.log("OPAQUE is supported, showing auto-login prompt");
            const opaquePrompt = document.getElementById("opaquePrompt");
            const opaqueUsernameDisplay = document.getElementById("opaqueUsername");
            if (opaquePrompt && opaqueUsernameDisplay) {
              opaqueUsernameDisplay.textContent = `\u{1F464} ${credentials.username}`;
              opaquePrompt.classList.add("show");
              const signInOpaqueBtn = document.getElementById("signInOpaqueBtn");
              if (signInOpaqueBtn) {
                signInOpaqueBtn.addEventListener("click", async () => {
                  console.log("Auto-login with OPAQUE initiated...");
                  opaquePrompt.classList.remove("show");
                  try {
                    updateStatus("Logging in with OPAQUE...", "info");
                    const api = await waitForOpaqueAPI();
                    const step1Result = await api.startLogin(credentials.username, credentials.password);
                    console.log("Step 1 response:", step1Result);
                    updateStatus("Completing login...", "info");
                    const step2Result = await api.finishLogin(
                      step1Result.client_response,
                      step1Result.cache_key
                    );
                    console.log("Step 2 response:", step2Result);
                    const sessionCheck = await api.verifySession();
                    const websiteOrigin = await api.getWebsiteOrigin();
                    if (sessionCheck.authenticated) {
                      updateStatus(`\u2713 Login successful! Opening site...`, "success");
                      setTimeout(() => {
                        chrome.tabs.create({ url: `${websiteOrigin}/o/session/redirect` });
                      }, 1e3);
                    } else {
                      updateStatus(`\u26A0 Login completed but verification failed`, "warning");
                    }
                  } catch (error) {
                    console.error("Auto-login error:", error);
                    updateStatus(`\u2717 Login failed: ${error.message}`, "error");
                  }
                });
              }
              const dismissOpaqueBtn = document.getElementById("dismissOpaqueBtn");
              if (dismissOpaqueBtn) {
                dismissOpaqueBtn.addEventListener("click", () => {
                  console.log("OPAQUE auto-login dismissed");
                  opaquePrompt.classList.remove("show");
                  updateStatus("Autofill available instead", "info");
                  setTimeout(() => {
                    const statusDiv = document.getElementById("status");
                    if (statusDiv)
                      statusDiv.classList.remove("show");
                  }, 2e3);
                });
              }
            }
          } else {
            console.log("OPAQUE not supported, autofill available");
            updateStatus("\u{1F4A1} Autofill available for this site", "info");
            setTimeout(() => {
              const statusDiv = document.getElementById("status");
              if (statusDiv)
                statusDiv.classList.remove("show");
            }, 3e3);
          }
        }
      } catch (error) {
        console.log("Auto-login check failed:", error.message);
      }
    } else {
      console.log("User is authenticated or draft exists; skipping auto-login check");
    }
    const clearCredentialsBtn = document.getElementById("clearCredentialsBtn");
    if (clearCredentialsBtn) {
      clearCredentialsBtn.addEventListener("click", async () => {
        console.log("Clear credentials button clicked");
        if (confirm("Clear all saved credentials for this site? This cannot be undone.")) {
          updateStatus("Clearing credentials...", "info");
          try {
            const success = await clearCredentialsForCurrentSite();
            if (success) {
              updateStatus("\u2713 Credentials cleared successfully", "success");
            } else {
              updateStatus("\u26A0 No credentials found to clear", "warning");
            }
          } catch (error) {
            console.error("Failed to clear credentials:", error);
            updateStatus(`\u2717 Failed to clear: ${error.message}`, "error");
          }
        }
      });
    }
  });
  console.log("popup-ui.js initialization complete");
})();
