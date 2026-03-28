const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const common = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch,
  target: ['chrome120'],
  outdir: path.resolve(__dirname, 'dist'),
};

const entries = [
  { entry: 'src/content.js', format: 'iife' },
  { entry: 'src/content-allday.js', format: 'iife' },
  { entry: 'src/content-pinnacle.js', format: 'iife' },
  { entry: 'src/background.js', format: 'esm' },
];

async function build() {
  const contexts = [];
  for (const { entry, format } of entries) {
    contexts.push(await esbuild.context({
      ...common,
      entryPoints: [path.resolve(__dirname, entry)],
      format,
    }));
  }

  if (isWatch) {
    for (const ctx of contexts) await ctx.watch();
    console.log('Watching for changes...');
  } else {
    for (const ctx of contexts) { await ctx.rebuild(); await ctx.dispose(); }
    console.log('Build complete.');
  }
}

build().catch((err) => { console.error(err); process.exit(1); });
