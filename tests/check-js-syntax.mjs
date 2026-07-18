#!/usr/bin/env node
/** Fail if any app JS file fails node --check (syntax). */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');

function listJs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJs(p));
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = listJs(APP).filter((f) => !f.endsWith(`${path.sep}secrets.local.js`));
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed += 1;
    console.error(`syntax error: ${path.relative(ROOT, file)}`);
    if (r.stderr) console.error(r.stderr.trim());
  }
}
if (failed) {
  console.error(`\n${failed} file(s) failed node --check`);
  process.exit(1);
}
console.log(`OK: node --check passed for ${files.length} app JS files`);
