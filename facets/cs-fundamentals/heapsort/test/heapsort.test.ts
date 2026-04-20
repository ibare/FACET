// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { heapsort, registerHeapsort, heapsortFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('HeapSort 알고리즘', () => {
  it('퍼즐 배열 정렬', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [5, 2, 8, 1, 9, 3, 7, 4],
    };
    await heapsort({ data, cancelled: false, async emit() {}, metric() {} });
    expect(data.values).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
  });

  it('역정렬 입력', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [9, 7, 5, 3, 1],
    };
    await heapsort({ data, cancelled: false, async emit() {}, metric() {} });
    expect(data.values).toEqual([1, 3, 5, 7, 9]);
  });

  it('단일/빈', async () => {
    const single: { type: 'array'; values: number[] } = { type: 'array', values: [42] };
    await heapsort({ data: single, cancelled: false, async emit() {}, metric() {} });
    expect(single.values).toEqual([42]);

    const empty: { type: 'array'; values: number[] } = { type: 'array', values: [] };
    await heapsort({ data: empty, cancelled: false, async emit() {}, metric() {} });
    expect(empty.values).toEqual([]);
  });
});

describe('HeapSort facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerHeapsort();
  });

  it('마운트 + 정렬', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(heapsortFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(8);
    handle.setSpeed(40);
    handle.start();
    await delay(2500);
    const labels = [...mount.querySelectorAll('.facet-bar-chart text')].map((t) => Number(t.textContent));
    expect(labels).toEqual([...labels].sort((a, b) => a - b));
    handle.destroy();
  });
});
