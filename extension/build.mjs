import * as esbuild from 'esbuild';

// Shim Node builtins that nsfwjs/tfjs reference but never execute in browser.
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

// nsfwjs 4.x bundles all model weights as JS modules (~38 MB).
// We load our own model from extension local files, so replace
// default_models.js with an empty list to exclude them from the bundle.
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

await Promise.all([
  esbuild.build({
    entryPoints: ['offscreen/offscreen.js'],
    bundle: true,
    outfile: 'offscreen/offscreen.bundle.js',
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    sourcemap: false,
    minify: false,
    logLevel: 'info',
    plugins: [nodeBuiltinShimPlugin, nsfwjsModelStubPlugin],
  }),
  esbuild.build({
    entryPoints: ['content/content.js'],
    bundle: true,
    outfile: 'content/content.bundle.js',
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    sourcemap: false,
    minify: false,
    logLevel: 'info',
  }),
]);
