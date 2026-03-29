import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join } from 'path';

// --- Parse CLI flags ---
const args = process.argv.slice(2);
const browserFlag = args.find(a => a.startsWith('--browser='));
const browsers = browserFlag
  ? [browserFlag.split('=')[1]]
  : ['chrome', 'firefox'];

// --- esbuild plugins (shared) ---

const nodeBuiltinShimPlugin = {
  name: 'node-builtin-shim',
  setup(build) {
    const builtins = ['path', 'stream', 'util', 'assert', 'events', 'zlib', 'buffer'];
    const filter = new RegExp(`^(${builtins.join('|')})$`);
    build.onResolve({ filter }, args => ({
      path: args.path,
      namespace: 'node-builtin-shim',
    }));
    build.onLoad({ filter: /.*/, namespace: 'node-builtin-shim' }, () => ({
      contents: 'module.exports = {};',
      loader: 'js',
    }));
  },
};

const nsfwjsModelStubPlugin = {
  name: 'nsfwjs-model-stub',
  setup(build) {
    build.onResolve({ filter: /default_models\.js$/ }, args => {
      if (args.importer.includes('nsfwjs')) {
        return { path: args.path, namespace: 'nsfwjs-model-stub' };
      }
    });
    build.onLoad({ filter: /.*/, namespace: 'nsfwjs-model-stub' }, () => ({
      contents: 'export var DEFAULT_MODELS = [];',
      loader: 'js',
    }));
  },
};

// --- Manifest generation ---

function generateManifest(browser, outDir) {
  const base = JSON.parse(readFileSync('manifest.base.json', 'utf8'));
  const overrides = JSON.parse(readFileSync('manifest.overrides.json', 'utf8'));
  const merged = { ...base, ...overrides[browser] };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(merged, null, 2));
}

// --- Copy static files ---

function copyStatic(outDir, browser) {
  const dirs = ['popup', 'assets', 'models'];
  for (const dir of dirs) {
    if (existsSync(dir)) {
      cpSync(dir, join(outDir, dir), { recursive: true });
    }
  }
  // Options page (built output only)
  if (existsSync('options/dist')) {
    mkdirSync(join(outDir, 'options'), { recursive: true });
    cpSync('options/dist', join(outDir, 'options', 'dist'), { recursive: true });
  }
  // Chrome-only: offscreen HTML
  if (browser === 'chrome') {
    mkdirSync(join(outDir, 'offscreen'), { recursive: true });
    cpSync('offscreen/offscreen.html', join(outDir, 'offscreen', 'offscreen.html'));
  }
}

// --- Build per browser ---

async function buildForBrowser(browser) {
  const outDir = join('dist', browser);
  mkdirSync(outDir, { recursive: true });

  const builds = [];

  // Content script — same for both browsers
  builds.push(
    esbuild.build({
      entryPoints: ['content/content.js'],
      bundle: true,
      outfile: join(outDir, 'content', 'content.bundle.js'),
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      sourcemap: false,
      minify: false,
      logLevel: 'info',
    })
  );

  if (browser === 'chrome') {
    // Chrome: offscreen bundle (includes TF.js + classifier)
    builds.push(
      esbuild.build({
        entryPoints: ['offscreen/offscreen.js'],
        bundle: true,
        outfile: join(outDir, 'offscreen', 'offscreen.bundle.js'),
        format: 'iife',
        platform: 'browser',
        target: 'chrome120',
        sourcemap: false,
        minify: false,
        logLevel: 'info',
        plugins: [nodeBuiltinShimPlugin, nsfwjsModelStubPlugin],
      })
    );
    // Chrome: service worker (ESM, no bundling of TF.js — that's in offscreen)
    // The service worker uses import for shared.js but does NOT import TF.js
    builds.push(
      esbuild.build({
        entryPoints: ['background/service-worker.js'],
        bundle: true,
        outfile: join(outDir, 'background', 'service-worker.js'),
        format: 'esm',
        platform: 'browser',
        target: 'chrome120',
        sourcemap: false,
        minify: false,
        logLevel: 'info',
        external: ['@tensorflow/tfjs', 'nsfwjs'],
      })
    );
  }

  if (browser === 'firefox') {
    // Firefox: background bundle (includes shared + classifier + TF.js)
    builds.push(
      esbuild.build({
        entryPoints: ['background/background.js'],
        bundle: true,
        outfile: join(outDir, 'background', 'background.bundle.js'),
        format: 'iife',
        platform: 'browser',
        target: 'firefox109',
        sourcemap: false,
        minify: false,
        logLevel: 'info',
        plugins: [nodeBuiltinShimPlugin, nsfwjsModelStubPlugin],
      })
    );
  }

  await Promise.all(builds);

  // Generate manifest and copy static files
  generateManifest(browser, outDir);
  copyStatic(outDir, browser);

  console.log(`\n✓ Built for ${browser} → dist/${browser}/`);
}

// --- Main ---

for (const browser of browsers) {
  await buildForBrowser(browser);
}
