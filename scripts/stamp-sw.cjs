// Stamps public/sw.js's cache name with the real build time so the browser
// always sees a byte-different service worker file after each deploy and
// reliably triggers the update flow (identical bytes = browsers skip the update).
const fs = require('fs');
const path = require('path');

const outDir = fs.existsSync(path.join(__dirname, '..', 'build')) ? 'build' : 'dist';
const swPath = path.join(__dirname, '..', outDir, 'sw.js');

if (!fs.existsSync(swPath)) {
  console.warn(`[stamp-sw] ${swPath} not found, skipping.`);
  process.exit(0);
}

const version = String(Date.now());
const contents = fs.readFileSync(swPath, 'utf8').replace(/__BUILD_VERSION__/g, version);
fs.writeFileSync(swPath, contents);
console.log(`[stamp-sw] Stamped ${swPath} with version ${version}`);
