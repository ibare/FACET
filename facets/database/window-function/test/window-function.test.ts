// @vitest-environment happy-dom
/**
 * window-function 고유의 주장 — IR 과 algorithm 이 모든 틀 값에서 같은 답을 내는가, 사양 표와 같은가,
 * 계기가 회차마다 사양대로인가, 무대가 한 판을 끝까지 그리는가.
 */
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  computeWindow,
  windowFunctionAlgorithm,
  windowFunctionFacet,
  windowFunctionImperativeIR,
  windowFunctionProjector,
  windowFunctionStageView,
  type WindowFunctionData,
} from '../src/index.js';

const data = windowFunctionFacet.initialData as WindowFunctionData;
const n = data.rows.length;
const FRAMES = [0, 1, 2, 3];

function viaIR(frame: number) {
  const res = computeWindow(data, frame);
  const k = data.frames[frame] === -1 ? n : data.frames[frame];
  const near = new Array<number>(n).fill(0);
  const total = new Array<number>(n).fill(0);
  const same = runIR(windowFunctionImperativeIR, 'frameSums', [
    res.part,
    data.rows.map((r) => r.km),
    n,
    k,
    near,
    total,
  ]);
  return { same, near, total };
}

/** 묶음 차례(처음 나온 차례) → id 차례의 `id:near` */
function nearInPartitionOrder(frame: number): string {
  const res = computeWindow(data, frame);
  const order = data.rows
    .map((_r, i) => i)
    .sort((a, b) => res.part[a] - res.part[b] || data.rows[a].id - data.rows[b].id);
  return order.map((i) => `${data.rows[i].id}:${res.near[i]}`).join(' ');
}

describe('window-function — 셈', () => {
  it('사다리가 손잡이 구간과 같다 · 자료가 커지면 먼저 깨진다', () => {
    const controls = (windowFunctionFacet.blocks.controls as { controls: { widget: string; segments?: { value: number }[] }[] })
      .controls;
    const knob = controls.find((c) => c.widget === 'segmented-slider');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.frames.map((_k, i) => i));
    expect(data.frames).toEqual([0, 1, 2, -1]);
    expect(data.frameClauses).toHaveLength(data.frames.length);
    expect(n).toBe(9);
  });

  it('IR 과 algorithm 이 모든 틀 값에서 같은 답을 낸다', () => {
    for (const frame of FRAMES) {
      const res = computeWindow(data, frame);
      const ir = viaIR(frame);
      expect(ir.near, `frame ${frame}`).toEqual(res.near);
      expect(ir.total, `frame ${frame}`).toEqual(res.total);
      expect(ir.same, `frame ${frame}`).toBe(res.same);
    }
  });

  it('사양 실측표와 같다', () => {
    const table = FRAMES.map((frame) => {
      const res = computeWindow(data, frame);
      return { rows: n, distinct: res.distinct, same: res.same, near: nearInPartitionOrder(frame) };
    });
    expect(table).toEqual([
      { rows: 9, distinct: 9, same: 0, near: '1:5 3:3 5:7 8:1 2:8 6:2 9:9 4:6 7:4' },
      { rows: 9, distinct: 5, same: 3, near: '1:8 3:15 5:11 8:8 2:10 6:19 9:11 4:10 7:10' },
      { rows: 9, distinct: 5, same: 7, near: '1:15 3:16 5:16 8:11 2:19 6:19 9:19 4:10 7:10' },
      { rows: 9, distinct: 3, same: 9, near: '1:16 3:16 5:16 8:16 2:19 6:19 9:19 4:10 7:10' },
    ]);
    const res = computeWindow(data, 0);
    const totals = res.teams.map((team, p) => `${team} ${res.total[res.part.indexOf(p)]}`);
    expect(totals).toEqual(['hawk 16', 'lynx 19', 'orca 10']);
    expect(Math.max(...res.total)).toBe(19);
  });
});

/** 입력을 차례로 건네는 가짜 reactive 문맥. 입력이 다 떨어지면 취소한다 */
function fakeCtx(inputs: number[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const rounds: Record<string, number>[] = [];
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      rounds.push(Object.fromEntries(metrics));
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'frame', payload: { value: next, segmentIndex: next, frame: String(next) } };
    },
  };
  return { ctx: ctx as unknown as ReactiveContext<WindowFunctionData>, events, rounds };
}

describe('window-function — 판', () => {
  it('계기가 회차마다 사양대로 — 틀 1 → UNBOUNDED → 1', async () => {
    const { ctx, rounds } = fakeCtx([3, 1]);
    await windowFunctionAlgorithm(ctx);
    expect(rounds).toEqual([
      { 'window-rows': 9, 'group-rows': 3, 'same-as-total': 3 },
      { 'window-rows': 9, 'group-rows': 3, 'same-as-total': 9 },
      { 'window-rows': 9, 'group-rows': 3, 'same-as-total': 3 },
    ]);
  });

  it('한 판은 걸음 일곱 — 틀 값과 무관하다', async () => {
    const { ctx, events } = fakeCtx([0, 2, 3]);
    await windowFunctionAlgorithm(ctx);
    const steps = events.filter((e) => !e.silent).map((e) => e.type);
    const round = ['table', 'gather', 'frames', 'frames', 'frames', 'fold', 'same'];
    expect(steps).toEqual([...round, ...round, ...round, ...round]);
  });

  it('사다리 밖의 손잡이 값은 던진다', async () => {
    const { ctx } = fakeCtx([7]);
    await expect(windowFunctionAlgorithm(ctx)).rejects.toThrow(/사다리 밖/);
  });

  it('무대가 mountView 로 붙어 한 판을 끝까지 그린다', async () => {
    const { ctx, events } = fakeCtx([3]);
    await windowFunctionAlgorithm(ctx);
    const container = document.createElement('div');
    const stage = mountView(windowFunctionStageView, container, { config: {}, locale: 'ko' });
    const projector = windowFunctionProjector({ stage }, { getSpeed: () => 1, t: makeTranslator() });
    projector.onInit?.(data);
    for (const e of events) await projector.onEvent(e);
    const text = container.textContent ?? '';
    expect(text).toContain('ROWS BETWEEN UNBOUNDED PRECEDING');
    expect(text).toContain('Rows where near equals total: 9 of 9');
    stage.destroy();
  });
});
