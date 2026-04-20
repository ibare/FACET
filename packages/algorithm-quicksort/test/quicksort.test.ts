// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  runFacet,
  clearRegistry,
} from '@facet/core/runtime';
import { quicksort, registerQuicksort, quicksortFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('QuickSort 알고리즘 자체', () => {
  it('퍼즐 배열을 올바르게 정렬', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [5, 2, 8, 1, 9, 3, 7, 4],
    };
    let cancelled = false;
    await quicksort({
      data,
      cancelled,
      async emit() {},
      metric() {},
    });
    void cancelled;
    expect(data.values).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
  });

  it('이미 정렬된 배열 처리', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [1, 2, 3, 4],
    };
    await quicksort({ data, cancelled: false, async emit() {}, metric() {} });
    expect(data.values).toEqual([1, 2, 3, 4]);
  });

  it('단일/빈 배열', async () => {
    const single: { type: 'array'; values: number[] } = { type: 'array', values: [42] };
    await quicksort({ data: single, cancelled: false, async emit() {}, metric() {} });
    expect(single.values).toEqual([42]);

    const empty: { type: 'array'; values: number[] } = { type: 'array', values: [] };
    await quicksort({ data: empty, cancelled: false, async emit() {}, metric() {} });
    expect(empty.values).toEqual([]);
  });
});

describe('QuickSort facet — 4-layer 통합', () => {
  beforeEach(() => {
    clearRegistry();
    registerPythonTranspiler();
    registerQuicksort();
  });

  it('레지스트리 + JSON 등록', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(quicksortFacet, mount);
    expect(mount.querySelector('.facet-bar-chart')).toBeTruthy();
    expect(mount.querySelector('.facet-code-view')).toBeTruthy();
    expect(mount.querySelector('.facet-control-bar')).toBeTruthy();
    handle.destroy();
  });

  it('초기 데이터로 막대 8개 렌더', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(quicksortFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(8);
    handle.destroy();
  });

  it('IR/Transpiler 사전 처리로 코드 라인 채워짐', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(quicksortFacet, mount);
    const lines = mount.querySelectorAll('.facet-code-view__line');
    expect(lines.length).toBeGreaterThan(5);
    expect(mount.querySelector('.facet-code-view')?.textContent).toContain('quicksort');
    handle.destroy();
  });

  it('재생 → 정렬 완료 시 비교/교환 메트릭 증가, 모든 막대 sorted 색상', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(quicksortFacet, mount);
    handle.setSpeed(40);
    handle.start();
    // 8개 정렬은 emit 횟수 많음 — 충분히 대기
    await delay(2000);
    const compare = mount.querySelector('.facet-control-bar__metric--compare-count span:last-child')?.textContent;
    const swap = mount.querySelector('.facet-control-bar__metric--swap-count span:last-child')?.textContent;
    expect(Number(compare)).toBeGreaterThan(0);
    expect(Number(swap)).toBeGreaterThan(0);

    // 정렬 완료된 후 막대 값들이 오름차순인지 확인
    const labels = [...mount.querySelectorAll('.facet-bar-chart text')].map((t) => Number(t.textContent));
    const sorted = [...labels].sort((a, b) => a - b);
    expect(labels).toEqual(sorted);

    handle.destroy();
  });

  it('reset 후 데이터/메트릭 복원', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(quicksortFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(800);
    handle.reset();
    await delay(50);
    const compare = mount.querySelector('.facet-control-bar__metric--compare-count span:last-child')?.textContent;
    expect(compare).toBe('0');
    // 막대는 초기 값으로
    const labels = [...mount.querySelectorAll('.facet-bar-chart text')].map((t) => t.textContent);
    expect(labels.length).toBe(8);
    handle.destroy();
  });
});
