// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { linearsearch, registerLinearsearch, linearsearchFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('LinearSearch 알고리즘', () => {
  it('찾으면 인덱스 반환', async () => {
    const data: LinearSearchData = { type: 'array', values: [5, 2, 8, 1, 9, 3], target: 9 };
    const r = await linearsearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(4);
  });

  it('없으면 -1', async () => {
    const data: LinearSearchData = { type: 'array', values: [5, 2, 8], target: 99 };
    const r = await linearsearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(-1);
  });

  it('빈 배열', async () => {
    const data: LinearSearchData = { type: 'array', values: [], target: 1 };
    const r = await linearsearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(-1);
  });
});

describe('LinearSearch facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerLinearsearch();
  });

  it('마운트 + 실행', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(linearsearchFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(8);
    handle.setSpeed(40);
    handle.start();
    await delay(2500);
    handle.destroy();
  });
});

import type { LinearSearchData } from '../src/index.js';
