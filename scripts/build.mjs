import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
  entryPoints: ['src/main.ts'],
  outdir: 'dist',
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  target: 'es2022',
  loader: { '.task': 'binary', '.glb': 'binary', '.wasm': 'binary', '.txt': 'text', '.woff2': 'dataurl' },
  plugins: [{
    name: 'embed-mediapipe-loader',
    setup(build) {
      build.onResolve({ filter: /^mediapipe-wasm-loader$/ }, () => ({
        path: fileURLToPath(new URL('../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js', import.meta.url)),
        namespace: 'wasm-loader',
      }));
      build.onLoad({ filter: /.*/, namespace: 'wasm-loader' }, async ({ path }) => ({
        contents: await readFile(path, 'utf8'),
        loader: 'text',
      }));
    },
  }],
});
const script = result.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = result.outputFiles.find(file => file.path.endsWith('.css')).text;
const template = await readFile('index.html', 'utf8');
const html = template.replace('</head>', () => '<style>' + css + '</style></head>')
  .replace('</body>', () => '<script>' + script + '</script></body>');
await mkdir('dist', { recursive: true });
await writeFile('dist/Papaguy.html', html);
