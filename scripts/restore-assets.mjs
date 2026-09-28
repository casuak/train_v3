import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const manifest = JSON.parse(
  await readFile(new URL('../art/packed/manifest.json', import.meta.url), 'utf8'),
);
const root = new URL('../', import.meta.url);
for (const asset of manifest) {
  const pieces = await Promise.all(
    asset.chunks.map((path) => readFile(new URL(path, root), 'utf8')),
  );
  const data = Buffer.from(pieces.join(''), 'base64');
  if (
    data.length !== asset.size ||
    createHash('sha256').update(data).digest('hex') !== asset.sha256
  )
    throw new Error(`Asset checksum mismatch: ${asset.output}`);
  const output = new URL(asset.output, root);
  await mkdir(new URL('./', output), { recursive: true });
  await writeFile(output, data);
  console.log(`Restored ${asset.output}`);
}
