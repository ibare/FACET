// @vitest-environment happy-dom
/**
 * allocate-and-free 고유의 주장.
 *
 *   1. 열여섯 판마다 알고리즘의 셈이 사양 실측표와 같다 (걸음 · 계기 다섯 · 목록 최고 · c · d)
 *   2. 열여섯 판마다 알고리즘이 부른 할당기 자취를 IR 로 되풀이하면 돌려준 주소 · 끝의 state · 목록이 같다
 *   3. 손잡이를 A → B → A 로 돌려 회차마다 계기가 사양의 판 끝 값이다 (판마다 쌓이지 않는다)
 *   4. 사다리가 segments 와 같고, 버퍼 길이가 사다리 끝값(힙 칸 18 · 목록 5)이다
 *   5. 무대 — 두 번 · 1 의 끝 모습에서 c 와 d 의 화살이 한 덩이로 모인다
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type ControlSpec, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import {
  allocateAndFreeAlgorithm,
  allocateAndFreeFacet,
  allocateAndFreeImperativeIR,
  allocateAndFreeProjector,
  allocateAndFreeStageView,
  bufferLengths,
  playRound,
  type AllocateAndFreeData,
  type RoundTrace,
} from '../src/index.js';

const data = (): AllocateAndFreeData => structuredClone(allocateAndFreeFacet.initialData) as unknown as AllocateAndFreeData;

/** sleep 이 곧바로 true 를 주는 ctx — 자취만 얻는다 */
function quietCtx(events: FacetRuntimeEvent[] = []): ReactiveContext<AllocateAndFreeData> {
  return {
    data: data(),
    cancelled: false,
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric() {},
    async sleep() {
      return true;
    },
    async waitForInput() {
      throw new Error('입력을 기다리지 않는다');
    },
    pollInput() {
      return null;
    },
  } as ReactiveContext<AllocateAndFreeData>;
}

async function trace(rounds: number, mode: number, events?: FacetRuntimeEvent[]): Promise<RoundTrace> {
  const r = await playRound(quietCtx(events), rounds, mode, () => {});
  if (!r) throw new Error('판이 끝나지 않았다');
  return r;
}

// 사양 실측표 (sim.py 출력) — [걸음, new-land-cells, lost-blocks, use-after-free, free-list-length, 목록 최고, frames-peak, c, d]
const TABLE: Record<string, number[]> = {
  '0-1': [7, 9, 0, 0, 0, 0, 2, 103, 106],
  '0-2': [10, 12, 1, 0, 0, 0, 2, 106, 109],
  '0-3': [13, 15, 2, 0, 0, 0, 2, 109, 112],
  '0-4': [16, 18, 3, 0, 0, 0, 2, 112, 115],
  '1-1': [8, 6, 0, 0, 0, 1, 2, 100, 103],
  '1-2': [12, 6, 0, 0, 0, 1, 2, 100, 103],
  '1-3': [16, 6, 0, 0, 0, 1, 2, 100, 103],
  '1-4': [20, 6, 0, 0, 0, 1, 2, 100, 103],
  '2-1': [8, 6, 0, 1, 0, 1, 2, 100, 103],
  '2-2': [12, 6, 0, 2, 0, 1, 2, 100, 103],
  '2-3': [16, 6, 0, 3, 0, 1, 2, 100, 103],
  '2-4': [20, 6, 0, 4, 0, 1, 2, 100, 103],
  '3-1': [9, 3, 0, 0, 0, 2, 2, 100, 100],
  '3-2': [14, 3, 0, 0, 1, 3, 2, 100, 100],
  '3-3': [19, 3, 0, 0, 2, 4, 2, 100, 100],
  '3-4': [24, 3, 0, 0, 3, 5, 2, 100, 100],
};

const COMBOS: [number, number][] = [];
for (const mode of [0, 1, 2, 3]) for (const rounds of [1, 2, 3, 4]) COMBOS.push([mode, rounds]);

describe('allocate-and-free', () => {
  it('사다리가 segments 와 같고 버퍼 길이가 사다리 끝값이다', () => {
    const d = data();
    const controls = (allocateAndFreeFacet.blocks.controls as { controls: ControlSpec[] }).controls;
    const values = (action: string): unknown[] => {
      const c = controls.find((x) => x.action === action);
      return ((c?.segments as { value: unknown }[] | undefined) ?? []).map((s) => s.value);
    };
    expect(values('rounds')).toEqual(d.roundsLadder);
    expect(values('free')).toEqual(d.freeLadder);
    expect(d.roundsLadder[d.roundsLadder.length - 1]).toBe(4);
    expect(bufferLengths(d)).toEqual({ cells: 18, list: 5 });
  });

  it.each(COMBOS)('돌려주기 %i · 바퀴 %i — 사양 실측표와 같다', async (mode, rounds) => {
    const r = await trace(rounds, mode);
    const m = r.metrics;
    expect([
      r.steps,
      m['new-land-cells'],
      m['lost-blocks'],
      m['use-after-free'],
      m['free-list-length'],
      r.listPeak,
      m['frames-peak'],
      r.c,
      r.d,
    ]).toEqual(TABLE[`${mode}-${rounds}`]);
  });

  it.each(COMBOS)('돌려주기 %i · 바퀴 %i — IR 할당기가 같은 주소 · 같은 끝 상태를 낸다', async (mode, rounds) => {
    const r = await trace(rounds, mode);
    const state = [100, 0, 100];
    const sizes = new Array<number>(18).fill(0);
    const freeAddr = new Array<number>(5).fill(0);
    const freeSize = new Array<number>(5).fill(0);
    for (const call of r.calls) {
      if (call.op === 'allocate') {
        expect(runIR(allocateAndFreeImperativeIR, 'allocate', [state, sizes, freeAddr, freeSize, call.arg])).toBe(call.result);
      } else {
        runIR(allocateAndFreeImperativeIR, 'release', [state, sizes, freeAddr, freeSize, call.arg]);
      }
    }
    expect(state).toEqual(r.state);
    const front: number[] = [];
    for (let k = state[1] - 1; k >= 0; k -= 1) front.push(freeAddr[k]);
    expect(front).toEqual(r.freeList);
    expect(state[0] - 100).toBe(r.metrics['new-land-cells']);
    expect(state[1]).toBe(r.metrics['free-list-length']);
  });

  it('두 번 · 2 의 할당기 자취가 사양과 같다', async () => {
    const r = await trace(2, 3);
    const text = r.calls.map((c) => (c.op === 'allocate' ? `allocate(${c.arg})→${c.result}` : `release(${c.arg})`)).join(' · ');
    expect(text).toBe(
      'allocate(3)→100 · release(100) · release(100) · allocate(3)→100 · release(100) · release(100) · allocate(3)→100 · allocate(3)→100',
    );
  });

  it('phase 는 할당기 걸음에만 켜진다 — 기본 판 (안 함 · 3)', async () => {
    const events: FacetRuntimeEvent[] = [];
    await trace(3, 0, events);
    const seq = events.map((e) => (e.type === 'phase' ? `(${String((e.payload as { phase?: unknown }).phase)})` : e.type));
    expect(seq.join(' ')).toBe(
      'start bind (fresh) call return write (fresh) call return write (fresh) call return write (fresh) bind (fresh) bind',
    );
  });

  it('손잡이 A → B → A — 회차마다 계기가 판 끝 값이다', async () => {
    const inputs = [
      { type: 'free', payload: { value: 3 } },
      { type: 'free', payload: { value: 0 } },
    ];
    const totals = new Map<string, number>();
    const rounds: Record<string, number>[] = [];
    const snap = (): Record<string, number> => ({
      'new-land-cells': totals.get('new-land-cells') ?? NaN,
      'lost-blocks': totals.get('lost-blocks') ?? NaN,
      'use-after-free': totals.get('use-after-free') ?? NaN,
      'free-list-length': totals.get('free-list-length') ?? NaN,
      'frames-peak': totals.get('frames-peak') ?? NaN,
    });
    let cancelled = false;
    const ctx = {
      data: data(),
      get cancelled() {
        return cancelled;
      },
      async emit() {},
      metric(name: string, delta: number | 'inc') {
        totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async sleep() {
        return true;
      },
      async waitForInput() {
        rounds.push(snap());
        const next = inputs.shift();
        if (!next) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return next;
      },
      pollInput() {
        return null;
      },
    };
    await allocateAndFreeAlgorithm(ctx as unknown as ReactiveContext<AllocateAndFreeData>);
    const want = (a: number[]) => ({
      'new-land-cells': a[0],
      'lost-blocks': a[1],
      'use-after-free': a[2],
      'free-list-length': a[3],
      'frames-peak': a[4],
    });
    expect(rounds).toEqual([want([15, 2, 0, 0, 2]), want([3, 0, 0, 2, 2]), want([15, 2, 0, 0, 2])]);
  });

  it('무대 — 두 번 · 1 의 끝에서 c 와 d 의 화살이 한 덩이로 모인다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(allocateAndFreeStageView, container, { config: {}, locale: 'en', isInstant: () => true });
    const events: FacetRuntimeEvent[] = [];
    await trace(1, 3, events);
    const projector = allocateAndFreeProjector({ stage }, { getSpeed: () => 1, t: (_k, en, vars) => en.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? '')) });
    projector.onInit?.(data());
    for (const e of events) await projector.onEvent(e);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const arrows = [...(svg?.querySelectorAll('path[marker-end]') ?? [])].map((p) => p.getAttribute('d') ?? '');
    // p · c · d 셋 다 @100 을 가리킨다 — 화살 끝이 한 자리
    expect(arrows.length).toBe(3);
    const ends = new Set(arrows.map((d) => d.split(' ').slice(-1)[0]));
    expect(ends.size).toBe(1);
    expect(svg?.textContent).toContain('c: @100 · d: @100');
    stage.destroy();
  });
});
