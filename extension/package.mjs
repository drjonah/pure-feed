// Packages the extension into a zip for GitHub Releases
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
const filename = `pure-feed-v${version}.zip`;

// Zip everything except node_modules, source maps, and dev files
execSync(
  `zip -r ../${filename} . ` +
  `-x "node_modules/*" ` +
  `-x "options/node_modules/*" ` +
  `-x "options/src/*" ` +
  `-x "options/index.html" ` +
  `-x "options/vite.config.js" ` +
  `-x "options/package.json" ` +
  `-x "options/package-lock.json" ` +
  `-x "build.mjs" ` +
  `-x "package.mjs" ` +
  `-x "package.json" ` +
  `-x "package-lock.json" ` +
  `-x "content/content.js" ` +
  `-x "content/platforms/*" ` +
  `-x "offscreen/offscreen.js" ` +
  `-x ".DS_Store"`,
  { stdio: 'inherit' }
);

console.log(`\nPackaged: ${filename}`);
console.log(`Upload this file to a GitHub Release.`);
