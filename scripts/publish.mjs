// Bump version, run vite build, copy artifacts to publish/.
// Usage: npm run publish
//
// Versioning (a.b.yymm.LAST, 4 integer segments, Chrome-compatible):
//   - First publish ever (no prior yymm in package.json) → LAST = dd        e.g. 0.4.2605.16
//   - Same-day rebuild                                   → LAST = dd*100+N  e.g. 0.4.2605.1601, .1602
//   - Cross-day publish                                  → LAST = dd*100+0  e.g. 0.4.2605.1700
//
// LAST is monotonically non-decreasing (16 < 1601 < 1602 < 1700), satisfying Chrome's
// per-segment integer comparison. Source of `a.b` and the same-day counter: package.json.version.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const DIST_DIR = path.join(ROOT, 'dist');
const PUBLISH_DIR = path.join(ROOT, 'publish');

const MAX_BUILDS_PER_DAY = 100;

export function parseDisplayVersion(version) {
  const segs = String(version || '').split('.');
  const a = segs[0] || '0';
  const b = segs[1] || '0';
  const yymm = Number(segs[2]) || 0;
  const last = Number(segs[3]);
  let dd = 0;
  let build = 0;
  if (Number.isFinite(last) && last > 0) {
    if (last < MAX_BUILDS_PER_DAY) {
      // bare `dd`: first publish of a day with no build counter
      dd = last;
    } else {
      dd = Math.floor(last / MAX_BUILDS_PER_DAY);
      build = last % MAX_BUILDS_PER_DAY;
    }
  }
  return { a, b, yymm, dd, build };
}

export function todayYymmDd(now = new Date()) {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return { yymm: Number(`${yy}${mm}`), dd: now.getDate() };
}

export function nextVersion(currentVersion, now = new Date()) {
  const cur = parseDisplayVersion(currentVersion);
  const today = todayYymmDd(now);
  const hasPrior = cur.yymm > 0;
  const sameDay = hasPrior && cur.yymm === today.yymm && cur.dd === today.dd;
  const nextBuild = sameDay ? cur.build + 1 : 0;
  if (nextBuild >= MAX_BUILDS_PER_DAY) {
    throw new Error(`[publish] build counter overflow: ${nextBuild} >= ${MAX_BUILDS_PER_DAY}`);
  }
  const lastSeg = hasPrior ? today.dd * MAX_BUILDS_PER_DAY + nextBuild : today.dd;
  return {
    version: `${cur.a}.${cur.b}.${today.yymm}.${lastSeg}`,
    buildNumber: nextBuild,
    firstEver: !hasPrior,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj, indent) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, indent) + '\n', 'utf8');
}

function writeVersionField(filePath, indent, newVersion) {
  const obj = readJson(filePath);
  const oldVersion = obj.version;
  obj.version = newVersion;
  // Clean up any legacy `version_name` field carried over from a previous schema.
  if ('version_name' in obj) delete obj.version_name;
  writeJson(filePath, obj, indent);
  return oldVersion;
}

function runBuild() {
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT });
}

function copyArtifacts() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error('dist/ not found after build; aborting copy.');
  }
  if (fs.existsSync(PUBLISH_DIR)) {
    fs.rmSync(PUBLISH_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(PUBLISH_DIR, { recursive: true });
  fs.cpSync(DIST_DIR, path.join(PUBLISH_DIR, 'dist'), { recursive: true });
  fs.cpSync(MANIFEST_PATH, path.join(PUBLISH_DIR, 'manifest.json'));
}

function main() {
  const currentPkgVersion = readJson(PACKAGE_PATH).version;
  const { version, buildNumber, firstEver } = nextVersion(currentPkgVersion);

  const oldPkg = writeVersionField(PACKAGE_PATH, 4, version);
  const oldMan = writeVersionField(MANIFEST_PATH, 2, version);

  const label = firstEver
    ? 'first publish ever (no build counter)'
    : buildNumber === 0
      ? 'cross-day publish (build counter reset)'
      : `same-day rebuild #${buildNumber}`;

  console.log(`[publish] package.json:  ${oldPkg} -> ${version}`);
  console.log(`[publish] manifest.json: ${oldMan} -> ${version}`);
  console.log(`[publish] ${label}`);

  console.log('[publish] running vite build...');
  runBuild();

  console.log('[publish] copying dist/ and manifest.json to publish/');
  copyArtifacts();

  console.log(`[publish] done. publish/ ready (version ${version}).`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}
