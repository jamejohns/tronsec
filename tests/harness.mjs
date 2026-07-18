/**
 * Load TRONSEC app scripts in Node (vm) for unit tests.
 * Mocks minimal browser APIs — no network, no DOM UI.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function stubEl() {
  return {
    addEventListener() {},
    removeEventListener() {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
    style: {},
    dataset: {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    removeAttribute() {},
    appendChild() {
      return null;
    },
    remove() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    insertAdjacentHTML() {},
    focus() {},
    blur() {},
    click() {},
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    checked: false,
  };
}

function createSandbox() {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    atob,
    btoa,
    TextEncoder,
    TextDecoder,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Math,
    JSON,
    Date,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Uint8Array,
    Uint8ClampedArray,
    ArrayBuffer,
    BigInt,
    Proxy,
    Reflect,
    Symbol,
    fetch: async () => ({
      ok: false,
      status: 0,
      json: async () => ({}),
      text: async () => '',
      headers: { get: () => null },
    }),
    Worker: class {
      postMessage() {}
      terminate() {}
      addEventListener() {}
    },
    crypto: {
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = (i * 17 + 3) & 255;
        return a;
      },
      subtle: {},
    },
    performance: { now: () => Date.now() },
    Path2D: class {
      constructor() {}
    },
    Image: class {},
    OffscreenCanvas: class {
      getContext() {
        return {
          fillRect() {},
          drawImage() {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        };
      }
    },
  };

  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.global = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  sandbox.location = {
    pathname: '/app/',
    href: 'http://localhost/app/',
    origin: 'http://localhost',
    search: '',
    hash: '',
    protocol: 'http:',
  };
  sandbox.document = {
    getElementById: () => stubEl(),
    querySelector: () => stubEl(),
    querySelectorAll: () => [],
    createElement: () => stubEl(),
    createTextNode: () => stubEl(),
    body: stubEl(),
    documentElement: stubEl(),
    head: stubEl(),
    addEventListener() {},
    removeEventListener() {},
    readyState: 'complete',
  };
  sandbox.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
    clear() {},
  };
  sandbox.sessionStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
    clear() {},
  };
  sandbox.navigator = {
    userAgent: 'node',
    language: 'en',
    clipboard: { writeText: async () => {} },
    onLine: true,
  };
  sandbox.TRONSEC_KEYS = {};
  sandbox.GLOSSARY = { concentration: { lbl: 'Concentration' } };
  sandbox.t = (s, vars) =>
    !vars ? s : String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  sandbox.lucide = { createIcons() {} };
  sandbox.d3 = {
    select: () => ({
      selectAll: () => ({
        data: () => ({ join: () => ({}) }),
        remove() {},
      }),
      append: () => ({ attr: () => ({}) }),
      remove() {},
    }),
  };
  sandbox.QRCode = function QRCode() {};
  sandbox.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
  sandbox.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  sandbox.cancelAnimationFrame = clearTimeout;
  sandbox.HTMLElement = class HTMLElement {};
  sandbox.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      Object.assign(this, init || {});
    }
  };
  sandbox.Event = class Event {
    constructor(type) {
      this.type = type;
    }
  };
  sandbox.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  sandbox.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  sandbox.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  sandbox.history = { pushState() {}, replaceState() {} };
  sandbox.alert = () => {};
  sandbox.confirm = () => false;
  sandbox.scrollTo = () => {};
  sandbox.getComputedStyle = () => new Proxy({}, { get: () => '' });

  vm.createContext(sandbox);
  return sandbox;
}

const DEFAULT_SCRIPTS = [
  'app/js/secrets.js',
  'app/js/proxy-config.js',
  'app/js/api-proxy.js',
  'app/js/i18n.js',
  'assets/js/i18n-locales.js',
  'assets/js/contract-i18n.js',
  'app/js/brand.js',
  'app/app-tron.js',
  'app/js/shared.js',
  'app/js/wallet.js',
  'app/js/aml.js',
  'app/js/contract.js',
  'app/js/permissions.js',
];

let cachedApi = null;

/** Load app once and expose pure risk helpers for tests. */
export function loadRiskApi() {
  if (cachedApi) return cachedApi;

  const sandbox = createSandbox();
  for (const rel of DEFAULT_SCRIPTS) {
    const abs = path.join(ROOT, rel);
    const code = fs.readFileSync(abs, 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
  }

  cachedApi = vm.runInContext(
    `({
      riskShieldTier,
      isMicroTrxSun,
      isDustBotProfile,
      classifyPermissionKeys,
      isWalletJunkToken,
      analyzeContractAbi,
      detectContractStandard,
      computeAmlActivityScore,
      analyzeAccountPermissions,
      computePermissionRiskScore,
      isValidTron,
      permissionStats,
      buildContractRisks,
      sameTronAddr,
    })`,
    sandbox,
  );
  return cachedApi;
}

export { ROOT };
