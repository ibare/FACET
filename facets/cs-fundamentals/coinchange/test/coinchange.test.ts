// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { coinchange, registerCoinchange, coinchangeFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('CoinChange 알고리즘', () => {
  it('US 25/10/5/1 — 47 = 5개', async () => {
    const r = await coinchange({
      data: { type: 'coins', amount: 47, coins: [25, 10, 5, 1] },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(5);
  });

  it('정확히 한 동전', async () => {
    const r = await coinchange({
      data: { type: 'coins', amount: 25, coins: [25, 10, 5, 1] },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(1);
  });

  it('amount=0', async () => {
    const r = await coinchange({
      data: { type: 'coins', amount: 0, coins: [25, 10, 5, 1] },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(0);
  });

  it('비-canonical {1,3,4} — 6 = 그리디 3개 (DP 정답은 2)', async () => {
    const r = await coinchange({
      data: { type: 'coins', amount: 6, coins: [1, 3, 4] },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(3);
  });
});

describe('CoinChange facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerCoinchange();
  });

  it('마운트 + 실행', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(coinchangeFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(4);
    handle.setSpeed(40);
    handle.start();
    await delay(2000);
    handle.destroy();
  });
});
