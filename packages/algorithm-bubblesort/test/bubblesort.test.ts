// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { bubblesort, registerBubblesort, bubblesortFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('BubbleSort 알고리즘 자체', () => {
  it('퍼즐 배열을 올바르게 정렬', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [5, 2, 8, 1, 9, 3, 7, 4],
    };
    await bubblesort({ data, cancelled: false, async emit() {}, metric() {} });
    expect(data.values).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
  });

  it('이미 정렬된 배열은 early-exit', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [1, 2, 3, 4],
    };
    let compares = 0;
    await bubblesort({
      data,
      cancelled: false,
      async emit() {},
      metric(name) {
        if (name === 'compare-count') compares++;
      },
    });
    expect(data.values).toEqual([1, 2, 3, 4]);
    // 한 패스(=3 비교) 후 early-exit
    expect(compares).toBe(3);
  });

  it('단일/빈 배열', async () => {
    const single: { type: 'array'; values: number[] } = { type: 'array', values: [42] };
    await bubblesort({ data: single, cancelled: false, async emit() {}, metric() {} });
    expect(single.values).toEqual([42]);

    const empty: { type: 'array'; values: number[] } = { type: 'array', values: [] };
    await bubblesort({ data: empty, cancelled: false, async emit() {}, metric() {} });
    expect(empty.values).toEqual([]);
  });
});

describe('BubbleSort facet — 4-layer 통합', () => {
  beforeEach(() => {
    clearRegistry();
    registerPythonTranspiler();
    registerBubblesort();
  });

  it('레지스트리 + 마운트 시 8개 막대', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(bubblesortFacet, mount);
    expect(mount.querySelector('.facet-bar-chart')).toBeTruthy();
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(8);
    expect(mount.querySelector('.facet-code-view')?.textContent).toContain('bubblesort');
    handle.destroy();
  });

  it('재생 → 정렬 완료 시 비교/교환 메트릭 증가, 막대 오름차순', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(bubblesortFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(2500);
    const compare = mount.querySelector('.facet-control-bar__metric--compare-count span:last-child')?.textContent;
    const swap = mount.querySelector('.facet-control-bar__metric--swap-count span:last-child')?.textContent;
    expect(Number(compare)).toBeGreaterThan(0);
    expect(Number(swap)).toBeGreaterThan(0);

    const labels = [...mount.querySelectorAll('.facet-bar-chart text')].map((t) => Number(t.textContent));
    const sorted = [...labels].sort((a, b) => a - b);
    expect(labels).toEqual(sorted);

    handle.destroy();
  });

  it('reset 후 메트릭 0', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(bubblesortFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(800);
    handle.reset();
    await delay(50);
    const compare = mount.querySelector('.facet-control-bar__metric--compare-count span:last-child')?.textContent;
    expect(compare).toBe('0');
    handle.destroy();
  });
});
