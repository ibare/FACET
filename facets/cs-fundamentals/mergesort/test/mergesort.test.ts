// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { mergesort, registerMergesort, mergesortFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('MergeSort 알고리즘 자체', () => {
  it('퍼즐 배열을 올바르게 정렬', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [5, 2, 8, 1, 9, 3, 7, 4],
    };
    await mergesort({ data, cancelled: false, async emit() {}, metric() {} });
    expect(data.values).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
  });

  it('홀수 길이', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [3, 1, 4, 1, 5, 9, 2, 6, 5],
    };
    await mergesort({ data, cancelled: false, async emit() {}, metric() {} });
    expect(data.values).toEqual([1, 1, 2, 3, 4, 5, 5, 6, 9]);
  });

  it('단일/빈 배열', async () => {
    const single: { type: 'array'; values: number[] } = { type: 'array', values: [42] };
    await mergesort({ data: single, cancelled: false, async emit() {}, metric() {} });
    expect(single.values).toEqual([42]);

    const empty: { type: 'array'; values: number[] } = { type: 'array', values: [] };
    await mergesort({ data: empty, cancelled: false, async emit() {}, metric() {} });
    expect(empty.values).toEqual([]);
  });
});

describe('MergeSort facet — 4-layer 통합', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerMergesort();
  });

  it('마운트 + 정렬 완료', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(mergesortFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(8);
    handle.setSpeed(40);
    handle.start();
    await delay(2500);
    const labels = [...mount.querySelectorAll('.facet-bar-chart text')].map((t) => Number(t.textContent));
    expect(labels).toEqual([...labels].sort((a, b) => a - b));
    handle.destroy();
  });
});
