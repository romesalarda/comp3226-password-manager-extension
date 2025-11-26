// UI handler for popup
console.log('popup-ui.js loaded and executing');
const DJANGO_SERVER = 'https://steadfast-reprieve-production.up.railway.app';

// Helper: wait for the global opaqueAPI to be available. Uses an event
// dispatched by `popup.js` (opaqueAPIReady) with a timeout fallback.
function waitForOpaqueAPI(timeoutMs = 5000) {
  if (window.opaqueAPI) return Promise.resolve(window.opaqueAPI);

  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve(window.opaqueAPI);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('opaqueAPI not available within timeout'));
    };
    function cleanup() {
      window.removeEventListener('opaqueAPIReady', onReady);
      clearTimeout(timer);
    }
    window.addEventListener('opaqueAPIReady', onReady);
    const timer = setTimeout(onTimeout, timeoutMs);
  });
}

// Helper: Update status display
function updateStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.className = `show ${type}`;
  }
}

// Helper: Get form values
function getFormValues() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  return { email, password };
}

// Helper: Validate form inputs
function validateForm(email, password) {
  if (!email) {
    updateStatus('Please enter an email address', 'error');
    return false;
  }
  if (!password) {
    updateStatus('Please enter a password', 'error');
    return false;
  }
  if (!email.includes('@')) {
    updateStatus('Please enter a valid email address', 'error');
    return false;
  }
  if (password.length < 6) {
    updateStatus('Password must be at least 6 characters', 'error');
    return false;
  }
  return true;
}

// Register button handler
const registerBtn = document.getElementById('registerBtn');
if (registerBtn) {
  console.log('Adding click event listener to registerBtn');
  registerBtn.addEventListener('click', async () => {
    console.log('Register button clicked!');
    
    const { email, password } = getFormValues();
    
    if (!validateForm(email, password)) {
      return;
    }

    try {
      updateStatus('Initializing OPAQUE registration...', 'info');
      
      console.log('Waiting for opaqueAPI...');
      const api = await waitForOpaqueAPI();
      console.log('opaqueAPI received:', api);
      
      // Step 1: Start registration
      updateStatus('Step 1: Sending registration request...', 'info');
      console.log('Step 1: Starting registration for:', email);
      
      const step1Result = await api.startRegistration(email, password);
      console.log('Step 1 response:', step1Result);
      
      // Step 2: Finish registration
      updateStatus('Step 2: Completing registration...', 'info');
      
      const registrationResponse = typeof step1Result === 'string' 
        ? step1Result 
        : step1Result.registration_response;
      
      if (!registrationResponse) {
        throw new Error('Server did not return registration_response');
      }
      
      console.log('Step 2: Finishing registration with response:', registrationResponse);
      const step2Result = await api.finishRegistration(registrationResponse);
      console.log('Step 2 response:', step2Result);
      
      updateStatus(`✓ Registration successful for ${email}!`, 'success');
      console.log('Full registration complete:', step2Result);
      
    } catch (error) {
      console.error('Registration error:', error);
      updateStatus(`✗ Registration failed: ${error.message}`, 'error');
    }
  });
} else {
  console.warn('popup-ui: #registerBtn not found in DOM');
}

// Login button handler
const loginBtn = document.getElementById('loginBtn');
if (loginBtn) {
  console.log('Adding click event listener to loginBtn');
  loginBtn.addEventListener('click', async () => {
    console.log('Login button clicked!');
    
    const { email, password } = getFormValues();
    
    if (!validateForm(email, password)) {
      return;
    }

    try {
      updateStatus('Initializing OPAQUE login...', 'info');
      
      console.log('Waiting for opaqueAPI...');
      const api = await waitForOpaqueAPI();
      console.log('opaqueAPI received:', api);
      
      // Step 1: Start login
      updateStatus('Step 1: Sending login request...', 'info');
      console.log('Step 1: Starting login for:', email);
      
      const step1Result = await api.startLogin(email, password);
      console.log('Step 1 response:', step1Result);
      console.log('Cache key received:', step1Result.cache_key);
      
      // Step 2: Finish login
      updateStatus('Step 2: Completing login...', 'info');
      
      if (!step1Result.client_response) {
        throw new Error('Server did not return client_response');
      }
      
      if (!step1Result.cache_key) {
        throw new Error('Server did not return cache_key');
      }
      
      console.log('Step 2: Finishing login with cache key:', step1Result.cache_key);
      const step2Result = await api.finishLogin(
        step1Result.client_response,
        step1Result.cache_key
      );
      console.log('Step 2 response:', step2Result);
      
      updateStatus(`✓ Login successful! Welcome ${email}`, 'success');
      console.log('Full login complete:', step2Result);
      console.log('Session key established');
      
      // Verify session is active
      console.log('Verifying session...');
      const sessionCheck = await api.verifySession();
      
      if (sessionCheck.authenticated) {
        console.log('Session verified successfully:', sessionCheck);
        updateStatus(`✓ Login successful! Opening Django site...`, 'success');
        
        // Open Django redirect endpoint to transfer session to browser context
        // This endpoint will validate the session and redirect to home page
        setTimeout(() => {
          chrome.tabs.create({ url: `https://${DJANGO_SERVER}o/session/redirect` });
        }, 1000);
      } else {
        console.warn('Session verification failed:', sessionCheck);
        updateStatus(`⚠ Login completed but session verification failed`, 'warning');
      }
      
    } catch (error) {
      console.error('Login error:', error);
      updateStatus(`✗ Login failed: ${error.message}`, 'error');
    }
  });
} else {
  console.warn('popup-ui: #loginBtn not found in DOM');
}

// Add session check on popup load
window.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup loaded, checking session status...');
  
  try {
    const api = await waitForOpaqueAPI();
    const sessionCheck = await api.verifySession();
    
    if (sessionCheck.authenticated) {
      console.log('Active session found:', sessionCheck);
      updateStatus(`✓ Logged in as ${sessionCheck.email}`, 'success');
    } else {
      console.log('No active session');
    }
  } catch (error) {
    console.log('Session check skipped:', error.message);
  }
});

console.log('popup-ui.js initialization complete');
