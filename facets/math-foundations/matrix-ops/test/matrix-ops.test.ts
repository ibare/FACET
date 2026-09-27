// @vitest-environment happy-dom
/**
 * matrix-ops 고유의 주장 — IR ↔ algorithm 36 짝 대조, 사양 표 대조, 회차별 계기,
 * 걸음 차례(phase 가 걸음 앞 · init 뒤 sleep), 무대 첫 그림의 멱등.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  computeRound,
  matrixOpsAlgorithm,
  matrixOpsFacet,
  matrixOpsImperativeIR,
  matrixOpsInitialData,
  matrixOpsProjector,
  matrixOpsStageView,
  readMatrixOpsData,
  axisMaxOf,
  type MatrixOpsData,
} from '../src/index.js';

const data = readMatrixOpsData(matrixOpsInitialData);
const N = data.mapLadder.length;
const SYM = ['R', 'R⁻¹', 'H', 'S', 'F', 'P'];

// ── 사양 표 (sim.py 그대로 · 행 = 먼저 X, 열 = 다음 Y)
const YX: number[][][] = [
  [[-1, 0, 0, -1], [1, 0, 0, 1], [1, -1, 1, 0], [0, -1, 2, 0], [0, -1, -1, 0], [0, -1, 0, 0]],
  [[1, 0, 0, 1], [-1, 0, 0, -1], [-1, 1, -1, 0], [0, 1, -2, 0], [0, 1, 1, 0], [0, 1, 0, 0]],
  [[0, -1, 1, 1], [0, 1, -1, -1], [1, 2, 0, 1], [1, 1, 0, 2], [1, 1, 0, -1], [1, 1, 0, 0]],
  [[0, -2, 1, 0], [0, 2, -1, 0], [1, 2, 0, 2], [1, 0, 0, 4], [1, 0, 0, -2], [1, 0, 0, 0]],
  [[0, 1, 1, 0], [0, -1, -1, 0], [1, -1, 0, -1], [1, 0, 0, -2], [1, 0, 0, 1], [1, 0, 0, 0]],
  [[0, 0, 1, 0], [0, 0, -1, 0], [1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]],
];
const SAME = [
  [4, 4, 0, 0, 0, 0],
  [4, 4, 0, 0, 0, 0],
  [0, 0, 4, 0, 0, 0],
  [0, 0, 0, 4, 4, 4],
  [0, 0, 0, 4, 4, 4],
  [0, 0, 0, 4, 4, 4],
];
const HOME = [
  [0, 4, 0, 0, 0, 0],
  [4, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 4, 0],
  [0, 0, 0, 0, 0, 0],
];
const DETS = [1, 1, 1, 2, -1, 0];
/** 자리 수 — 첫 뜀 뒤 · 두 번 뒤 */
const SPOTS = (f: number, s: number): [number, number] => [f === 5 ? 3 : 4, f === 5 || s === 5 ? 3 : 4];

const pairs: [number, number][] = [];
for (let f = 0; f < N; f += 1) for (let s = 0; s < N; s += 1) pairs.push([f, s]);

function irArgs(x: number[], y: number[], pts: number[][]) {
  return { x, y, px: pts.map((p) => p[0]!), py: pts.map((p) => p[1]!) };
}

describe('matrix-ops — 사양 표', () => {
  it('사다리 · 데이터 길이', () => {
    expect(data.mapLadder).toEqual([0, 1, 2, 3, 4, 5]);
    expect(data.points).toHaveLength(4);
    expect(data.maps).toHaveLength(6);
    expect(data.symbols).toEqual(SYM);
    const controls = (matrixOpsFacet.blocks.controls as { controls: { action: string; segments?: { value: number; label: string; default?: boolean }[] }[] }).controls;
    for (const action of ['firstMap', 'secondMap']) {
      const knob = controls.find((c) => c.action === action);
      expect(knob?.segments?.map((s) => s.value)).toEqual(data.mapLadder);
      expect(knob?.segments?.map((s) => s.label)).toEqual(SYM);
    }
    expect(controls.find((c) => c.action === 'firstMap')?.segments?.find((s) => s.default)?.value).toBe(data.firstMap);
    expect(controls.find((c) => c.action === 'secondMap')?.segments?.find((s) => s.default)?.value).toBe(data.secondMap);
  });

  it('36 짝 — YX · 같은 곳 · 제자리 · 자리 수 · det', () => {
    data.maps.forEach((_m, i) => expect(computeRound(data, i, i).detX).toBe(DETS[i]));
    for (const [f, s] of pairs) {
      const r = computeRound(data, f, s);
      expect(r.yx, `${SYM[f]}→${SYM[s]}`).toEqual(YX[f]![s]);
      expect(r.sameCount).toBe(SAME[f]![s]);
      expect(r.homeCount).toBe(HOME[f]![s]);
      expect([r.spotsAfterX.length, r.spotsAfterY.length]).toEqual(SPOTS(f, s));
      expect(r.detYX).toBe(r.detY * r.detX + 0);
      expect(r.matchCount).toBe(4);
      expect(r.afterY).toEqual(r.viaYX);
    }
    // 같은 짝 14 · 되돌림 3 · det 0 인 짝 11
    expect(pairs.filter(([f, s]) => computeRound(data, f, s).sameCount === 4)).toHaveLength(14);
    expect(pairs.filter(([f, s]) => computeRound(data, f, s).homeCount === 4)).toHaveLength(3);
    expect(pairs.filter(([f, s]) => computeRound(data, f, s).detYX === 0)).toHaveLength(11);
    expect(axisMaxOf(data)).toBe(8);
  });

  it('기본 판 H → S 과 네 갈래 대표', () => {
    const hs = computeRound(data, 2, 3);
    expect(hs.afterX).toEqual([[2, 1], [1, -1], [1, 2], [3, 2]]);
    expect(hs.afterY).toEqual([[2, 2], [1, -2], [1, 4], [3, 4]]);
    expect(hs.xy).toEqual([1, 2, 0, 2]);
    expect(hs.viaXY).toEqual([[3, 2], [0, -2], [3, 4], [5, 4]]);
    const pr = computeRound(data, 5, 0);
    expect(pr.afterY).toEqual([[0, 1], [0, 2], [0, -1], [0, 1]]);
    expect(pr.viaXY).toEqual([[-1, 0], [1, 0], [-2, 0], [-2, 0]]);
    expect(pr.spotsAfterY).toEqual([{ x: 0, y: 1, n: 2 }, { x: 0, y: 2, n: 1 }, { x: 0, y: -1, n: 1 }]);
    const hp = computeRound(data, 2, 5);
    expect(hp.spotsAfterY).toEqual([{ x: 2, y: 0, n: 1 }, { x: 1, y: 0, n: 2 }, { x: 3, y: 0, n: 1 }]);
  });
});

describe('matrix-ops — IR ↔ algorithm', () => {
  it('36 짝 모두 — sameAsTwoJumps · samePoints · det, 점 차례를 섞어도', () => {
    const orders = [data.points, [data.points[3]!, data.points[1]!, data.points[0]!, data.points[2]!]];
    for (const [f, s] of pairs) {
      const r = computeRound(data, f, s);
      for (const pts of orders) {
        const { x, y, px, py } = irArgs(r.x, r.y, pts);
        const yx = [0, 0, 0, 0];
        expect(runIR(matrixOpsImperativeIR, 'sameAsTwoJumps', [x, y, px, py, yx])).toBe(r.matchCount);
        expect(yx.map((c) => c + 0)).toEqual(r.yx); // 인터프리터의 −0 은 수로 같다
        const yx2 = [0, 0, 0, 0];
        const xy = [0, 0, 0, 0];
        expect(runIR(matrixOpsImperativeIR, 'samePoints', [x, y, px, py, yx2, xy])).toBe(r.sameCount);
        expect(xy.map((c) => c + 0)).toEqual(r.xy);
      }
      expect(runIR(matrixOpsImperativeIR, 'det', [r.yx])).toBe(r.detYX);
      expect(runIR(matrixOpsImperativeIR, 'det', [r.yx])).toBe(r.detY * r.detX + 0);
    }
  });
});

// ── 알고리즘을 가짜 reactive ctx 로 돌린다
type Rec = { kind: 'emit'; event: FacetRuntimeEvent } | { kind: 'sleep'; ms: number } | { kind: 'wait' };

async function drive(inputs: { type: string; payload?: unknown }[], init: Partial<MatrixOpsData> = {}) {
  const log: Rec[] = [];
  const metrics: Record<string, number> = {};
  const rounds: Record<string, number>[] = [];
  const queue = [...inputs];
  const ctx = {
    data: { ...matrixOpsInitialData, ...init } as MatrixOpsData,
    cancelled: false,
    async emit(event: FacetRuntimeEvent) {
      log.push({ kind: 'emit', event });
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep(ms: number) {
      log.push({ kind: 'sleep', ms });
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      log.push({ kind: 'wait' });
      rounds.push({ ...metrics });
      const next = queue.shift();
      if (!next) {
        ctx.cancelled = true;
        return { type: 'none' };
      }
      return next;
    },
  };
  await matrixOpsAlgorithm(ctx as never);
  return { log, rounds };
}

const knob = (type: 'firstMap' | 'secondMap', value: number) => ({ type, payload: { value, segmentIndex: value } });
const triple = (m: Record<string, number>) => [m['same-spot'], m['back-home'], m['landing-spots']];

describe('matrix-ops — 재생', () => {
  it('회차별 계기 — 사양 표 그대로', async () => {
    const a = await drive([knob('secondMap', 5), knob('secondMap', 3)]);
    expect(a.rounds.map(triple)).toEqual([[0, 0, 4], [0, 0, 3], [0, 0, 4]]);
    const b = await drive([knob('firstMap', 5), knob('firstMap', 2)]);
    expect(b.rounds.map(triple)).toEqual([[0, 0, 4], [4, 0, 3], [0, 0, 4]]);
    const c = await drive([knob('secondMap', 1), knob('secondMap', 3)], { firstMap: 0 });
    expect(c.rounds.map(triple)).toEqual([[0, 0, 4], [4, 4, 4], [0, 0, 4]]);
  });

  it('걸음 차례 — init → sleep → phase → 걸음, phase 는 걸음 바로 앞', async () => {
    const { log } = await drive([knob('firstMap', 0)]);
    const steps = ['jump-first', 'jump-second', 'compose', 'jump-once', 'jump-swapped'];
    const phases = ['jump-x', 'jump-y', 'product', 'jump-yx', 'jump-xy'];
    const roundAt = log.flatMap((r, i) => (r.kind === 'emit' && r.event.type === 'round' ? [i] : []));
    expect(roundAt).toHaveLength(2);
    for (const start of roundAt) {
      const round = log[start]!;
      expect(round.kind === 'emit' && round.event.silent).toBe(true);
      expect(log[start + 1]).toEqual({ kind: 'sleep', ms: 2200 });
      let i = start + 2;
      steps.forEach((step, k) => {
        const ph = log[i]!;
        expect(ph.kind === 'emit' && ph.event.type === 'phase' && (ph.event.payload as { phase: string }).phase).toBe(phases[k]);
        const ev = log[i + 1]!;
        expect(ev.kind === 'emit' && ev.event.type).toBe(step);
        expect(ev.kind === 'emit' && ev.event.silent).toBeFalsy();
        const after = log[i + 2]!;
        expect(after.kind).toBe(k === steps.length - 1 ? 'wait' : 'sleep');
        i += 3;
      });
    }
    // 판 하나의 sleep 합 = 11.0 초
    const firstWait = log.findIndex((r) => r.kind === 'wait');
    const total = log.slice(0, firstWait).reduce((a, r) => a + (r.kind === 'sleep' ? r.ms : 0), 0);
    expect(total).toBe(11000);
  });

  it('제 손잡이의 사다리 밖 값은 던지고, 남의 입력은 흘린다', async () => {
    await expect(drive([{ type: 'other', payload: { value: 99 } }])).resolves.toBeDefined();
    await expect(drive([knob('firstMap', 6)])).rejects.toThrow(/사다리 밖/);
    await expect(drive([{ type: 'secondMap', payload: { value: '3' } }])).rejects.toThrow(/사다리 밖/);
  });

  it('어긋난 데이터는 던진다', () => {
    expect(() => readMatrixOpsData({ ...matrixOpsInitialData, points: [[1, 1.5]] })).toThrow();
    expect(() => readMatrixOpsData({ ...matrixOpsInitialData, maps: [{ id: 'R', m: [0, 1, 1] }] })).toThrow();
    expect(() => readMatrixOpsData({ ...matrixOpsInitialData, mapLadder: [0, 1, 2, 3, 4, 6] })).toThrow();
  });
});

describe('matrix-ops — 무대', () => {
  async function events(first: number, second: number) {
    const { log } = await drive([], { firstMap: first, secondMap: second });
    return log.flatMap((r) => (r.kind === 'emit' ? [r.event] : []));
  }

  function mount() {
    const container = document.createElement('div');
    const stage = mountView(matrixOpsStageView, container, { config: {}, isInstant: () => true });
    const highlights: (string | null)[] = [];
    const codePanel = { destroy() {}, highlightPhase: (p: string | null) => highlights.push(p) };
    const proj = matrixOpsProjector({ stage, codePanel }, { getSpeed: () => 1, t: (_k, en, vars) => en.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`)) });
    return { container, stage, proj, highlights };
  }

  it('config 만 주고 마운트해도 던지지 않는다', () => {
    expect(() => mount()).not.toThrow();
  });

  it('첫 그림을 두 번 먹여도 요소 수가 같다 · 되감기는 무대를 비운다', async () => {
    const evs = await events(5, 0);
    const { container, proj } = mount();
    const count = () => container.querySelectorAll('*').length;
    for (const e of evs) await proj.onEvent(e);
    proj.onReset?.();
    const empty = count();
    await proj.onEvent(evs[0]!);
    const once = count();
    await proj.onEvent(evs[0]!);
    expect(count()).toBe(once);
    for (const e of evs.slice(1)) await proj.onEvent(e);
    const full = count();
    proj.onReset?.();
    expect(count()).toBe(empty);
    for (const e of evs) await proj.onEvent(e);
    expect(count()).toBe(full);
  });

  it('판이 바뀌면 앞 판의 결론을 걷는다 · 캡션의 수는 payload 의 수', async () => {
    const { container, proj, highlights } = mount();
    const caption = () => Array.from(container.querySelectorAll('text')).at(-1)?.textContent ?? '';
    for (const e of await events(2, 5)) await proj.onEvent(e);
    expect(caption()).toBe('XY = [1 0 ; 0 0] in one jump → same spot as YX: 0 / 4');
    // 포갠 자리 표지 — 두 번 뒤 (1, 0) 에 둘
    expect(Array.from(container.querySelectorAll('[data-badge="dot"]')).map((b) => b.textContent)).toEqual(['×2']);
    const next = await events(2, 3);
    await proj.onEvent(next[0]!);
    expect(highlights.at(-1)).toBeNull();
    expect(container.querySelectorAll('[data-badge]').length).toBe(0);
    expect(caption()).toBe('First X = H, then Y = S · points at home: 4');
    for (const e of next.slice(1)) await proj.onEvent(e);
    expect(caption()).toBe('XY = [1 2 ; 0 2] in one jump → same spot as YX: 0 / 4');
  });

  it('운동 도중에 다음 걸음이 오면 앞 걸음의 표지를 남기지 않는다 (P → R⁻¹ · P → R)', async () => {
    for (const second of [1, 0]) {
      const container = document.createElement('div');
      const stage = mountView(matrixOpsStageView, container, { config: {}, isInstant: () => false });
      const proj = matrixOpsProjector({ stage }, { getSpeed: () => 1, t: (_k, en, vars) => en.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`)) });
      const evs = await events(5, second);
      const upTo = (type: string) => evs.slice(0, evs.findIndex((e) => e.type === type) + 1);
      // 걸음 1 의 운동(600ms)이 도는 채로 걸음 2 를 곧장 먹인다
      for (const e of upTo('jump-second')) await proj.onEvent(e);
      const badges = () => Array.from(container.querySelectorAll('[data-badge="dot"]')).map((b) => `${b.getAttribute('x')},${b.getAttribute('y')}`);
      expect(badges()).toEqual([]); // 걸음 2 의 운동이 아직 돈다 — 걸음 1 의 표지가 남지 않는다
      await new Promise((r) => setTimeout(r, 900));
      const after = badges();
      expect(after).toHaveLength(1);
      // 끝난 뒤의 표지는 걸음 2 의 포갠 자리 하나뿐 — 되감아 즉시 모드로 그린 것과 같다
      const ref = document.createElement('div');
      const refStage = mountView(matrixOpsStageView, ref, { config: {}, isInstant: () => true });
      const refProj = matrixOpsProjector({ stage: refStage }, { getSpeed: () => 1, t: (_k, en) => en });
      for (const e of upTo('jump-second')) await refProj.onEvent(e);
      expect(after).toEqual(Array.from(ref.querySelectorAll('[data-badge="dot"]')).map((b) => `${b.getAttribute('x')},${b.getAttribute('y')}`));
      stage.destroy();
      refStage.destroy();
    }
  });

  it('음수는 U+2212', async () => {
    const { container, proj } = mount();
    const evs = await events(4, 3);
    for (const e of evs.slice(0, evs.findIndex((e) => e.type === 'compose') + 1)) await proj.onEvent(e);
    const caption = Array.from(container.querySelectorAll('text')).at(-1)?.textContent ?? '';
    expect(caption).toBe('YX = [1 0 ; 0 −2] · det Y × det X = 2 × −1 = −2');
  });
});
