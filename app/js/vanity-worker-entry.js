/**
 * Vanity worker source — bundle to vanity-worker.js via:
 *   npx esbuild staging/app/js/vanity-worker-entry.js --bundle --outfile=staging/app/js/vanity-worker.js --platform=browser --format=esm
 */
import { getPublicKey, utils } from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha2';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BATCH = 800;
const PROGRESS_EVERY = 4;
let running = false;

function base58Encode(bytes) {
  if (!bytes?.length) return '';
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out = BASE58[0] + out;
  return out;
}

function tronAddressFromPrivateKey(priv) {
  const pub = getPublicKey(priv, false);
  const hash = keccak_256(pub.subarray(1));
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(hash.subarray(12), 1);
  const cks = sha256(sha256(payload));
  const full = new Uint8Array(25);
  full.set(payload, 0);
  full.set(cks.subarray(0, 4), 21);
  return base58Encode(full);
}

function privToHex(priv) {
  let hex = '';
  for (let i = 0; i < priv.length; i++) hex += priv[i].toString(16).padStart(2, '0');
  return hex;
}

function buildMatcher(pattern, mode, caseSensitive, prefix, suffix) {
  const raw = String(pattern || '').trim();
  let p = caseSensitive ? raw : raw.toLowerCase();
  if (mode === 'both') {
    let pre = caseSensitive ? String(prefix || '').trim() : String(prefix || '').trim().toLowerCase();
    let suf = caseSensitive ? String(suffix || '').trim() : String(suffix || '').trim().toLowerCase();
    if (pre && !pre.startsWith('T') && !pre.startsWith('t')) {
      pre = (caseSensitive ? 'T' : 't') + pre;
    }
    return (addr) => {
      const a = caseSensitive ? addr : addr.toLowerCase();
      return !!pre && !!suf && a.startsWith(pre) && a.endsWith(suf);
    };
  }
  if (mode === 'prefix' && p && !p.startsWith('T') && !p.startsWith('t')) {
    p = (caseSensitive ? 'T' : 't') + p;
  }
  if (mode === 'prefix') {
    return (addr) => (caseSensitive ? addr : addr.toLowerCase()).startsWith(p);
  }
  if (mode === 'suffix') {
    return (addr) => (caseSensitive ? addr : addr.toLowerCase()).endsWith(p);
  }
  return (addr) => (caseSensitive ? addr : addr.toLowerCase()).includes(p);
}

function searchLoop(config) {
  const { pattern, mode, caseSensitive, prefix, suffix, workerId } = config;
  const match = buildMatcher(pattern, mode, caseSensitive, prefix, suffix);
  let batchAttempts = 0;
  let batchesSinceProgress = 0;

  try {
    while (running) {
      for (let i = 0; i < BATCH; i++) {
        const priv = utils.randomPrivateKey();
        const addr = tronAddressFromPrivateKey(priv);
        batchAttempts++;
        if (match(addr)) {
          running = false;
          self.postMessage({
            type: 'found',
            workerId,
            address: addr,
            privateKey: privToHex(priv),
            attempts: batchAttempts,
          });
          return;
        }
      }
      if (!running) break;
      batchesSinceProgress++;
      if (batchesSinceProgress >= PROGRESS_EVERY) {
        self.postMessage({ type: 'progress', workerId, attempts: batchAttempts });
        batchAttempts = 0;
        batchesSinceProgress = 0;
      }
    }
    if (batchAttempts > 0) {
      self.postMessage({ type: 'progress', workerId, attempts: batchAttempts });
    }
  } catch (err) {
    running = false;
    self.postMessage({
      type: 'error',
      workerId,
      message: err?.message || String(err),
    });
    return;
  }
  self.postMessage({ type: 'stopped', workerId });
}

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'stop') {
    running = false;
    return;
  }
  if (msg.type === 'start') {
    running = true;
    searchLoop(msg);
  }
};
