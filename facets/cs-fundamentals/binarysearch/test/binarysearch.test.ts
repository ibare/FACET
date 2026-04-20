// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { binarysearch, registerBinarysearch, binarysearchFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('BinarySearch 알고리즘', () => {
  it('중간값 찾기', async () => {
    const data: BinarySearchData = { type: 'array', values: [1, 3, 5, 7, 9, 11, 13, 15], target: 7 };
    const r = await binarysearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(3);
  });

  it('첫 요소 찾기', async () => {
    const data: BinarySearchData = { type: 'array', values: [1, 3, 5, 7, 9], target: 1 };
    const r = await binarysearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(0);
  });

  it('마지막 요소 찾기', async () => {
    const data: BinarySearchData = { type: 'array', values: [1, 3, 5, 7, 9], target: 9 };
    const r = await binarysearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(4);
  });

  it('없으면 -1', async () => {
    const data: BinarySearchData = { type: 'array', values: [1, 3, 5, 7, 9], target: 6 };
    const r = await binarysearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(-1);
  });

  it('빈 배열', async () => {
    const data: BinarySearchData = { type: 'array', values: [], target: 1 };
    const r = await binarysearch({ data, cancelled: false, async emit() {}, metric() {} });
    expect(r).toBe(-1);
  });
});

describe('BinarySearch facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerBinarysearch();
  });

  it('마운트 + 실행', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(binarysearchFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(8);
    handle.setSpeed(40);
    handle.start();
    await delay(2000);
    handle.destroy();
  });
});

import type { BinarySearchData } from '../src/index.js';
