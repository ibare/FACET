/**
 * reactive-updates 고유 검사.
 *
 *  1. IR(`computeUpdates`) 과 algorithm 이 열두 조합(모드 3 × 쓰기 수 4) 전부에서
 *     같은 (looked, rendered) 를 낸다.
 *  2. 그 값이 사양 표(`spec-reactive-updates.md` "대조")와 같다.
 *  3. 손잡이를 A → B → A 로 돌려도 사양 표와 어긋나지 않는다(회차별 계기).
 *  4. 사다리(segments[].value)가 자료의 사다리와 같다.
 *  5. `mountView` 를 거쳐 stage 가 실제로 마운트된다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext, type ReactiveContext, type ReactiveInputEvent } from '@ffacet/core/runtime';
import {
  buildSubs,
  buildWriteIndices,
  reactiveUpdatesAlgorithm,
  type ReactiveUpdatesData,
} from '../src/algorithm.js';
import { reactiveUpdatesImperativeIR } from '../src/irs.js';
import { reactiveUpdatesFacet } from '../src/facet.js';
import { reactiveUpdatesStageView } from '../src/reactive-updates-stage.js';

const data = reactiveUpdatesFacet.initialData as unknown as ReactiveUpdatesData;

/** 사양 "대조" 표 — 쓰기 수 → [sync, batch, scan] 의 [looked, rendered]. */
const TABLE: Record<number, { sync: [number, number]; batch: [number, number]; scan: [number, number] }> = {
  1: { sync: [0, 2], batch: [0, 2], scan: [16, 2] },
  2: { sync: [0, 3], batch: [0, 2], scan: [16, 2] },
  4: { sync: [0, 6], batch: [0, 3], scan: [16, 3] },
  8: { sync: [0, 11], batch: [0, 3], scan: [16, 3] },
};

const MODE_NAME: Record<number, 'sync' | 'batch' | 'scan'> = { 0: 'sync', 1: 'batch', 2: 'scan' };

function irCompute(mode: number, k: number): [number, number] {
  const subs = buildSubs(data);
  const writes = buildWriteIndices(data, k);
  const dirtyOut = new Array(data.views.length).fill(0);
  const out = [0, 0];
  runIR(reactiveUpdatesImperativeIR, 'computeUpdates', [
    subs,
    writes,
    mode,
    data.values.length,
    data.views.length,
    dirtyOut,
    out,
  ]);
  return [out[0]!, out[1]!];
}

/**
 * 알고리즘을 한 판(mode·writeCount 하나)만 돌려 최종 (looked, rendered) 를 뽑는다.
 * `ctx.sleep`/`waitForInput` 을 즉시 통과시키는 최소 mock — 실제 타이밍은
 * `whole-self-check` 가 재므로 여기서는 값만 본다.
 */
async function driveOnce(mode: number, writeCount: number): Promise<[number, number]> {
  const totals = new Map<string, number>();
  const queue: ReactiveInputEvent[] = [
    { type: 'mode', payload: { value: mode } },
    { type: 'writeCount', payload: { value: writeCount } },
  ];
  let waitCount = 0;
  const ctx: ReactiveContext<ReactiveUpdatesData> = {
    data: JSON.parse(JSON.stringify(data)) as ReactiveUpdatesData,
    cancelled: false,
    async emit(): Promise<void> {},
    metric(name: string, delta: number | 'inc'): void {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async waitForInput<T extends ReactiveInputEvent>(): Promise<T> {
      waitCount += 1;
      const next = queue.shift();
      if (next) return next as T;
      // 두 손잡이를 다 반영한 뒤에는 영영 기다린다 — 호출부가 결과만 읽고 멈춘다.
      if (waitCount > 40) throw new Error('cancelled');
      return new Promise<T>(() => {});
    },
    async sleep(): Promise<boolean> {
      return true;
    },
    pollInput(): null {
      return null;
    },
  };

  const race = Promise.race([
    reactiveUpdatesAlgorithm(ctx as unknown as FacetContext<ReactiveUpdatesData>),
    new Promise<void>((resolve) => setTimeout(resolve, 60)),
  ]);
  await race;
  return [totals.get('looked') ?? 0, totals.get('rendered') ?? 0];
}

describe('reactive-updates', () => {
  it('IR 과 사양 표가 일치한다 — 모드 3 × 쓰기 수 4', () => {
    for (const k of [1, 2, 4, 8]) {
      for (const mode of [0, 1, 2]) {
        const [looked, rendered] = irCompute(mode, k);
        const expected = TABLE[k]![MODE_NAME[mode]!];
        expect([looked, rendered], `k=${k} mode=${mode}`).toEqual(expected);
      }
    }
  });

  it('algorithm 이 낸 회차별 계기가 사양 표와 같다 — 모드 3 × 쓰기 수 4', async () => {
    for (const k of [1, 2, 4, 8]) {
      for (const mode of [0, 1, 2]) {
        const [looked, rendered] = await driveOnce(mode, k);
        const expected = TABLE[k]![MODE_NAME[mode]!];
        expect([looked, rendered], `k=${k} mode=${mode}`).toEqual(expected);
      }
    }
  }, 20_000);

  it('손잡이를 A → B → A 로 돌려도 각 판이 사양 표와 같다', async () => {
    const seq: Array<[number, number]> = [[0, 4], [1, 4], [0, 4]];
    for (const [mode, k] of seq) {
      const [looked, rendered] = await driveOnce(mode, k);
      const expected = TABLE[k]![MODE_NAME[mode]!];
      expect([looked, rendered]).toEqual(expected);
    }
  });

  it('사다리 값이 initialData 의 모드 목록과 같다', () => {
    const controls = (reactiveUpdatesFacet.blocks.controls as unknown as { controls: { action: string; segments: { value: number }[] }[] }).controls;
    const mode = controls.find((c) => c.action === 'mode')!;
    expect(mode.segments.map((s) => s.value)).toEqual([0, 1, 2]);
    expect(data.modeIds.length).toBe(3);
    const writeCount = controls.find((c) => c.action === 'writeCount')!;
    expect(writeCount.segments.map((s) => s.value)).toEqual([1, 2, 4, 8]);
    expect(data.writes.length).toBeGreaterThanOrEqual(8);
  });

  it('mountView 를 거쳐 stage 가 실제로 마운트된다', () => {
    const container = document.createElement('div');
    const instance = mountView(reactiveUpdatesStageView, container, {
      config: { type: 'reactive-updates-stage' },
      initialData: data as unknown as Record<string, unknown>,
      locale: 'en',
      theme: 'light',
    });
    expect(container.querySelectorAll('svg').length).toBe(1);
    instance.destroy();
  });
});
