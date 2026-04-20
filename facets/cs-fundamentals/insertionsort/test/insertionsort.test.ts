// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { insertionsort, registerInsertionsort, insertionsortFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('InsertionSort 알고리즘 자체', () => {
  it('퍼즐 배열을 올바르게 정렬', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [5, 2, 8, 1, 9, 3, 7, 4],
    };
    await insertionsort({ data, cancelled: false, async emit() {}, metric() {} });
    expect(data.values).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
  });

  it('이미 정렬된 입력은 비교만, 이동 없음', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [1, 2, 3, 4],
    };
    let shifts = 0;
    await insertionsort({
      data,
      cancelled: false,
      async emit() {},
      metric(name) {
        if (name === 'shift-count') shifts++;
      },
    });
    expect(data.values).toEqual([1, 2, 3, 4]);
    expect(shifts).toBe(0);
  });

  it('단일/빈 배열', async () => {
    const single: { type: 'array'; values: number[] } = { type: 'array', values: [42] };
    await insertionsort({ data: single, cancelled: false, async emit() {}, metric() {} });
    expect(single.values).toEqual([42]);

    const empty: { type: 'array'; values: number[] } = { type: 'array', values: [] };
    await insertionsort({ data: empty, cancelled: false, async emit() {}, metric() {} });
    expect(empty.values).toEqual([]);
  });
});

describe('InsertionSort facet — 4-layer 통합', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerInsertionsort();
  });

  it('마운트 + 정렬 완료', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(insertionsortFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(8);
    handle.setSpeed(40);
    handle.start();
    await delay(2500);
    const labels = [...mount.querySelectorAll('.facet-bar-chart text')].map((t) => Number(t.textContent));
    expect(labels).toEqual([...labels].sort((a, b) => a - b));
    handle.destroy();
  });
});
