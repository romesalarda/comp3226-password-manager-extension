// Popup script for OPAQUE extension
import * as opaque from "@serenity-kit/opaque";

// Django server configuration
// const DJANGO_SERVER = 'https://steadfast-reprieve-production.up.railway.app';
let websiteOrigin = null;
  
async function getWebsiteOrigin() {
  if (websiteOrigin) {
    return websiteOrigin;
  }
  
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      
      if (tabs[0]) {
        websiteOrigin = new URL(tabs[0].url).origin;
        console.log('Current website:', websiteOrigin);
        resolve(websiteOrigin);
      } else {
        console.log('No active tab found');
        reject(new Error('No active tab found'));
      }
    });
  });
}

// Helper function to get CSRF token from Django cookie via background script
async function getCSRFToken() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'getCSRFToken', url: websiteOrigin },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.token);
        }
      }
    );
  });
}

// Local state management for OPAQUE flows
const opaqueState = {
  // Registration state
  clientRegistrationState: null,
  registrationEmail: null,
  registrationPassword: null,
  
  // Login state (for future use)
  clientLoginState: null,
  loginEmail: null,
  loginPassword: null,
  
  // Clear registration state
  clearRegistrationState() {
    this.clientRegistrationState = null;
    this.registrationEmail = null;
    this.registrationPassword = null;
    console.log('Registration state cleared');
  },
  
  // Clear login state
  clearLoginState() {
    this.clientLoginState = null;
    this.loginEmail = null;
    this.loginPassword = null;
    console.log('Login state cleared');
  },
  
  // Clear all state
  clearAll() {
    this.clearRegistrationState();
    this.clearLoginState();
    console.log('All OPAQUE state cleared');
  }
};

// Registration flow (step 1): Start registration
async function startRegistration(email, password) {
  try {
    console.log('Starting registration for:', email);
    
    opaqueState.clearRegistrationState();
    opaqueState.registrationEmail = email;
    opaqueState.registrationPassword = password;
    
    // Start OPAQUE registration
    const { clientRegistrationState, registrationRequest } =
      opaque.client.startRegistration({ password });
    
    opaqueState.clientRegistrationState = clientRegistrationState;
    
    console.log('Registration request created:', registrationRequest);
    const websiteOrigin = await getWebsiteOrigin();
    
    const csrfToken = await getCSRFToken(); // run background script for security 
    
    const response = await fetch(`${websiteOrigin}/o/registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRFToken': csrfToken })
      },
      credentials: 'include',  // Include cookies for session management
      body: JSON.stringify({
        email: email,
        registration_request: registrationRequest
      })
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Server registration response:', data);
    
    return data;
  } catch (error) {
    console.error('Registration error:', error);
    opaqueState.clearRegistrationState();
    throw error;
  }
}

// Registration flow (step 2): Finish registration
async function finishRegistration(registrationResponse) {
  try {
    console.log('Finishing registration...');
    
    // Validate we have the required state
    if (!opaqueState.clientRegistrationState) {
      throw new Error('No client registration state found. Please start registration first.');
    }
    
    if (!opaqueState.registrationPassword) {
      throw new Error('No password found in state. Please start registration first.');
    }
    
    // Finish OPAQUE registration
    const { registrationRecord } = opaque.client.finishRegistration({
      clientRegistrationState: opaqueState.clientRegistrationState,
      registrationResponse,
      password: opaqueState.registrationPassword,
    });
    
    console.log('Registration record created:', registrationRecord);
    
    // Get CSRF token from cookie
    const csrfToken = await getCSRFToken();
    const websiteOrigin = await getWebsiteOrigin();
    
    // Send registration record to Django server to store
    const response = await fetch(`${websiteOrigin}/o/registration/finish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRFToken': csrfToken })
      },
      credentials: 'include',  // Include cookies for session management
      body: JSON.stringify({
        email: opaqueState.registrationEmail,
        registration_record: registrationRecord
      })
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Registration finished successfully:', data);
    
    // Clear registration state after successful completion
    opaqueState.clearRegistrationState();
    
    return data;
  } catch (error) {
    console.error('Registration finish error:', error);
    // Don't clear state on error in case user wants to retry
    throw error;
  }
}

// Login flow (step 1): Start login
async function startLogin(email, password) {
  try {
    console.log('Starting login for:', email);
    
    // Clear any previous login state
    opaqueState.clearLoginState();
    
    // Store email and password in state for step 2
    opaqueState.loginEmail = email;
    opaqueState.loginPassword = password;

    if (!password || password.length === 0) {
      throw new Error("Please provide a password for OPAQUE login");
    }

    if (!email || email.length === 0) {
      throw new Error("Please provide an email for OPAQUE login");
    }
    
    // Start OPAQUE login
    const { clientLoginState, startLoginRequest } =
      opaque.client.startLogin({ password });
    
    // Store client state for use in finishLogin
    opaqueState.clientLoginState = clientLoginState;
    
    console.log('Login request created:', startLoginRequest);
    
    // Get CSRF token from cookie
    const csrfToken = await getCSRFToken();
    const websiteOrigin = await getWebsiteOrigin();
    
    // Send login request to Django server
    const response = await fetch(`${websiteOrigin}/o/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRFToken': csrfToken })
      },
      credentials: 'include',  // Include cookies for session management
      body: JSON.stringify({
        email: email,
        client_request: startLoginRequest
      })
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Server login response:', data);
    
    return data;
  } catch (error) {
    console.error('Login error:', error);
    opaqueState.clearLoginState();
    throw error;
  }
}

// Login flow (step 2): Finish login
async function finishLogin(loginResponse, cacheKey) {
  try {
    console.log('Finishing login...');
    
    // Validate we have the required state
    if (!opaqueState.clientLoginState) {
      throw new Error('No client login state found. Please start login first.');
    }
    
    if (!opaqueState.loginPassword) {
      throw new Error('No password found in state. Please start login first.');
    }
    
    // Extract the server's login response from the data
    const serverLoginResponse = typeof loginResponse === 'string' 
      ? loginResponse 
      : loginResponse.client_response || loginResponse;
    
    // Finish OPAQUE login
    const loginStatus = opaque.client.finishLogin({
      clientLoginState: opaqueState.clientLoginState,
      loginResponse: serverLoginResponse,
      password: opaqueState.loginPassword,
    });
    console.log('Login finish request created:', loginStatus);

    if (loginStatus === undefined) {
      throw Error("unauthorised")
    }

    const { finishLoginRequest, exportKey, sessionKey } = loginStatus
    
    console.log('Session key established');
    
    // Get CSRF token from cookie
    const csrfToken = await getCSRFToken();
    const websiteOrigin = await getWebsiteOrigin();
    
    // Send finish login request to Django server with cache key
    const response = await fetch(`${websiteOrigin}/o/login/finish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRFToken': csrfToken })
      },
      credentials: 'include',  // Include cookies for session management
      body: JSON.stringify({
        cache_key: cacheKey,
        client_finish_request: finishLoginRequest
      })
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Login finished successfully:', data);
    
    // Clear login state after successful completion
    opaqueState.clearLoginState();
    
    return {
      ...data,
      sessionKey: sessionKey,
      exportKey: exportKey
    };
  } catch (error) {
    console.error('Login finish error:', error);
    // Don't clear state on error in case user wants to retry
    throw error;
  }
}

// Session verification: Check if user is logged in
async function verifySession() {
  try {
    console.log('Verifying session...');
    const websiteOrigin = await getWebsiteOrigin();
    
    const response = await fetch(`${websiteOrigin}/o/session/verify`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',  // Include cookies for session management
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.log('Session not authenticated');
        return { authenticated: false };
      }
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Session verified:', data);
    
    return {
      authenticated: true,
      ...data
    };
  } catch (error) {
    console.error('Session verification error:', error);
    return { authenticated: false, error: error.message };
  }
}

// Logout: End the user session
async function logoutSession() {
  try {
    console.log('Logging out...');
    
    // Get CSRF token from cookie
    const csrfToken = await getCSRFToken();
    const websiteOrigin = await getWebsiteOrigin();
    
    const response = await fetch(`${websiteOrigin}/o/session/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRFToken': csrfToken })
      },
      credentials: 'include',  // Include cookies for session management
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Logout successful:', data);
    
    // Clear local state as well
    opaqueState.clearAll();
    
    return data;
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

function savePasswordToStorage(email, password) {
  chrome.storage.local.set({ [`password_${email}_${websiteOrigin}`]: password }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error saving password to storage:', chrome.runtime.lastError);
    } else {
      console.log('Password saved to storage for', email);
    }
  });
}

function getPasswordFromStorage(email) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([`password_${email}_${websiteOrigin}`], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result[`password_${email}_${websiteOrigin}`]);
      }
    });
  });
}

// Export functions for use in popup.html
window.opaqueAPI = {
  startRegistration,
  finishRegistration,
  startLogin,
  finishLogin,
  verifySession,
  logoutSession,
  // Expose state management for debugging
  getState: () => ({
    hasRegistrationState: !!opaqueState.clientRegistrationState,
    registrationEmail: opaqueState.registrationEmail,
    hasLoginState: !!opaqueState.clientLoginState,
    loginEmail: opaqueState.loginEmail
  }),
  clearState: () => opaqueState.clearAll(),

  savePasswordToStorage,
  getPasswordFromStorage,

  getWebsiteOrigin
};

// Notify any UI scripts that the API is ready to be used. Useful to avoid
// race conditions when scripts load in an uncertain order.
try {
  window.dispatchEvent(new Event('opaqueAPIReady'));
} catch (e) {
  // Older browsers in some extension contexts may throw — ignore.
}

console.log('OPAQUE Extension popup script loaded');
