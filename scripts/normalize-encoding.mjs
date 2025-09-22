// UTF-8 no BOM normalizer for text files
// Usage:
//   node scripts/normalize-encoding.mjs --check   # only report files with BOM
//   node scripts/normalize-encoding.mjs --fix     # strip BOM in-place

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const doFix = args.has('--fix');

const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', '.shrimp']);
const TEXT_EXTS = new Set([
  '.vue', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.html', '.css', '.md', '.cst', '.cts', '.txt', '.cjs', '.cjson', '.svg'
]);

function isTextFile(file) {
  const ext = path.extname(file).toLowerCase();
  return TEXT_EXTS.has(ext);
}

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const changed = [];
const bomFiles = [];

for (const file of walk(ROOT)) {
  if (!isTextFile(file)) continue;
  try {
    const buf = fs.readFileSync(file);
    if (buf.length >= 3 && buf[0] === BOM[0] && buf[1] === BOM[1] && buf[2] === BOM[2]) {
      bomFiles.push(file);
      if (doFix) {
        const without = buf.subarray(3);
        // Write back as UTF-8 (without BOM)
        fs.writeFileSync(file, without);
        changed.push(file);
      }
    }
  } catch (e) {
    // ignore non-readable files
  }
}

if (!doFix) {
  if (bomFiles.length) {
    console.log(`[encoding-check] Found ${bomFiles.length} file(s) with BOM:`);
    bomFiles.forEach(f => console.log(' - ' + path.relative(ROOT, f)));
    process.exitCode = 1;
  } else {
    console.log('[encoding-check] No BOM found. All good.');
  }
} else {
  console.log(`[encoding-fix] Stripped BOM from ${changed.length} file(s).`);
  changed.forEach(f => console.log(' - ' + path.relative(ROOT, f)));
}

