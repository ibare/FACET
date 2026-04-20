// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import {
  bubblesort,
  computeBubblesortResult,
  registerBubblesort,
  bubblesortFacet,
} from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

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

  it('computeBubblesortResult 는 정렬된 사본을 반환 (원본 불변)', () => {
    const initial = { type: 'array' as const, values: [5, 2, 8, 1, 9, 3, 7, 4] };
    const result = computeBubblesortResult(initial);
    expect(result.values).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
    expect(initial.values).toEqual([5, 2, 8, 1, 9, 3, 7, 4]);
  });

  it('rising-move / pass-begin / pass-end / settle 이벤트를 emit 한다', async () => {
    const data = { type: 'array' as const, values: [3, 1, 2] };
    const types: string[] = [];
    await bubblesort({
      data,
      cancelled: false,
      async emit(e) {
        types.push(e.type);
      },
      metric() {},
    });
    expect(types).toContain('pass-begin');
    expect(types).toContain('pass-end');
    expect(types).toContain('rising-move');
    expect(types).toContain('settle');
    expect(types[types.length - 1]).toBe('done');
  });
});

describe('BubbleSort facet — 다중 뷰 통합', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerBubblesort();
  });

  it('레지스트리 + 마운트: stage(8 막대) + start/goal preview + passTracker + snapshotStrip', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(bubblesortFacet, mount);

    expect(mount.querySelector('.facet-bar-chart')).toBeTruthy();
    expect(mount.querySelectorAll('.facet-bar-chart__bars rect').length).toBe(8);

    // start + goal preview 두 개
    const previews = mount.querySelectorAll('.facet-goal-preview');
    expect(previews.length).toBe(2);

    // passTracker / snapshotStrip / codePanel 마운트 확인
    expect(mount.querySelector('.facet-pass-tracker')).toBeTruthy();
    expect(mount.querySelector('.facet-snapshot-strip')).toBeTruthy();
    expect(mount.querySelector('.facet-code-view')).toBeTruthy();

    handle.destroy();
  });

  it('goalPreview(computeFrom: sorted) 는 마운트 직후 정렬된 결과로 채워진다', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(bubblesortFacet, mount);

    const previews = [...mount.querySelectorAll('.facet-goal-preview')];
    // 두 번째가 goalPreview (layout 순서: startPreview, stage, goalPreview)
    const goal = previews[1];
    const goalRects = goal.querySelectorAll('rect');
    expect(goalRects.length).toBe(8);

    handle.destroy();
  });

  it('재생 → 정렬 완료 시 비교/교환/패스 메트릭 증가, 막대 오름차순', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(bubblesortFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(3500);

    const compare = mount.querySelector(
      '.facet-control-bar__metric--compare-count span:last-child',
    )?.textContent;
    const swap = mount.querySelector(
      '.facet-control-bar__metric--swap-count span:last-child',
    )?.textContent;
    const pass = mount.querySelector(
      '.facet-control-bar__metric--pass-count span:last-child',
    )?.textContent;
    expect(Number(compare)).toBeGreaterThan(0);
    expect(Number(swap)).toBeGreaterThan(0);
    expect(Number(pass)).toBeGreaterThan(0);

    const labels = [
      ...mount.querySelectorAll('.facet-bar-chart__bars text'),
    ].map((t) => Number(t.textContent));
    const sorted = [...labels].sort((a, b) => a - b);
    expect(labels).toEqual(sorted);

    // snapshot-strip 에 패스 결과 누적
    const snapshots = mount.querySelectorAll('.facet-snapshot-strip__item');
    expect(snapshots.length).toBeGreaterThan(0);

    handle.destroy();
  });

  it('reset 후 재실행 시 데이터 정상 정렬, 스냅샷 다시 누적 (회귀)', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(bubblesortFacet, mount);
    handle.setSpeed(40);

    // 1차 실행
    handle.start();
    await delay(3500);
    // reset
    handle.reset();
    await delay(80);
    // 2차 실행
    handle.start();
    await delay(3500);

    // 재정렬 결과 검증
    const labels = [
      ...mount.querySelectorAll('.facet-bar-chart__bars text'),
    ].map((t) => Number(t.textContent));
    const sorted = [...labels].sort((a, b) => a - b);
    expect(labels).toEqual(sorted);

    // 스냅샷이 1차 실행 후 비워졌고, 2차 실행에서 다시 누적됐는지
    const snapshots = mount.querySelectorAll('.facet-snapshot-strip__item');
    expect(snapshots.length).toBeGreaterThan(0);
    // 첫 스냅샷의 막대 갯수가 8 (빈 배열 아님 검증)
    const firstSnapshot = snapshots[0];
    expect(firstSnapshot.querySelectorAll('rect').length).toBeGreaterThan(0);

    handle.destroy();
  }, 15000);

  it('reset 후 메트릭 0 + snapshot 비움', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(bubblesortFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(800);
    handle.reset();
    await delay(50);
    const compare = mount.querySelector(
      '.facet-control-bar__metric--compare-count span:last-child',
    )?.textContent;
    expect(compare).toBe('0');

    const snapshots = mount.querySelectorAll('.facet-snapshot-strip__item');
    expect(snapshots.length).toBe(0);

    handle.destroy();
  });
});
