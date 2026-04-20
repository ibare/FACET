// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import {
  interpolationsearch,
  registerInterpolationsearch,
  interpolationsearchFacet,
} from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('InterpolationSearch 알고리즘', () => {
  it('균등 분포에서 찾기', async () => {
    const data: InterpolationSearchData = {
      type: 'array',
      values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      target: 70,
    };
    const r = await interpolationsearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(6);
  });

  it('첫 요소', async () => {
    const data: InterpolationSearchData = {
      type: 'array',
      values: [10, 20, 30, 40, 50],
      target: 10,
    };
    const r = await interpolationsearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(0);
  });

  it('범위 밖 → -1', async () => {
    const data: InterpolationSearchData = {
      type: 'array',
      values: [10, 20, 30, 40, 50],
      target: 100,
    };
    const r = await interpolationsearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(-1);
  });

  it('없는 값 → -1', async () => {
    const data: InterpolationSearchData = {
      type: 'array',
      values: [10, 20, 30, 40, 50],
      target: 25,
    };
    const r = await interpolationsearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(-1);
  });

  it('빈 배열', async () => {
    const data: InterpolationSearchData = { type: 'array', values: [], target: 1 };
    const r = await interpolationsearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(-1);
  });
});

describe('InterpolationSearch facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerInterpolationsearch();
  });

  it('마운트 + 실행', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(interpolationsearchFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(10);
    handle.setSpeed(40);
    handle.start();
    await delay(2000);
    handle.destroy();
  });
});

import type { InterpolationSearchData } from '../src/index.js';
