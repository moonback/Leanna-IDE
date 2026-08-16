const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env.local first, then .env
const envLocalPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const port = process.env.VITE_SERVER_PORT || 5000;
const isDebug = process.env.ELECTRON_DEBUG === '1' || process.argv.includes('--debug');

console.log(`[Desktop Runner] Waiting for http://127.0.0.1:${port}...`);

try {
  // Wait for the dev server (Express is explicitly bound to IPv4).
  execSync(`npx wait-on http://127.0.0.1:${port}`, { stdio: 'inherit' });

  // Run electron
  console.log(`[Desktop Runner] Starting Electron...`);
  const electronCmd = isDebug 
    ? 'npx cross-env ELECTRON_DEBUG=1 electron --inspect=5858 electron/main.cjs'
    : 'npx electron electron/main.cjs';

  execSync(electronCmd, { stdio: 'inherit' });
} catch (error) {
  console.error('[Desktop Runner] Error:', error.message);
  process.exit(1);
}
