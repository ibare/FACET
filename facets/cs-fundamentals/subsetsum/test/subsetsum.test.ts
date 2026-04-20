// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { subsetsum, registerSubsetsum, subsetsumFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('SubsetSum 알고리즘', () => {
  it('찾을 수 있는 케이스', async () => {
    const r = await subsetsum({
      data: { type: 'subsetsum', values: [3, 7, 1, 8, 4, 2], target: 13 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).not.toBeNull();
    if (r) {
      const sum = r.reduce((s, i) => s + [3, 7, 1, 8, 4, 2][i], 0);
      expect(sum).toBe(13);
    }
  });

  it('정확히 단일 요소', async () => {
    const r = await subsetsum({
      data: { type: 'subsetsum', values: [3, 5, 7], target: 7 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).not.toBeNull();
  });

  it('빈 부분집합 (target=0)', async () => {
    const r = await subsetsum({
      data: { type: 'subsetsum', values: [1, 2, 3], target: 0 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toEqual([]);
  });

  it('찾을 수 없는 케이스', async () => {
    const r = await subsetsum({
      data: { type: 'subsetsum', values: [1, 2, 3], target: 100 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBeNull();
  });
});

describe('SubsetSum facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerSubsetsum();
  });

  it('마운트 + 실행', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(subsetsumFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(6);
    handle.setSpeed(40);
    handle.start();
    await delay(2500);
    handle.destroy();
  });
});
