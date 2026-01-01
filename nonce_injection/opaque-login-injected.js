(() => {
  // src/nonce_injection/opaque-login-injected.js
  window.addEventListener("message", async (event) => {
    if (event.source !== window)
      return;
    if (event.data.type === "EXECUTE_OPAQUE_LOGIN") {
      const { username, password, csrfToken, origin } = event.data;
      try {
        console.log("[OPAQUE Injected] Starting login for:", username);
        const opaqueModule = await import(chrome.runtime.getURL("opaque.js"));
        const opaque = opaqueModule.default || opaqueModule;
        if (!opaque || !opaque.client || !opaque.client.startLogin || !opaque.client.finishLogin) {
          throw new Error("OPAQUE module or client methods are not available");
        }
        if (!password) {
          throw new Error("Please provide a password for OPAQUE login");
        }
        const { clientLoginState, startLoginRequest } = opaque.client.startLogin({
          password
        });
        console.log("[OPAQUE Injected] Step 1 - Sending login request");
        const step1Response = await fetch(`${origin}/o/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...csrfToken && { "X-CSRFToken": csrfToken }
          },
          credentials: "include",
          body: JSON.stringify({
            email: username,
            client_request: startLoginRequest
          })
        });
        if (!step1Response.ok) {
          throw new Error(`Login step 1 failed: ${step1Response.status}`);
        }
        const step1Data = await step1Response.json();
        console.log("[OPAQUE Injected] Step 1 complete, finishing login...");
        const loginResult = opaque.client.finishLogin({
          clientLoginState,
          loginResponse: step1Data.client_response,
          password
        });
        if (!loginResult) {
          throw new Error("Login finish returned undefined - authentication failed");
        }
        const { finishLoginRequest } = loginResult;
        const step2Response = await fetch(`${origin}/o/login/finish`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...csrfToken && { "X-CSRFToken": csrfToken }
          },
          credentials: "include",
          body: JSON.stringify({
            cache_key: step1Data.cache_key,
            client_finish_request: finishLoginRequest
          })
        });
        if (!step2Response.ok) {
          throw new Error(`Login step 2 failed: ${step2Response.status}`);
        }
        const step2Data = await step2Response.json();
        console.log("[OPAQUE Injected] Login successful:", step2Data);
        window.postMessage({
          type: "OPAQUE_LOGIN_SUCCESS",
          data: step2Data
        }, "*");
      } catch (error) {
        console.error("[OPAQUE Injected] Login failed:", error);
        window.postMessage({
          type: "OPAQUE_LOGIN_FAILED",
          error: error.message
        }, "*");
      }
    }
  });
  console.log("[OPAQUE Injected] Login handler registered");
})();
