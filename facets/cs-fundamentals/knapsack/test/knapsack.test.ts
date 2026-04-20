// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { knapsack, registerKnapsack, knapsackFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('Knapsack 알고리즘', () => {
  it('표준 케이스', async () => {
    // values=[60,100,120,80,30], weights=[10,20,30,15,5], cap=50
    // 최적: 60+100+80+30 = 270 (무게 10+20+15+5 = 50)
    const r = await knapsack({
      data: {
        type: 'knapsack',
        values: [60, 100, 120, 80, 30],
        weights: [10, 20, 30, 15, 5],
        capacity: 50,
      },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r.value).toBe(270);
  });

  it('전부 다 들어감', async () => {
    const r = await knapsack({
      data: {
        type: 'knapsack',
        values: [10, 20, 30],
        weights: [1, 2, 3],
        capacity: 100,
      },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r.value).toBe(60);
    expect(r.picks.sort()).toEqual([0, 1, 2]);
  });

  it('아무것도 못 들어감 (capacity=0)', async () => {
    const r = await knapsack({
      data: {
        type: 'knapsack',
        values: [10, 20],
        weights: [1, 2],
        capacity: 0,
      },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r.value).toBe(0);
    expect(r.picks).toEqual([]);
  });

  it('단일 아이템', async () => {
    const r = await knapsack({
      data: {
        type: 'knapsack',
        values: [50],
        weights: [10],
        capacity: 20,
      },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r.value).toBe(50);
    expect(r.picks).toEqual([0]);
  });
});

describe('Knapsack facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerKnapsack();
  });

  it('마운트 + 실행', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(knapsackFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(5);
    handle.setSpeed(40);
    handle.start();
    await delay(2500);
    handle.destroy();
  });
});
