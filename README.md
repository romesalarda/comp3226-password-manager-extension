# OPAQUE Research Browser Extension

A minimal browser extension for testing OPAQUE protocol with a Django backend.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load the extension in your browser:
   - **Chrome/Edge**: 
     - Go to `chrome://extensions/`
     - Enable "Developer mode"
     - Click "Load unpacked"
     - Select this directory
   - **Firefox**:
     - Go to `about:debugging#/runtime/this-firefox`
     - Click "Load Temporary Add-on"
     - Select `manifest.json` from this directory
     
#### Security Notes

⚠️ **For Testing/Research Only**: This implementation stores passwords in plain text in local storage. In a production password manager, you would:
- Encrypt passwords before storage
- Use a master password
- Sync encrypted credentials via cloud storage
- Implement proper key derivation and encryption

This simplified approach is designed to test OPAQUE protocol usability without the complexity of full password management security.

### Available Functions

In `opaque.js`, you have access to:

- `initOpaqueClient()` - Initialize the OPAQUE client
- `startRegistration(email, password)` - Begin user registration
- `finishRegistration(email, password, registrationResponse)` - Complete registration
- `startLogin(email, password)` - Begin user login
- `finishLogin(password, loginResponse)` - Complete login

### Expected Django Endpoints

Configure these endpoints in your Django server:

- `POST /api/opaque/register/start` - Registration step 1
- `POST /api/opaque/register/finish` - Registration step 2
- `POST /api/opaque/login/start` - Login step 1
- `POST /api/opaque/login/finish` - Login step 2

## Development

- Source files are in `src/`
- Build outputs (`background.js`, `popup.js`) are generated and should not be edited directly
- Run `npm run build` after making changes to source files
- Reload the extension in your browser to see changes

## Notes

- The extension uses Manifest V3
- WASM is enabled for the OPAQUE library
- CORS must be properly configured on your Django server
