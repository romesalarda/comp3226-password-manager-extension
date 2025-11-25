(() => {
  // src/nonce_injection/injected.js
  (function() {
    const LOG_PREFIX = "[NonceInjection][Injected]";
    console.log(`${LOG_PREFIX} Script loaded`);
    function postToExtension(payload) {
      try {
        window.postMessage({ source: "NonceInjection", ...payload }, "*");
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to post message:`, error);
      }
    }
    function generateNonce() {
      try {
        const bytes = new Uint8Array(16);
        if (window.crypto?.getRandomValues) {
          window.crypto.getRandomValues(bytes);
        } else {
          for (let i = 0; i < bytes.length; i++)
            bytes[i] = Math.random() * 256 | 0;
        }
        return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch (error) {
        console.error(`${LOG_PREFIX} Error generating nonce:`, error);
        return null;
      }
    }
    function findLoginTargets() {
      const passwordInputs = [
        ...document.querySelectorAll('input[type="password"]')
      ];
      const targets = /* @__PURE__ */ new Map();
      passwordInputs.forEach((input) => {
        let form = input.form || input.closest("form");
        let element, type;
        if (form) {
          element = form;
          type = "form";
        } else {
          const container = input.closest(
            'form, [role="form"], .login, .signin, .auth, .authentication, .login-form'
          ) || document.body;
          element = container;
          type = container.tagName === "FORM" ? "form" : "container";
        }
        if (!targets.has(element)) {
          targets.set(element, { element, type, inputs: [] });
        }
        targets.get(element).inputs.push(input);
      });
      return [...targets.values()];
    }
    function findSubmitControl(container) {
      if (!container || !(container instanceof HTMLElement))
        return null;
      const candidates = container.querySelectorAll(
        'button[type="submit"], input[type="submit"], button[id*="login" i], button[id*="signin" i], button[class*="login" i], button[class*="signin" i]'
      );
      return candidates[0] || null;
    }
    function injectNonceIntoTargets() {
      const targets = findLoginTargets();
      let processed = 0;
      targets.forEach((target, index) => {
        const { element, type, inputs } = target;
        if (!element || inputs.length === 0)
          return;
        if (element.dataset.nonce)
          return;
        const nonce = generateNonce();
        if (!nonce)
          return;
        element.dataset.nonce = nonce;
        let hidden = element.querySelector('input[type="hidden"][name="nonce"]');
        if (!hidden) {
          hidden = document.createElement("input");
          hidden.type = "hidden";
          hidden.name = "nonce";
          const lastPassword = inputs[inputs.length - 1];
          if (lastPassword?.parentElement) {
            lastPassword.parentElement.appendChild(hidden);
          } else {
            element.appendChild(hidden);
          }
        }
        hidden.value = nonce;
        if (type === "form") {
          if (!element.__nonceInjectionHooked) {
            element.addEventListener("submit", () => {
              console.log(
                `${LOG_PREFIX} Form submitted with nonce:`,
                element.dataset.nonce,
                element
              );
              postToExtension({
                type: "FORM_SUBMITTED",
                nonce: element.dataset.nonce || null
              });
            });
            element.__nonceInjectionHooked = true;
          }
        } else {
          const submit = findSubmitControl(element);
          if (submit && !submit.__nonceInjectionHooked) {
            submit.addEventListener("click", () => {
              console.log(
                `${LOG_PREFIX} Container submit clicked with nonce:`,
                element.dataset.nonce,
                element
              );
              postToExtension({
                type: "FORM_SUBMITTED",
                nonce: element.dataset.nonce || null
              });
            });
            submit.__nonceInjectionHooked = true;
          }
        }
        const selector = element.id && type === "form" ? `form#${element.id}` : element.id ? `#${element.id}` : element.className ? `${element.tagName.toLowerCase()}.${String(
          element.className
        ).replace(/\s+/g, ".")}` : `${element.tagName.toLowerCase()}[index=${index}]`;
        console.log(`${LOG_PREFIX} Nonce injected into target:`, selector, nonce);
        postToExtension({ type: "NONCE_ISSUED", nonce, formSelector: selector });
        processed++;
      });
      console.log(
        `${LOG_PREFIX} Injection run complete. Targets processed this run:`,
        processed
      );
      postToExtension({ type: "INJECTION_COMPLETE", formCount: processed });
      return processed;
    }
    function setupMutationObserver() {
      try {
        const observer = new MutationObserver((mutations) => {
          let relevantChange = false;
          for (const mutation of mutations) {
            if (mutation.type === "childList") {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const el = node;
                  if (el.matches?.('input[type="password"], form') || el.querySelector?.('input[type="password"], form')) {
                    relevantChange = true;
                  }
                }
              });
            }
          }
          if (relevantChange)
            injectNonceIntoTargets();
        });
        observer.observe(document.documentElement || document.body, {
          childList: true,
          subtree: true
        });
        console.log(`${LOG_PREFIX} MutationObserver initialised`);
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to set up MutationObserver:`, error);
        postToExtension({ type: "INJECTION_ERROR", error: String(error) });
      }
    }
    function init() {
      console.log(`${LOG_PREFIX} Initialising nonce injection`);
      injectNonceIntoTargets();
      setupMutationObserver();
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  })();
})();
