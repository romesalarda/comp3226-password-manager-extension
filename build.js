import * as esbuild from 'esbuild';

// Build configuration for the OPAQUE extension
const buildOptions = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'firefox100'],
  logLevel: 'info',
};

// Build the OPAQUE module (renamed from popup.js to opaque.js)
await esbuild.build({
  ...buildOptions,
  entryPoints: ['src/opaque.js'],
  outfile: 'opaque.js',
}).catch(() => process.exit(1));

// Build the popup UI handler
await esbuild.build({
  ...buildOptions,
  entryPoints: ['src/popup-ui.js'],
  outfile: 'popup-ui.js',
}).catch(() => process.exit(1));

// Build the background service worker
await esbuild.build({
  ...buildOptions,
  entryPoints: ['src/background.js'],
  outfile: 'background.js',
}).catch(() => process.exit(1));

console.log('Build complete! ✓');
