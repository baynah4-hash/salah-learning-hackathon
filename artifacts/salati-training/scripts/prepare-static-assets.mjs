import { readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(scriptDirectory, '../dist/public');
const maxStaticFileBytes = 24 * 1024 * 1024;
const partSizeBytes = 20 * 1024 * 1024;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return paths.flat();
}

const files = await walk(publicDirectory);
const oversized = [];
for (const filePath of files) {
  const fileInfo = await stat(filePath);
  if (fileInfo.size > maxStaticFileBytes) oversized.push({ filePath, size: fileInfo.size });
}

for (const { filePath, size } of oversized) {
  const source = await readFile(filePath);
  const parts = [];
  for (let offset = 0, partIndex = 0; offset < source.byteLength; offset += partSizeBytes, partIndex += 1) {
    const partName = `${basename(filePath)}.part-${String(partIndex).padStart(2, '0')}`;
    const partPath = resolve(dirname(filePath), partName);
    await writeFile(partPath, source.subarray(offset, Math.min(offset + partSizeBytes, source.byteLength)));
    parts.push(partName);
  }

  const contentType = filePath.endsWith('.wasm')
    ? 'application/wasm'
    : 'application/octet-stream';
  await writeFile(`${filePath}.parts.json`, JSON.stringify({
    contentType,
    parts,
    size,
  }, null, 2));
  await unlink(filePath);
  console.log(`Split ${filePath.slice(publicDirectory.length + 1)} into ${parts.length} files.`);
}

if (oversized.length === 0) console.log('All static files meet the hosting file-size limit.');
