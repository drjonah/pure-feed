import * as esbuild from 'esbuild';

// nsfwjs pulls in gif/png processing libs that reference Node builtins.
// We only use model.classify(canvas) — none of those code paths run.
// Shim them out as empty modules so the bundle doesn't break.
const nodeBuiltinShimPlugin = {
  name: 'node-builtin-shim',
  setup(build) {
    const builtins = ['path', 'stream', 'util', 'assert', 'events', 'zlib', 'buffer', '@nsfw-filter/gif-frames'];
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
    plugins: [nodeBuiltinShimPlugin],
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
