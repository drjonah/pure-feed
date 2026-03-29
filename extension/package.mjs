// Packages the extension into browser-specific zips for distribution
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

const args = process.argv.slice(2);
const browserFlag = args.find(a => a.startsWith('--browser='));
const browsers = browserFlag
  ? [browserFlag.split('=')[1]]
  : ['chrome', 'firefox'];

const { version } = JSON.parse(readFileSync('manifest.base.json', 'utf8'));

for (const browser of browsers) {
  const distDir = `dist/${browser}`;
  if (!existsSync(distDir)) {
    console.error(`Error: ${distDir} does not exist. Run "npm run build" first.`);
    process.exit(1);
  }

  const filename = `pure-feed-v${version}-${browser}.zip`;
  execSync(`cd ${distDir} && zip -r ../../${filename} .`, { stdio: 'inherit' });
  console.log(`\nPackaged: ${filename}`);
}

console.log(`\nUpload these files to a GitHub Release.`);
