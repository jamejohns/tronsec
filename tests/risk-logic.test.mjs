import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRiskApi } from './harness.mjs';

const api = loadRiskApi();

const SELF = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
const EXT = 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7';

describe('riskShieldTier', () => {
  it('maps score bands (red ≥70, amber ≥20)', () => {
    assert.equal(api.riskShieldTier(0, false), 'low');
    assert.equal(api.riskShieldTier(19, false), 'low');
    assert.equal(api.riskShieldTier(20, false), 'med');
    assert.equal(api.riskShieldTier(69, false), 'med');
    assert.equal(api.riskShieldTier(70, false), 'high');
  });

  it('treats flagged as at least high-tier score', () => {
    assert.equal(api.riskShieldTier(5, true), 'high');
  });
});

describe('isValidTron / dust helpers', () => {
  it('validates base58 TRON addresses', () => {
    assert.equal(api.isValidTron(SELF), true);
    assert.equal(api.isValidTron('0xabc'), false);
    assert.equal(api.isValidTron(''), false);
  });

  it('flags micro TRX (≤1 TRX in sun)', () => {
    assert.equal(api.isMicroTrxSun(1), true);
    assert.equal(api.isMicroTrxSun(1_000_000), true);
    assert.equal(api.isMicroTrxSun(1_000_001), false);
    assert.equal(api.isMicroTrxSun(0), false);
  });

  it('detects dust-bot sender profiles', () => {
    assert.equal(
      api.isDustBotProfile({ out: 100, inn: 10, balance: 1_000_000 }),
      true,
    );
    assert.equal(
      api.isDustBotProfile({ out: 10, inn: 10, balance: 50_000_000 }),
      false,
    );
  });
});

describe('isWalletJunkToken', () => {
  it('keeps priced normal symbols', () => {
    assert.equal(api.isWalletJunkToken({ symbol: 'USDT', name: 'Tether', priceInUsd: 1 }), false);
  });

  it('hides spam-like labels and zero-price tokens', () => {
    assert.equal(api.isWalletJunkToken({ symbol: 'CLAIM', name: 'Visit www.scam.com', priceInUsd: 0.01 }), true);
    assert.equal(api.isWalletJunkToken({ symbol: 'XYZ', name: 'Token', priceInUsd: 0 }), true);
  });
});

describe('classifyPermissionKeys / analyzeAccountPermissions', () => {
  it('marks solo external owner keys as risky', () => {
    const keys = [{ address: EXT, weight: 1 }];
    const cls = api.classifyPermissionKeys(keys, SELF, 1, {});
    assert.equal(cls.soloExternal.length, 1);
    assert.ok(cls.riskyAddresses.has(EXT));
  });

  it('does not treat self key as external risk', () => {
    const keys = [{ address: SELF, weight: 1 }];
    const cls = api.classifyPermissionKeys(keys, SELF, 1, {});
    assert.equal(cls.external.length, 0);
    assert.equal(cls.soloExternal.length, 0);
  });

  it('raises danger when external can act alone on Owner', () => {
    const owner = { threshold: 1, keys: [{ address: EXT, weight: 1 }] };
    const analysis = api.analyzeAccountPermissions(SELF, owner, [], null, {});
    assert.equal(analysis.level, 'danger');
    assert.ok(analysis.findings.some((f) => f.lvl === 'danger'));
  });

  it('scores external signers above zero', () => {
    const owner = { threshold: 1, keys: [{ address: EXT, weight: 1 }] };
    const analysis = api.analyzeAccountPermissions(SELF, owner, [], null, {});
    const stats = api.permissionStats(SELF, owner, [], null, {});
    const score = api.computePermissionRiskScore(analysis, stats);
    assert.ok(score >= 35);
  });
});

describe('analyzeContractAbi / buildContractRisks', () => {
  it('detects TRC20 surface', () => {
    const abi = ['transfer', 'balanceOf', 'totalSupply', 'approve', 'transferFrom', 'allowance'].map(
      (name) => ({ type: 'Function', name }),
    );
    assert.equal(api.detectContractStandard(abi), 'TRC20');
  });

  it('flags mint / blacklist / selfdestruct', () => {
    const flags = api.analyzeContractAbi([
      { type: 'Function', name: 'mint' },
      { type: 'Function', name: 'addBlackList' },
      { type: 'Function', name: 'selfdestruct' },
    ]);
    assert.equal(flags.hasMint, true);
    assert.equal(flags.hasBlack, true);
    assert.equal(flags.hasDestroy, true);
  });

  it('emits danger risks for unaudited destroy + blacklist', () => {
    const flags = api.analyzeContractAbi([
      { type: 'Function', name: 'selfdestruct' },
      { type: 'Function', name: 'blacklist' },
    ]);
    const risks = api.buildContractRisks(flags, {
      official: null,
      verified: false,
      hasAbi: true,
      standard: null,
      secToken: null,
      fraudTags: [],
    });
    const cats = risks.map((r) => r.cat);
    assert.ok(cats.includes('Rug risk'));
    assert.ok(cats.includes('Censorship'));
  });

  it('softens issuer blacklist to compliance info', () => {
    const flags = api.analyzeContractAbi([{ type: 'Function', name: 'addBlackList' }]);
    const risks = api.buildContractRisks(flags, {
      official: { tier: 'issuer', symbol: 'USDT' },
      verified: true,
      hasAbi: true,
      standard: 'TRC20',
      secToken: null,
      fraudTags: [],
    });
    assert.ok(risks.some((r) => r.cat === 'Compliance' && r.lvl === 'info'));
    assert.ok(!risks.some((r) => r.cat === 'Censorship' && r.lvl === 'danger'));
  });
});

describe('computeAmlActivityScore', () => {
  it('returns insufficient with empty history', () => {
    const r = api.computeAmlActivityScore({
      dtCount: 0,
      txCount: 0,
      ageDays: null,
      concentration: 0,
      uniquePeers: 0,
    });
    assert.equal(r.status, 'insufficient');
    assert.equal(r.finalScore, 0);
  });

  it('scores young high-volume concentrated wallets higher', () => {
    const r = api.computeAmlActivityScore({
      dtCount: 60,
      txCount: 80,
      ageDays: 3,
      concentration: 0.85,
      uniquePeers: 5,
      inboundCount: 50,
      outboundCount: 10,
    });
    assert.ok(r.finalScore >= 40);
    assert.equal(r.status, 'unusual');
  });

  it('marks hard-flagged wallets as flagged', () => {
    const r = api.computeAmlActivityScore({
      dtCount: 5,
      txCount: 5,
      ageDays: 100,
      concentration: 0.1,
      uniquePeers: 5,
      hardFlags: ['Mixer interaction'],
      isFlagged: true,
    });
    assert.equal(r.status, 'flagged');
    assert.equal(r.hasHardSignals, true);
  });

  it('keeps a diversified older wallet cleaner', () => {
    const r = api.computeAmlActivityScore({
      dtCount: 8,
      txCount: 20,
      ageDays: 400,
      concentration: 0.2,
      uniquePeers: 8,
      inboundCount: 4,
      outboundCount: 4,
      knownEntityCount: 2,
    });
    assert.ok(r.finalScore < 40);
    assert.equal(r.status, 'clean');
  });
});

describe('claim+multicall drain pattern', () => {
  it('flags claim + multicall on non-standard contracts', () => {
    const flags = api.analyzeContractAbi([
      { type: 'Function', name: 'claim' },
      { type: 'Function', name: 'multicall' },
      { type: 'Function', name: 'changeOwner' },
    ]);
    const risks = api.buildContractRisks(flags, {
      official: null,
      verified: false,
      hasAbi: true,
      standard: null,
      secToken: null,
      fraudTags: [],
    });
    assert.ok(risks.some((r) => /drain|scam|claim/i.test(r.cat + r.msg)));
  });
});
