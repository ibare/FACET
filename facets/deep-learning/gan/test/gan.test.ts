// @vitest-environment happy-dom
/**
 * gan 고유의 주장 — 사양 표 대조 · IR ↔ algorithm (모든 손잡이 값 · 모든 라운드 · 뒤집은 목록) ·
 * 회차별 계기 · 사다리.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  discriminatorStep,
  ganAlgorithm,
  ganFacet,
  ganImperativeIR,
  ganProjector,
  ganStageView,
  generatorStep,
  narrowGanData,
  trainGan,
  type GanData,
} from '../src/index.js';

const data: GanData = narrowGanData(ganFacet.initialData);

/** 표시 규칙 — toFixed, 표시 0 의 음수는 부호를 뗀다, 음수 부호 U+2212. */
function fx(x: number, d = 2): string {
  const s = x.toFixed(d);
  if (Number(s) === 0) return s.replace('-', '');
  return s.replace('-', '−');
}

describe('gan — 사다리', () => {
  it('startLadder 가 segments[].value 와 같고 끝값 · 길이가 사양대로다', () => {
    const controls = (ganFacet.blocks.controls as { controls: unknown[] }).controls;
    const knob = controls.find(
      (c) => typeof c === 'object' && c !== null && (c as { widget?: string }).widget === 'segmented-slider',
    ) as { segments: { value: number; default?: boolean }[] };
    expect(knob.segments.map((s) => s.value)).toEqual(data.startLadder);
    expect(data.startLadder).toHaveLength(7);
    expect(data.startLadder[0]).toBe(-0.6);
    expect(data.startLadder[6]).toBe(0.6);
    expect(knob.segments.find((s) => s.default)?.value).toBe(data.start);
    expect(data.real).toHaveLength(4);
    expect(data.noise).toHaveLength(4);
    expect(data.curveSamples).toBe(41);
    expect(data.rounds % data.showEvery).toBe(0);
  });
});

describe('gan — 사양 표 대조', () => {
  const table: [number, string, string, string, string, string, string, string][] = [
    [-0.6, '4|0', '−2.61', '0.14', '0.05', '−2.61', '0.35', '0.91'],
    [-0.4, '4|0', '−2.71', '0.12', '0.04', '−2.71', '0.35', '0.92'],
    [-0.2, '2|2', '0.00', '8.57', '3.30', '0.00', '0.69', '0.70'],
    [0, '2|2', '0.00', '8.37', '3.22', '0.00', '0.70', '0.70'],
    [0.2, '2|2', '0.00', '8.57', '3.30', '0.00', '0.70', '0.69'],
    [0.4, '0|4', '2.71', '0.12', '0.04', '2.71', '0.92', '0.35'],
    [0.6, '0|4', '2.61', '0.14', '0.05', '2.61', '0.91', '0.35'],
  ];
  it.each(table)('b %s 의 라운드 16 끝', (b0, sides, mean, spread, a, b, dl, dr) => {
    const all = trainGan(data, b0);
    expect(all).toHaveLength(1 + 2 * data.rounds);
    const s = all[all.length - 1];
    expect(`${s.left}|${s.right}`).toBe(sides);
    expect([fx(s.mean), fx(s.spread), fx(s.a), fx(s.b), fx(s.dLeft), fx(s.dRight)]).toEqual([mean, spread, a, b, dl, dr]);
  });

  it('걸음 0 의 가짜 · 쪽 · 퍼짐', () => {
    const want: Record<string, [string[], string]> = {
      '-0.6': [['−0.94', '−0.73', '−0.47', '−0.26'], '4|0'],
      '-0.4': [['−0.74', '−0.53', '−0.27', '−0.06'], '4|0'],
      '-0.2': [['−0.54', '−0.33', '−0.07', '0.14'], '3|1'],
      '0': [['−0.34', '−0.13', '0.13', '0.34'], '2|2'],
      '0.2': [['−0.14', '0.07', '0.33', '0.54'], '1|3'],
      '0.4': [['0.06', '0.27', '0.53', '0.74'], '0|4'],
      '0.6': [['0.26', '0.47', '0.73', '0.94'], '0|4'],
    };
    for (const b0 of data.startLadder) {
      const s = trainGan(data, b0)[0];
      const [fakes, sides] = want[String(b0)];
      expect(s.fakes.map((x) => fx(x))).toEqual(fakes);
      expect(`${s.left}|${s.right}`).toBe(sides);
      expect(fx(s.spread)).toBe('0.68');
      expect([fx(s.dLeft), fx(s.dRight)]).toEqual(['0.50', '0.50']);
    }
  });

  it('기본 b 0.4 의 걸음 차례 (사양의 서른셋 가운데 적힌 줄)', () => {
    const all = trainGan(data, 0.4);
    const d = (i: number) => {
      const s = all[i];
      return [s.dpar.slice(0, 3).map((x) => fx(x)), fx(s.dpar[3]), fx(s.dLeft), fx(s.dRight)];
    };
    const g = (i: number) => {
      const s = all[i];
      return [fx(s.a), fx(s.b), s.fakes.map((x) => fx(x)), `${s.left}|${s.right}`, fx(s.spread)];
    };
    expect(d(1)).toEqual([['0.45', '−0.81', '0.30'], '0.00', '0.60', '0.56']);
    expect(g(2)).toEqual(['0.51', '0.83', ['0.16', '0.57', '1.09', '1.50'], '0|4', '1.34']);
    expect(d(3)).toEqual([['0.83', '−1.24', '0.39'], '0.07', '0.69', '0.59']);
    expect(g(4)).toEqual(['0.72', '1.66', ['0.73', '1.30', '2.02', '2.60'], '0|4', '1.87']);
    expect(d(5)).toEqual([['1.13', '−1.44', '0.05'], '−0.16', '0.70', '0.45']);
    expect(g(6)).toEqual(['0.28', '2.39', ['2.04', '2.26', '2.53', '2.75'], '0|4', '0.72']);
    expect(d(7)).toEqual([['1.43', '−1.43', '−0.28'], '−0.19', '0.76', '0.36']);
    expect(g(8)).toEqual(['0.23', '2.69', ['2.40', '2.58', '2.81', '2.99'], '0|4', '0.59']);
    expect(g(16)).toEqual(['0.20', '3.61', ['3.35', '3.51', '3.71', '3.87'], '0|4', '0.53']);
    expect(g(24)).toEqual(['0.18', '2.98', ['2.75', '2.89', '3.08', '3.22'], '0|4', '0.47']);
    expect(g(30)).toEqual(['0.06', '2.72', ['2.64', '2.68', '2.75', '2.80'], '0|4', '0.16']);
    expect(d(31)).toEqual([['3.18', '−0.75', '0.14'], '−0.69', '0.92', '0.35']);
    expect(g(32)).toEqual(['0.04', '2.71', ['2.65', '2.69', '2.73', '2.77'], '0|4', '0.12']);
  });

  it('가려냄 걸음에서 가짜가 제자리 · 만듦 걸음에서 D 가 제자리 · 모든 가짜가 x 축 안', () => {
    for (const b0 of data.startLadder) {
      const all = trainGan(data, b0);
      for (let i = 1; i < all.length; i++) {
        if (all[i].kind === 'd') expect(all[i].fakes).toEqual(all[i - 1].fakes);
        else expect(all[i].dpar).toEqual(all[i - 1].dpar);
        for (const x of all[i].fakes) expect(Math.abs(x)).toBeLessThan(data.xRange[1]);
      }
    }
  });
});

describe('gan — IR 과 algorithm 이 같은 길로 셈한다', () => {
  const close = (got: unknown, want: number[]) => {
    expect(Array.isArray(got)).toBe(true);
    const g = got as number[];
    expect(g).toHaveLength(want.length);
    g.forEach((x, i) => expect(Math.abs(x - want[i])).toBeLessThan(1e-9));
  };

  const compare = (real: number[], noise: number[], b0: number) => {
    const m = data.centers;
    // algorithm 쪽
    const dA = [data.v0[0], data.v0[1], data.v0[2], data.c0];
    const gA = [data.a0, b0];
    const grA = [0, 0, 0, 0];
    // IR 쪽 — 두 단계로 나눠 부른 것 · ganRound 로 부른 것
    const dI = dA.slice();
    const gI = gA.slice();
    const grI = [0, 0, 0, 0];
    const dR = dA.slice();
    const gR = gA.slice();
    const grR = [0, 0, 0, 0];
    for (let r = 1; r <= data.rounds; r++) {
      discriminatorStep(real, noise, m, dA, gA, grA, data.lrD);
      runIR(ganImperativeIR, 'discriminatorStep', [real, noise, m, dI, gI, grI, data.lrD]);
      close(dI, dA);
      generatorStep(noise, m, dA, gA, data.lrG);
      runIR(ganImperativeIR, 'generatorStep', [noise, m, dI, gI, data.lrG]);
      close(gI, gA);
      runIR(ganImperativeIR, 'ganRound', [real, noise, m, dR, gR, grR, data.lrD, data.lrG]);
      close(dR, dA);
      close(gR, gA);
    }
    return { dpar: dA, gpar: gA };
  };

  it.each(data.startLadder.map((b) => [b]))('b %s — 라운드마다 가려냄 뒤 dpar · 만듦 뒤 gpar · 끝 무게', (b0) => {
    const end = compare(data.real, data.noise, b0);
    const all = trainGan(data, b0);
    const last = all[all.length - 1];
    close(end.dpar, last.dpar);
    close(end.gpar, [last.a, last.b]);
  });

  it.each(data.startLadder.map((b) => [b]))('b %s — 진짜 · 잡음 목록을 뒤집어도 같다', (b0) => {
    const real = data.real.slice().reverse();
    const noise = data.noise.slice().reverse();
    const end = compare(real, noise, b0);
    const all = trainGan({ ...data, real, noise }, b0);
    const last = all[all.length - 1];
    close(end.dpar, last.dpar);
    close(end.gpar, [last.a, last.b]);
  });
});

describe('gan — 회차별 계기 (A → B → A)', () => {
  it('0.4 → −0.4 → 0 → 0.4 로 돌린 판마다 끝의 쪽별 가짜 수', async () => {
    const inputs = [-0.4, 0, 0.4];
    const metric = new Map<string, number>([
      ['fakes-left', 0],
      ['fakes-right', 0],
    ]);
    const perRun: [number, number][] = [];
    let cancelled = false;
    let initSeen = 0;
    const ctx = {
      data: structuredClone(ganFacet.initialData) as GanData,
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        if (e.type === 'gan-init') initSeen++;
      },
      metric(name: string, delta: number | 'inc') {
        const cur = metric.get(name);
        if (cur === undefined || delta === 'inc') throw new Error(`모르는 계기 ${name}`);
        metric.set(name, cur + delta);
      },
      async sleep() {
        return true;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        perRun.push([metric.get('fakes-left') as number, metric.get('fakes-right') as number]);
        const next = inputs.shift();
        if (next === undefined) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return { type: 'start', payload: { value: next } };
      },
    };
    await ganAlgorithm(ctx as never);
    expect(initSeen).toBe(4);
    expect(perRun).toEqual([
      [0, 4],
      [4, 0],
      [2, 2],
      [0, 4],
    ]);
  });
});

describe('gan — 첫 그림은 멱등이다 (되짚기 · 되돌리기)', () => {
  it('gan-init 을 두 번 먹여도 무대의 요소 수가 같다 · 걸음을 지난 뒤 다시 먹여도 첫 그림과 같다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(ganStageView, container, { config: { type: 'gan-stage' }, initialData: ganFacet.initialData, locale: 'ko' });
    const projector = ganProjector({ stage } as never);
    const events: FacetRuntimeEvent[] = [];
    await ganAlgorithm({
      data: structuredClone(ganFacet.initialData) as GanData,
      cancelled: false,
      async emit(e: FacetRuntimeEvent) {
        events.push(e);
      },
      metric() {},
      async sleep() {
        return true;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        throw new Error('cancelled');
      },
    } as never).catch(() => undefined);
    const init = events.find((e) => e.type === 'gan-init');
    expect(init).toBeDefined();
    const count = () => container.querySelectorAll('*').length;
    await projector.onEvent(init as FacetRuntimeEvent);
    const once = count();
    const html = container.innerHTML;
    await projector.onEvent(init as FacetRuntimeEvent);
    expect(count()).toBe(once);
    for (const e of events.slice(0, 12)) await projector.onEvent(e);
    await projector.onEvent(init as FacetRuntimeEvent);
    expect(count()).toBe(once);
    expect(container.innerHTML).toBe(html);
    (stage as { destroy(): void }).destroy();
  });
});
