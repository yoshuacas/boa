import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { crc32 } from './zip-crc32.mjs';
import { buildRegistry } from './registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = join(__dirname, 'runtime');
const RUNTIME_FILES = ['handler.mjs', 'ctx.mjs', 'boa-client.mjs', 'logger.mjs'];

function listFilesRecursive(dir, exclude = []) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full, exclude));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function buildZip(fileEntries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const { name, data } of fileEntries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const crcValue = crc32(data);
    const compressed = deflateRawSync(data, { level: 6 });

    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crcValue >>> 0, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuffer.copy(localHeader, 30);

    localHeaders.push(localHeader);
    localHeaders.push(compressed);

    const centralEntry = Buffer.alloc(46 + nameBuffer.length);
    centralEntry.writeUInt32LE(0x02014b50, 0);
    centralEntry.writeUInt16LE(20, 4);
    centralEntry.writeUInt16LE(20, 6);
    centralEntry.writeUInt16LE(0, 8);
    centralEntry.writeUInt16LE(8, 10);
    centralEntry.writeUInt16LE(0, 12);
    centralEntry.writeUInt16LE(0, 14);
    centralEntry.writeUInt32LE(crcValue >>> 0, 16);
    centralEntry.writeUInt32LE(compressed.length, 20);
    centralEntry.writeUInt32LE(data.length, 24);
    centralEntry.writeUInt16LE(nameBuffer.length, 28);
    centralEntry.writeUInt16LE(0, 30);
    centralEntry.writeUInt16LE(0, 32);
    centralEntry.writeUInt16LE(0, 34);
    centralEntry.writeUInt16LE(0, 36);
    centralEntry.writeUInt32LE(0, 38);
    centralEntry.writeUInt32LE(offset, 42);
    nameBuffer.copy(centralEntry, 46);

    centralHeaders.push(centralEntry);
    offset += localHeader.length + compressed.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((s, b) => s + b.length, 0);

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(fileEntries.length, 8);
  endRecord.writeUInt16LE(fileEntries.length, 10);
  endRecord.writeUInt32LE(centralDirSize, 12);
  endRecord.writeUInt32LE(centralDirOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, endRecord]);
}

export async function packageFunctions(descriptors, opts = {}) {
  const fileEntries = [];

  for (const runtimeFile of RUNTIME_FILES) {
    const data = readFileSync(join(RUNTIME_DIR, runtimeFile));
    fileEntries.push({ name: runtimeFile, data });
  }

  const registry = buildRegistry(descriptors);
  const registryJson = JSON.stringify(registry, null, 2);
  fileEntries.push({ name: '_registry.json', data: Buffer.from(registryJson) });

  for (const desc of descriptors.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    const fnFiles = listFilesRecursive(desc.path, ['node_modules']);
    fnFiles.sort();
    for (const filePath of fnFiles) {
      const rel = relative(desc.path, filePath);
      const zipName = `functions/${desc.name}/${rel}`;
      fileEntries.push({ name: zipName, data: readFileSync(filePath) });
    }
  }

  const zipBuffer = buildZip(fileEntries);
  const entries = fileEntries.map((e) => e.name);
  const maxTimeout = descriptors.length > 0
    ? Math.max(...descriptors.map((d) => d.timeout))
    : 30;
  const maxMemory = descriptors.length > 0
    ? Math.max(...descriptors.map((d) => d.memory))
    : 256;

  return { zipBuffer, entries, maxTimeout, maxMemory };
}
