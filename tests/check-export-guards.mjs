#!/usr/bin/env node
/**
 * Export guards for the public repo:
 * - no obfuscated app JS
 * - no secrets.local.js
 * - no oversized single-line bundles
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
const MAX_LINE = 12_000;

const OBF_HEAD = /(?:^|\n)(?:const|function)\s+_0x[0-9a-fA-F]+/;

function walk(dir, pred) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p, pred));
    else if (ent.isFile() && pred(p)) out.push(p);
  }
  return out;
}

const issues = [];

const secretsLocal = path.join(APP, 'js', 'secrets.local.js');
if (fs.existsSync(secretsLocal)) {
  issues.push('app/js/secrets.local.js must not be committed');
}

const jsFiles = walk(APP, (p) => p.endsWith('.js') && !p.endsWith(`${path.sep}secrets.local.js`));
for (const file of jsFiles) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, 'utf8');
  if (OBF_HEAD.test(text.slice(0, 4000))) {
    issues.push(`${rel}: looks obfuscated (_0x…)`);
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length >= MAX_LINE) {
      issues.push(`${rel}: oversized line ${i + 1} (${lines[i].length} chars)`);
      break;
    }
  }
}

if (issues.length) {
  console.error('Export guard failed:');
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}

console.log(`OK: export guards passed (${jsFiles.length} JS files scanned)`);
