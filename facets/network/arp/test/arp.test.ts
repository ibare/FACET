// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  arpAlgorithm,
  arpIrArgs,
  arpCompute,
  arpFacet,
  arpImperativeIR,
  arpProjector,
  arpStageView,
  type ArpData,
} from '../src/index.js';

const data = arpFacet.initialData as ArpData;


/** 사양의 실측표 — 방송 · 표에서 · MAC 쌍 · 프레임 · 첫 물음 · 걸음 */
const SPEC: Record<string, { b: number; hit: number; mac: number; f: number; first: string; steps: number }> = {
  '0,0': { b: 3, hit: 0, mac: 1, f: 9, first: '192.168.1.9', steps: 4 },
  '0,1': { b: 1, hit: 2, mac: 1, f: 5, first: '192.168.1.9', steps: 4 },
  '1,0': { b: 9, hit: 0, mac: 3, f: 27, first: '192.168.1.1', steps: 10 },
  '1,1': { b: 3, hit: 6, mac: 3, f: 15, first: '192.168.1.1', steps: 10 },
};

function irArgs(d: ArpData, dest: number, cache: number) {
  return arpIrArgs(d, dest, cache) as unknown as (number | number[])[];
}

function controls() {
  const bar = arpFacet.blocks['controls'] as { controls: { action?: string; segments?: { value: number; default?: boolean }[] }[] };
  return bar.controls;
}

describe('arp — 셈', () => {
  it('사다리가 segments 값과 같고 자료 길이가 사양대로다', () => {
    const dest = controls().find((c) => c.action === 'dest')!;
    const cache = controls().find((c) => c.action === 'cache')!;
    expect(dest.segments!.map((s) => s.value)).toEqual(data.destinations.map((_, i) => i));
    expect(cache.segments!.map((s) => s.value)).toEqual(data.cacheModes.map((_, i) => i));
    expect(dest.segments!.find((s) => s.default)!.value).toBe(data.startDest);
    expect(cache.segments!.find((s) => s.default)!.value).toBe(data.startCache);
    expect(data.destinations).toEqual(['192.168.1.9', '172.16.5.20']);
    expect(data.cacheModes).toEqual(['off', 'on']);
    expect(data.sends).toBe(3);
    const args = irArgs(data, 1, 0);
    expect(args[3]).toEqual([192, 168, 1, 1, 10, 0, 12, 2]); // routerIn
    expect(args[4]).toEqual([10, 0, 12, 2, 172, 16, 5, 20]); // routeNext
    expect(args[8]).toHaveLength(3); // known = 1 + R
  });

  it('네 조합 모두 — 알고리즘의 셈이 사양 표와 같다', () => {
    for (const [key, want] of Object.entries(SPEC)) {
      const [dest, cache] = key.split(',').map(Number) as [number, number];
      const r = arpCompute(data, dest, cache);
      expect([r.broadcasts, r.fromTable, r.macPairs, r.frames, r.firstAsk, r.steps], key).toEqual([
        want.b,
        want.hit,
        want.mac,
        want.f,
        want.first,
        want.steps,
      ]);
      expect(r.ipPairs).toBe(1);
    }
  });

  it('네 조합 모두 — IR 의 답이 알고리즘과 같다 (routes 차례를 뒤집어도)', () => {
    const shuffled: ArpData = { ...data, routes: [...data.routes].reverse() };
    for (const d of [data, shuffled]) {
      for (let dest = 0; dest < d.destinations.length; dest++) {
        for (let cache = 0; cache < d.cacheModes.length; cache++) {
          const r = arpCompute(d, dest, cache);
          const args = irArgs(d, dest, cache);
          expect(runIR(arpImperativeIR, 'arpRun', args)).toBe(r.broadcasts);
          expect(args[9]).toEqual([r.broadcasts, r.fromTable, r.frames]);
          expect(runIR(arpImperativeIR, 'countHops', irArgs(d, dest, cache).slice(0, 6))).toBe(r.macPairs);
        }
      }
    }
  });

  it('닿지 않는 길은 algorithm 이 먼저 던진다 (IR 은 −1 을 낼 뿐이다)', () => {
    const broken: ArpData = { ...data, routes: data.routes.filter((r) => r.node !== 'r2') };
    expect(() => arpIrArgs(broken, 1, 0)).toThrow();
    const args = irArgs(data, 1, 0);
    args[4] = [10, 0, 12, 2, 9, 9, 9, 9];
    expect(runIR(arpImperativeIR, 'arpRun', args)).toBe(-1);
  });

  it('판 끝의 표 줄이 사양과 같다', () => {
    const rows = (dest: number, cache: number) =>
      Object.fromEntries(Object.entries(arpCompute(data, dest, cache).tables).map(([k, v]) => [k, v.length]));
    expect(rows(0, 1)).toEqual({ a: 1, c: 1, r1: 0, r2: 0, b: 0 });
    expect(rows(1, 1)).toEqual({ a: 1, c: 0, r1: 2, r2: 2, b: 1 });
    expect(rows(1, 0)).toEqual({ a: 0, c: 0, r1: 0, r2: 0, b: 0 });
    expect(arpCompute(data, 1, 1).tables['r1']).toEqual([
      { ip: '192.168.1.5', mac: '3c:52:82:1a:7e:05' },
      { ip: '10.0.12.2', mac: 'f0:9f:c2:11:08:0e' },
    ]);
  });
});

describe('arp — 회차별 계기', () => {
  it('손잡이를 A → B → A 로 돌려도 회차마다 표와 같다', async () => {
    const inputs = [
      { type: 'cache', payload: { value: 1 } },
      { type: 'dest', payload: { value: 0 } },
      { type: 'dest', payload: { value: 1 } },
      { type: 'cache', payload: { value: 0 } },
    ];
    const metrics = new Map<string, number>();
    const rounds: Record<string, number>[] = [];
    let cancelled = false;
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        if (e.type === 'done') rounds.push(Object.fromEntries(metrics));
      },
      metric(name: string, delta: number | 'inc') {
        metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async sleep() {
        return true;
      },
      async waitForInput() {
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
    await arpAlgorithm(ctx as unknown as FacetContext<ArpData>);
    const want = ['1,0', '1,1', '0,1', '1,1', '1,0'].map((k) => SPEC[k]!);
    expect(rounds).toHaveLength(want.length);
    rounds.forEach((r, i) => {
      expect(r, `회차 ${i + 1}`).toEqual({
        broadcasts: want[i]!.b,
        'from-table': want[i]!.hit,
        'mac-pairs': want[i]!.mac,
        frames: want[i]!.f,
      });
    });
  });
});

describe('arp — 화면', () => {
  it('stage 가 초기 자료 없이도 마운트되고, 한 판을 받아 그린다', async () => {
    const empty = mountView(arpStageView, document.createElement('div'), { config: {} });
    empty.destroy();

    const container = document.createElement('div');
    const stage = mountView(arpStageView, container, {
      config: {},
      initialData: data as unknown as Record<string, unknown>,
      locale: 'ko',
      isInstant: () => true,
    });
    const proj = arpProjector({ stage }, { getSpeed: () => 1, t: (_k, fb, vars) => fb.replace(/\{(\w+)\}/g, (_m, n: string) => String(vars?.[n] ?? '')) });
    const events: FacetRuntimeEvent[] = [];
    let cancelled = false;
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        events.push(e);
        await proj.onEvent(e);
      },
      metric() {},
      async sleep() {
        return true;
      },
      async waitForInput(): Promise<{ type: string }> {
        cancelled = true;
        throw new Error('cancelled');
      },
      pollInput() {
        return null;
      },
    };
    ctx.data.startCache = 1;
    await arpAlgorithm(ctx as unknown as FacetContext<ArpData>);
    const txt = container.textContent ?? '';
    // 판 끝: 링크 셋의 MAC 쌍 · 표 줄 · 마지막 캡션
    expect(txt).toContain('…:7e:05 → …:40:01');
    expect(txt).toContain('…:40:02 → …:08:0e');
    expect(txt).toContain('…:08:0f → …:d2:31');
    expect(txt).toContain('Done · IP pairs: 1 · MAC pairs: 3 · broadcasts: 3');
    expect(events.filter((e) => e.type === 'phase')).toHaveLength(10);
    stage.destroy();
  });
});
