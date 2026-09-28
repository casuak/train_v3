import { readFile, writeFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const outputPath = `dist/train-v${version}.html`;
const html = await readFile('dist/index.html', 'utf8');
const jsPath = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)?.[1];
const cssPath = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)?.[1];
if (!jsPath || !cssPath) throw new Error('Missing build assets');
const js = await readFile(`dist/${jsPath.replace(/^\.\//, '')}`, 'utf8');
const css = await readFile(`dist/${cssPath.replace(/^\.\//, '')}`, 'utf8');
const atlas =
  'data:image/png;base64,' + (await readFile('public/assets/train-atlas.png')).toString('base64');
const terrain =
  'data:image/png;base64,' + (await readFile('public/assets/tundra.png')).toString('base64');
const out = html
  .replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/, '')
  .replace(/<link[^>]+href="[^"]+\.css"[^>]*>/, '')
  .replace('</head>', `<style>${css}</style></head>`)
  .replace(
    '</body>',
    `<script>window.TRAIN_ASSETS=${JSON.stringify({ atlas, terrain })};</script><script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script></body>`,
  );
const notice = await readFile('node_modules/three/LICENSE', 'utf8');
await writeFile(
  outputPath,
  out.replace('</head>', `<!-- Third-party runtime: Three.js\n${notice}\n--></head>`),
);
console.log(
  `Portable game: ${outputPath} (${(Buffer.byteLength(out) / 1024 / 1024).toFixed(2)} MiB)`,
);
