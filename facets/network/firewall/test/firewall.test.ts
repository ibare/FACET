// @vitest-environment happy-dom
/**
 * 방화벽 — facet 고유의 주장.
 *
 * 1. 코드 패널 IR(`runAll`)의 깊이 여섯 · 죽은 줄 수가 네 자리 모두에서 알고리즘과 같다
 * 2. 자리마다 사양 표(차례 · 판정 · 깊이 · 먼저 맞은 줄 · 계기 넷 · 죽은 줄)와 같다
 * 3. 손잡이를 2 → 4 → 2 → 1 로 돌려 회차마다 계기가 사양 표와 같다 (판마다 쌓이지 않는다)
 * 4. 사다리가 손잡이 구간 값과 같다
 * 5. stage 가 mountView 로 마운트되어 한 판을 그린다
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  firewallAlgorithm,
  firewallArrays,
  firewallFacet,
  firewallImperativeIR,
  firewallRound,
  firewallStageView,
  type FirewallData,
  type FirewallStage,
} from '../src/index.js';

const data = firewallFacet.initialData as FirewallData;

/** 사양 표 — sim.py firewall 출력 그대로. */
const SPEC: Record<
  number,
  {
    order: string[];
    result: string;
    depth: number[];
    hit: string[];
    allowed: number;
    denied: number;
    checks: number;
    dead: string[];
  }
> = {
  1: {
    order: ['R2', 'R1', 'R3', 'R4'],
    result: 'DDADAD',
    depth: [1, 1, 3, 4, 2, 1],
    hit: ['R2', 'R2', 'R3', 'R4', 'R1', 'R2'],
    allowed: 2,
    denied: 4,
    checks: 12,
    dead: [],
  },
  2: {
    order: ['R1', 'R2', 'R3', 'R4'],
    result: 'ADADAA',
    depth: [1, 2, 3, 4, 1, 1],
    hit: ['R1', 'R2', 'R3', 'R4', 'R1', 'R1'],
    allowed: 4,
    denied: 2,
    checks: 12,
    dead: [],
  },
  3: {
    order: ['R1', 'R3', 'R2', 'R4'],
    result: 'AAADAA',
    depth: [1, 2, 2, 4, 1, 1],
    hit: ['R1', 'R3', 'R3', 'R4', 'R1', 'R1'],
    allowed: 5,
    denied: 1,
    checks: 11,
    dead: ['R2'],
  },
  4: {
    order: ['R1', 'R3', 'R4', 'R2'],
    result: 'AAADAA',
    depth: [1, 2, 2, 3, 1, 1],
    hit: ['R1', 'R3', 'R3', 'R4', 'R1', 'R1'],
    allowed: 5,
    denied: 1,
    checks: 10,
    dead: ['R2'],
  },
};

describe('firewall', () => {
  it('데이터 크기와 사다리 — 커지면 먼저 깨진다', () => {
    expect(data.rules).toHaveLength(4);
    expect(data.packets).toHaveLength(6);
    expect(data.positionLadder).toEqual([1, 2, 3, 4]);
    expect(data.positionLadder[data.positionLadder.length - 1]).toBe(4);
    const controls = (firewallFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const knob = controls.find((c) => c.action === 'position');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.positionLadder);
    expect(knob?.segments?.find((s) => s.default)?.value).toBe(data.position);
  });

  it('자리마다 사양 표와 같다', () => {
    for (const pos of data.positionLadder) {
      const r = firewallRound(data, pos);
      const s = SPEC[pos];
      expect(s).toBeDefined();
      if (!s) continue;
      expect(r.order).toEqual(s.order);
      expect(r.action.map((a) => (a === 'allow' ? 'A' : 'D')).join('')).toBe(s.result);
      expect(r.depth).toEqual(s.depth);
      expect(r.hitRule).toEqual(s.hit);
      expect([r.allowed, r.denied, r.ruleChecks, r.dead.length]).toEqual([s.allowed, s.denied, s.checks, s.dead.length]);
      expect(r.dead).toEqual(s.dead);
    }
  });

  it('IR runAll 이 네 자리 모두에서 알고리즘과 같다', () => {
    for (const pos of data.positionLadder) {
      const a = firewallArrays(data, pos);
      const depth = new Array<number>(data.packets.length).fill(0);
      const hits = new Array<number>(data.rules.length).fill(0);
      const dead = runIR(firewallImperativeIR, 'runAll', [
        a.order,
        a.proto,
        a.src,
        a.srcLen,
        a.dst,
        a.dstLen,
        a.port,
        a.pProto,
        a.pSrc,
        a.pDst,
        a.pPort,
        depth,
        hits,
      ]);
      const r = firewallRound(data, pos);
      expect(depth).toEqual(r.depth);
      expect(dead).toBe(r.dead.length);
      // 편 배열의 중간값은 옥텟(≤ 255)을 넘지 않는다
      expect(Math.max(...a.src, ...a.dst, ...a.pSrc, ...a.pDst)).toBeLessThanOrEqual(255);
    }
  });

  it('손잡이 2 → 4 → 2 → 1 — 회차마다 계기가 사양 표와 같다', async () => {
    const inputs = [4, 2, 1];
    const metrics = new Map<string, number>();
    const perRound: number[][] = [];
    const events: FacetRuntimeEvent[] = [];
    let cancelled = false;
    const ctx = {
      data: structuredClone(data),
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
        perRound.push(['allowed', 'denied', 'rule-checks', 'dead-rules'].map((n) => metrics.get(n) ?? NaN));
        const v = inputs.shift();
        if (v === undefined) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return { type: 'position', payload: { value: v, segmentIndex: v - 1, position: String(v) } };
      },
    };
    await firewallAlgorithm(ctx as unknown as FacetContext<FirewallData>);
    const want = [2, 4, 2, 1].map((p) => {
      const s = SPEC[p];
      if (!s) throw new Error('no spec');
      return [s.allowed, s.denied, s.checks, s.dead.length];
    });
    expect(perRound).toEqual(want);
    // 걸음 여덟 — 차례 1 · 패킷 여섯 · 죽은 줄 1
    const visible = events.filter((e) => !e.silent).map((e) => e.type);
    expect(visible.slice(0, 8)).toEqual(['order', 'packet', 'packet', 'packet', 'packet', 'packet', 'packet', 'dead']);
    expect(visible).toHaveLength(32);
  });

  it('stage 가 한 판을 그린다', async () => {
    const container = document.createElement('div');
    const stage = mountView(firewallStageView, container, {
      config: { type: 'firewall-stage' },
      initialData: data as unknown as Record<string, unknown>,
      locale: 'ko',
    }) as FirewallStage;
    const r = firewallRound(data, 3);
    await stage.setOrder(r.order, 0);
    for (let p = 0; p < 6; p++) {
      const action = r.action[p];
      const depth = r.depth[p];
      const rule = r.hitRule[p];
      if (!action || !depth || !rule) throw new Error('round');
      await stage.dropPacket(p, depth, action, rule, 0);
    }
    await stage.markDead(r.dead, 0);
    const txt = container.textContent ?? '';
    expect(txt).toContain('R2');
    expect(txt.match(/✗/g)?.length ?? 0).toBeGreaterThan(0);
    stage.destroy();
  });
});
