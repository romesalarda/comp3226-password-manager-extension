(() => {
  // src/nonce_injection/content.js
  console.log("[NonceInjection][Content] Content script loaded");
  var nonceRegistry = /* @__PURE__ */ new Map();
  function injectPageScript() {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("nonce_injection/injected.js");
      script.type = "text/javascript";
      script.onload = () => {
        console.log("[NonceInjection][Content] injected.js added to page");
        script.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error(
        "[NonceInjection][Content] Failed to inject page script:",
        error
      );
    }
  }
  function showSuccessBanner(formCount) {
    try {
      if (document.getElementById("nonce-injection-banner"))
        return;
      const banner = document.createElement("div");
      banner.id = "nonce-injection-banner";
      banner.textContent = `Nonce injection successful (${formCount} form${formCount === 1 ? "" : "s"} processed)`;
      Object.assign(banner.style, {
        position: "fixed",
        bottom: "12px",
        right: "12px",
        zIndex: 999999,
        padding: "8px 12px",
        borderRadius: "4px",
        backgroundColor: "#1b5e20",
        color: "#ffffff",
        fontSize: "12px",
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
        opacity: "0",
        transition: "opacity 0.3s ease-in-out"
      });
      document.body.appendChild(banner);
      requestAnimationFrame(() => banner.style.opacity = "1");
      setTimeout(() => {
        banner.style.opacity = "0";
        setTimeout(() => banner.remove(), 400);
      }, 4e3);
    } catch (error) {
      console.error("[NonceInjection][Content] Failed to show banner:", error);
    }
  }
  function setupPageMessageListener() {
    window.addEventListener("message", (event) => {
      if (event.source !== window)
        return;
      const data = event.data;
      if (!data || data.source !== "NonceInjection")
        return;
      switch (data.type) {
        case "NONCE_ISSUED": {
          const { nonce, formSelector } = data;
          if (!nonce)
            return;
          console.log(
            "[NonceInjection][Content] Registered nonce:",
            nonce,
            "for target:",
            formSelector || "<unknown>"
          );
          nonceRegistry.set(nonce, { issuedAt: Date.now(), used: false });
          break;
        }
        case "FORM_SUBMITTED": {
          const { nonce } = data;
          if (!nonce)
            return;
          const entry = nonceRegistry.get(nonce);
          if (!entry) {
            console.warn(
              "[NonceInjection][Content] Form submitted with UNKNOWN nonce:",
              nonce
            );
          } else if (entry.used) {
            console.warn(
              "[NonceInjection][Content] Form submitted with REPLAYED nonce:",
              nonce
            );
          } else {
            console.log(
              "[NonceInjection][Content] Form submitted with fresh nonce:",
              nonce
            );
            entry.used = true;
          }
          break;
        }
        case "INJECTION_COMPLETE": {
          console.log(
            "[NonceInjection][Content] Injection complete. Targets processed:",
            data.formCount
          );
          if (data.formCount > 0)
            showSuccessBanner(data.formCount);
          break;
        }
        case "INJECTION_ERROR": {
          console.error("[NonceInjection][Content] Injection error:", data.error);
          break;
        }
      }
    });
    console.log("[NonceInjection][Content] Page message listener initialised");
  }
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.action)
      return;
    if (request.action === "checkNonceStatus") {
      let hasFresh = false;
      for (const entry of nonceRegistry.values()) {
        if (!entry.used) {
          hasFresh = true;
          break;
        }
      }
      const summary = {
        totalNonces: nonceRegistry.size,
        freshNonces: [...nonceRegistry.entries()].filter(([_, e]) => !e.used).map(([nonce]) => nonce),
        usedNonces: [...nonceRegistry.entries()].filter(([_, e]) => e.used).map(([nonce]) => nonce)
      };
      console.log(
        "[NonceInjection][Content] checkNonceStatus:",
        hasFresh ? "OK (fresh nonce available)" : "NO FRESH NONCE",
        summary
      );
      sendResponse({ hasValidFreshNonce: hasFresh, registry: summary });
      return true;
    }
  });
  function init() {
    console.log("[NonceInjection][Content] Initialising");
    setupPageMessageListener();
    injectPageScript();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
    console.log("[NonceInjection][Content] DOMContentLoaded listener attached");
  } else {
    console.log("[NonceInjection][Content] Document already ready, initialising");
    init();
  }
})();
