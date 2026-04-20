// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { selectionsort, registerSelectionsort, selectionsortFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('SelectionSort 알고리즘 자체', () => {
  it('퍼즐 배열을 올바르게 정렬', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [5, 2, 8, 1, 9, 3, 7, 4],
    };
    await selectionsort({ data, cancelled: false, async emit() {}, metric() {} });
    expect(data.values).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
  });

  it('역정렬 입력', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [5, 4, 3, 2, 1],
    };
    await selectionsort({ data, cancelled: false, async emit() {}, metric() {} });
    expect(data.values).toEqual([1, 2, 3, 4, 5]);
  });

  it('단일/빈 배열', async () => {
    const single: { type: 'array'; values: number[] } = { type: 'array', values: [42] };
    await selectionsort({ data: single, cancelled: false, async emit() {}, metric() {} });
    expect(single.values).toEqual([42]);

    const empty: { type: 'array'; values: number[] } = { type: 'array', values: [] };
    await selectionsort({ data: empty, cancelled: false, async emit() {}, metric() {} });
    expect(empty.values).toEqual([]);
  });
});

describe('SelectionSort facet — 4-layer 통합', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerSelectionsort();
  });

  it('레지스트리 + 마운트 시 8개 막대', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(selectionsortFacet, mount);
    expect(mount.querySelector('.facet-bar-chart')).toBeTruthy();
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(8);
    handle.destroy();
  });

  it('재생 → 정렬 완료 시 메트릭 증가, 막대 오름차순', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(selectionsortFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(2500);
    const compare = mount.querySelector('.facet-control-bar__metric--compare-count span:last-child')?.textContent;
    expect(Number(compare)).toBeGreaterThan(0);

    const labels = [...mount.querySelectorAll('.facet-bar-chart text')].map((t) => Number(t.textContent));
    const sorted = [...labels].sort((a, b) => a - b);
    expect(labels).toEqual(sorted);

    handle.destroy();
  });
});
