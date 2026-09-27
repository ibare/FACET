// @vitest-environment happy-dom
/**
 * svd 고유 검수 — 사양 표(그림 넷 × 겹 여섯) · 조각 대조 · 재구성 · 계기 회차 · 걸음 차례 · 무대 멱등.
 */
import { describe, expect, it } from 'vitest';
import { getAlgorithmMechanismKind, makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  CELLS,
  decompose,
  readSvdData,
  registerSvd,
  svdAlgorithm,
  svdFacet,
  svdIRs,
  svdProjector,
  svdStageView,
  formatFixed,
  type SvdData,
  type SvdStage,
} from '../src/index.js';

const data = svdFacet.initialData as unknown as SvdData;

type Log = { kind: 'emit'; event: FacetRuntimeEvent } | { kind: 'sleep'; ms: number };

/** 가짜 reactive ctx — 입력 큐가 비면 취소로 끝낸다. */
async function play(inputs: { type: string; payload?: unknown }[], init: Partial<SvdData> = {}) {
  const log: Log[] = [];
  const metrics: Record<string, number> = {};
  const rounds: Record<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: { ...data, ...init },
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      log.push({ kind: 'emit', event });
    },
    metric(name: string, delta: number | 'inc') {
      if (delta === 'inc') throw new Error('inc 를 쓰지 않는다');
      metrics[name] = (metrics[name] ?? 0) + delta;
    },
    async sleep(ms: number) {
      log.push({ kind: 'sleep', ms });
      return true;
    },
    async waitForInput() {
      rounds.push({ ...metrics });
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('취소');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await svdAlgorithm(ctx as never);
  return { log, metrics, rounds };
}

const steps = (log: Log[]) =>
  log.flatMap((l) => (l.kind === 'emit' && l.event.type === 'stack-layer' ? [l.event.payload as Record<string, unknown>] : []));

const SPEC: Record<string, [number, number][]> = {
  heart: [[28.9, 11], [9.8, 22], [3.6, 41], [2.2, 42], [1.1, 42], [0.0, 42]],
  plus: [[45.9, 0], [0.0, 42], [0.0, 42], [0.0, 42], [0.0, 42], [0.0, 42]],
  stairs: [[42.5, 10], [29.3, 19], [22.1, 14], [16.7, 16], [11.2, 20], [0.0, 42]],
  scatter: [[59.4, 2], [31.5, 12], [17.6, 19], [11.5, 25], [5.8, 38], [0.0, 42]],
};
const SIGMA: Record<string, string[]> = {
  heart: ['34.86', '9.88', '3.33', '1.04', '0.69', '0.40'],
  plus: ['22.57', '11.65', '0.00', '0.00', '0.00', '0.00'],
  stairs: ['37.33', '12.69', '7.92', '6.01', '5.08', '4.63'],
  scatter: ['26.78', '16.78', '8.71', '4.46', '3.29', '1.93'],
};
const NORM: Record<string, string> = { heart: '36.41', plus: '25.40', stairs: '41.24', scatter: '33.30' };
const FIRST_FULL: Record<string, number> = { heart: 4, plus: 2, stairs: 6, scatter: 6 };

describe('svd — 셈', () => {
  it('데이터 · 사다리가 손잡이와 같다', () => {
    const d = readSvdData(data);
    expect(d.pictures.map((p) => p.id)).toEqual(['heart', 'plus', 'stairs', 'scatter']);
    const controls = (svdFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)!.segments!;
    expect(seg('picture').map((s) => s.value)).toEqual(d.pictureLadder);
    expect(seg('keep').map((s) => s.value)).toEqual(d.keepLadder);
    expect(d.pictureLadder.at(-1)).toBe(3);
    expect(d.keepLadder.at(-1)).toBe(6);
    expect(seg('picture').find((s) => s.default)!.value).toBe(d.picture);
    expect(seg('keep').find((s) => s.default)!.value).toBe(d.keep);
    expect(svdIRs).toEqual([]);
  });

  it('σ · ‖A‖ · 오차 % · 같은 칸이 사양 표와 같다 · 오차는 늘지 않는다 · A_6 이 원래 표로 돌아온다', () => {
    for (const p of data.pictures) {
      const dec = decompose(p.cells);
      expect(dec.sigmas.map((s) => formatFixed(s, 2))).toEqual(SIGMA[p.id]);
      expect(formatFixed(dec.norm, 2)).toBe(NORM[p.id]);
      expect(dec.errors.map((e) => formatFixed(e, 1))).toEqual(SPEC[p.id]!.map(([e]) => e.toFixed(1)));
      expect(dec.same).toEqual(SPEC[p.id]!.map(([, s]) => s));
      for (let j = 1; j < 6; j++) expect(dec.errors[j]!).toBeLessThanOrEqual(dec.errors[j - 1]! + 1e-9);
      // 남은 σ 의 제곱합으로 셈한 오차와 같다
      dec.errors.forEach((e, j) => {
        const rest = Math.sqrt(dec.sigmas.slice(j + 1).reduce((a, s) => a + s * s, 0));
        expect(Math.abs(e - (rest / dec.norm) * 100)).toBeLessThan(1e-6);
      });
      const a6 = dec.stacks[5]!;
      p.cells.forEach((row, r) => row.forEach((x, c) => expect(Math.abs(a6[r]![c]! - x)).toBeLessThan(1e-9)));
      expect(dec.same.indexOf(CELLS) + 1).toBe(FIRST_FULL[p.id]);
    }
  });

  it('조각 low-rank-approx 대조 — 하트 σ · ‖A‖ · 같은 칸 A_6..A_1', () => {
    const dec = decompose(data.pictures[0]!.cells);
    expect(dec.sigmas[0]!.toFixed(3)).toBe('34.864');
    expect(dec.sigmas[5]!.toFixed(3)).toBe('0.401');
    expect(dec.norm.toFixed(3)).toBe('36.414');
    expect([...dec.same].reverse()).toEqual([42, 42, 42, 41, 22, 11]);
  });

  it('칸 값의 범위 −1.47 .. 12.27 · 잣대 12.27 · 반올림 경계에 든 칸이 없다', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of data.pictures) {
      const dec = decompose(p.cells);
      for (const g of dec.stacks) for (const row of g) for (const x of row) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
        expect(Math.abs(x - Math.floor(x) - 0.5)).toBeGreaterThan(1e-6);
      }
    }
    expect(lo.toFixed(2)).toBe('-1.47');
    expect(hi.toFixed(2)).toBe('12.27');
  });

  it('수 표기 — 빼기표 U+2212 · 음의 영 없음', () => {
    expect(formatFixed(-0.3, 1)).toBe('−0.3');
    expect(formatFixed(-1e-9, 2)).toBe('0.00');
    expect(formatFixed(3.333, 2)).toBe('3.33');
  });
});

describe('svd — 판', () => {
  it('reactive 로 등록된다', () => {
    registerSvd();
    expect(getAlgorithmMechanismKind('svd')).toBe('reactive');
  });

  it('그림 넷 × 겹 여섯 — 판 끝 오차 · 같은 칸 · 걸음 수 · 재생 길이', async () => {
    for (let pic = 0; pic < 4; pic++) {
      for (let k = 1; k <= 6; k++) {
        const { log, metrics } = await play([], { picture: pic, keep: k });
        const id = data.pictures[pic]!.id;
        const st = steps(log);
        expect(st.length + 1).toBe(k + 1);
        const last = st.at(-1)!;
        expect(formatFixed(last.error as number, 1)).toBe(SPEC[id]![k - 1]![0].toFixed(1));
        expect(last.same).toBe(SPEC[id]![k - 1]![1]);
        expect(last.last).toBe(true);
        const ff = FIRST_FULL[id]!;
        expect(last.firstFull).toBe(ff <= k ? ff : null);
        expect(metrics).toEqual({ layers: k, 'same-cells': SPEC[id]![k - 1]![1] });
        const sleeps = log.flatMap((l) => (l.kind === 'sleep' ? [l.ms] : []));
        expect(sleeps).toEqual(new Array(k).fill(2000));
      }
    }
  });

  it('차례 — board(silent) → sleep → 걸음, 걸음은 silent 가 아니고 phase 는 없다', async () => {
    const { log } = await play([]);
    expect(log[0]!.kind).toBe('emit');
    const first = log[0] as { kind: 'emit'; event: FacetRuntimeEvent };
    expect(first.event.type).toBe('board');
    expect(first.event.silent).toBe(true);
    expect(log[1]).toEqual({ kind: 'sleep', ms: 2000 });
    expect(log[2]!.kind === 'emit' && log[2]!.event.type).toBe('stack-layer');
    for (const l of log) {
      if (l.kind !== 'emit') continue;
      expect(l.event.type).not.toBe('phase');
      if (l.event.type === 'stack-layer') expect(l.event.silent).not.toBe(true);
    }
  });

  it('계기 회차 — 그림 하트 → 계단 → 하트 (겹 4) · 겹 4 → 2 → 4 (하트)', async () => {
    const a = await play([
      { type: 'picture', payload: { value: 2 } },
      { type: 'picture', payload: { value: 0 } },
    ]);
    expect(a.rounds.map((r) => [r.layers, r['same-cells']])).toEqual([[4, 42], [4, 16], [4, 42]]);
    const b = await play([
      { type: 'keep', payload: { value: 2 } },
      { type: 'keep', payload: { value: 4 } },
    ]);
    expect(b.rounds.map((r) => [r.layers, r['same-cells']])).toEqual([[4, 42], [2, 22], [4, 42]]);
  });

  it('남의 입력은 흘리고, 제 손잡이의 사다리 밖 값은 던진다', async () => {
    const ok = await play([{ type: 'other', payload: { value: 99 } }]);
    // 남의 입력을 흘리고 다시 기다린다 — 판을 새로 돌리지 않는다
    expect(ok.rounds.length).toBe(2);
    expect(ok.log.filter((l) => l.kind === 'emit' && l.event.type === 'board').length).toBe(1);
    await expect(play([{ type: 'keep', payload: { value: 7 } }])).rejects.toThrow();
    await expect(play([{ type: 'picture', payload: { value: '1' } }])).rejects.toThrow();
  });
});

describe('svd — 무대', () => {
  const mount = () => {
    const container = document.createElement('div');
    const stage = mountView(svdStageView, container, {
      config: { type: 'svd-stage' },
      t: makeTranslator('en', svdFacet.messages),
      isInstant: () => true,
    }) as SvdStage;
    const projector = svdProjector({ stage }, { getSpeed: () => 1, t: makeTranslator('en', svdFacet.messages) });
    return { container, stage, projector };
  };

  it('첫 그림을 두 번 먹여도 요소 수가 같다 · 되감기가 결론을 걷는다', async () => {
    const { log } = await play([]);
    const events = log.flatMap((l) => (l.kind === 'emit' ? [l.event] : []));
    const { container, projector } = mount();
    const count = () => container.querySelectorAll('*').length;
    projector.onEvent(events[0]!);
    const n = count();
    projector.onEvent(events[0]!);
    expect(count()).toBe(n);
    for (const e of events.slice(1)) projector.onEvent(e);
    expect(count()).toBe(n);
    expect(container.textContent).toContain('42 / 42');
    projector.onReset?.();
    projector.onEvent(events[0]!);
    expect(count()).toBe(n);
    expect(container.textContent).not.toContain('Error');
    expect(container.textContent).toContain('Start');
  });

  it('음수 칸은 속이 빈 네모 — 계단 A_2', async () => {
    const { log } = await play([], { picture: 2, keep: 2 });
    const events = log.flatMap((l) => (l.kind === 'emit' ? [l.event] : []));
    const { container, projector } = mount();
    for (const e of events) projector.onEvent(e);
    const hollow = [...container.querySelectorAll('rect')].filter(
      (r) => r.getAttribute('fill') === 'none' && r.getAttribute('stroke-width') === '1.5' && Number(r.getAttribute('width')) > 0,
    );
    expect(hollow.length).toBeGreaterThan(0);
  });

  it('모르는 이벤트는 던진다', () => {
    const { projector } = mount();
    expect(() => projector.onEvent({ type: 'mystery' })).toThrow();
  });
});
