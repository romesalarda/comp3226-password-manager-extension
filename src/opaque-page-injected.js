// Page-level injected script for OPAQUE authentication
// This script runs in the page context (not content script context)
// It can only communicate via DOM events, NOT chrome APIs

console.log('[OPAQUE Page] Page-level injected script loaded');

// Check if OPAQUE is supported on this site
async function checkOpaqueSupport() {
  try {
    // TODO: get the correct endpoint URL dynamically if needed
    const siteOrigin = window.location.origin;
    const response = await fetch(`${siteOrigin}/o/check`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (response.status === 200 && response.headers.get('content-type') && response.headers.get('content-type').includes('application/json')) {
      const data = await response.json();
      if (data.opaque_supported) {
        console.log('[OPAQUE Page] OPAQUE endpoints detected on this site');
        return true;
      }
    }
  } catch (error) {
    console.log('[OPAQUE Page] No OPAQUE support on this site');
  }
  return false;
}

// Check if user is currently logged in
async function checkLoginStatus() {
  try {
    const siteOrigin = window.location.origin;
    // Try to access a protected endpoint or check session status
    const response = await fetch(`${siteOrigin}/o/session/verify`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.status === 200 && 
        response.headers.get('content-type') && 
        response.headers.get('content-type').includes('application/json')) {
      const data = await response.json();
      // Check if the response includes authentication status
      if (data.authenticated !== undefined) {
        return data.authenticated;
      }
    }
    
    // Fallback: check for common session indicators
    // If we get a 200 response and there are cookies, we might be logged in
    const cookies = document.cookie;
    const hasSessionCookie = cookies.includes('sessionid')
    
    console.log('[OPAQUE Page] Login status check - has session cookies:', hasSessionCookie);
    return hasSessionCookie;
  } catch (error) {
    console.log('[OPAQUE Page] Error checking login status:', error);
    return false;
  }
}

// Show "Sign in via OPAQUE" button in the page
function showOpaqueLoginButton() {
  // Check if button already exists
  if (document.getElementById('opaque-signin-badge')) {
    return;
  }
  
  const badge = document.createElement('div');
  badge.id = 'opaque-signin-badge';
  badge.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    z-index: 999999;
    transition: all 0.2s ease;
    border: none;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  badge.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
    <span>Sign in via OPAQUE</span>
  `;
  
  // Add hover effect
  badge.addEventListener('mouseenter', () => {
    badge.style.transform = 'translateY(-2px)';
    badge.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
  });
  
  badge.addEventListener('mouseleave', () => {
    badge.style.transform = 'translateY(0)';
    badge.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  });
  
  // Dispatch event when clicked
  badge.addEventListener('click', () => {
    console.log('[OPAQUE Page] User clicked Sign in via OPAQUE');
    badge.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
      </svg>
      <span>Opening...</span>
    `;
    badge.style.opacity = '0.7';
    badge.style.cursor = 'wait';
    
    // Dispatch custom event for content script to listen to
    window.dispatchEvent(new CustomEvent('OPAQUE:RequestLogin', {
      detail: {
        timestamp: Date.now(),
        origin: window.location.origin
      }
    }));
  });
  
  document.body.appendChild(badge);
  console.log('[OPAQUE Page] Sign in button added to page');
}

// Listen for login completion from extension
window.addEventListener('OPAQUE:Complete', (event) => {
  console.log('[OPAQUE Page] Received login completion:', event.detail);
  
  const badge = document.getElementById('opaque-signin-badge');
  
  if (event.detail.success) {
    if (badge) {
      badge.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>Login Successful!</span>
      `;
      badge.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
      
      // Redirect or reload after success
      setTimeout(() => {
        if (event.detail.redirectUrl) {
          window.location.href = event.detail.redirectUrl;
        } else {
          window.location.reload();
        }
      }, 1500);
    }
  } else {
    if (badge) {
      badge.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span>Login Failed</span>
      `;
      badge.style.background = 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)';
      
      // Reset after a few seconds
      setTimeout(() => {
        badge.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <span>Sign in via OPAQUE</span>
        `;
        badge.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        badge.style.opacity = '1';
        badge.style.cursor = 'pointer';
      }, 3000);
    }
  }
});

// Request credential check from content script
function checkStoredCredentials() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('[OPAQUE Page] Credential check timed out');
      resolve(false);
    }, 2000);

    const handler = (event) => {
      clearTimeout(timeout);
      window.removeEventListener('OPAQUE:CredentialsStatus', handler);
      console.log('[OPAQUE Page] Received credentials status:', event.detail);
      resolve(event.detail.hasCredentials);
    };

    window.addEventListener('OPAQUE:CredentialsStatus', handler);
    
    // Request credential check from content script
    window.dispatchEvent(new CustomEvent('OPAQUE:CheckCredentials', {
      detail: { timestamp: Date.now() }
    }));
  });
}

// Initialize on page load
async function init() {
  console.log('[OPAQUE Page] Initializing OPAQUE page script');
  
  // Check if OPAQUE is supported
  const isSupported = await checkOpaqueSupport();
  
  if (isSupported) {
    // Check if we have stored credentials via content script
    const hasCredentials = await checkStoredCredentials();
    const isLoggedIn = await checkLoginStatus();

    if (hasCredentials && !isLoggedIn) {
      console.log('[OPAQUE Page] OPAQUE supported, credentials exist, but user not logged in - showing login button');
      showOpaqueLoginButton();
    } else if (hasCredentials && isLoggedIn) {
      console.log('[OPAQUE Page] User already logged in - not showing button');
    } else if (!hasCredentials) {
      console.log('[OPAQUE Page] No credentials stored - not showing button');
    }
  } else {
    console.log('[OPAQUE Page] OPAQUE not supported on this site, no action taken');
  }
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
