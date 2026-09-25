// @vitest-environment happy-dom
/**
 * dns 고유의 주장 — IR 과 알고리즘이 모든 TTL 에서 같은 답을 내고, 그 답이 사양 실측표와 같다.
 * 손잡이 60 → 300 → 60 을 회차마다 견주고, 사다리 · 층 수 · 걸음 차례를 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  dnsAlgorithm,
  dnsFacet,
  dnsImperativeIR,
  dnsStageView,
  lastPhaseOf,
  planRound,
  walkTree,
  type DnsData,
} from '../src/index.js';

const data = dnsFacet.initialData as DnsData;

// 사양 실측표 — TTL: [server-queries, cache-hits, stale-answers, 놓침, 옛 답을 쥔 초]
const TABLE: Record<number, [number, number, number, number, number]> = {
  10: [33, 0, 0, 30, 5],
  30: [13, 20, 2, 10, 25],
  60: [8, 25, 5, 5, 55],
  120: [6, 27, 11, 3, 115],
  300: [4, 29, 17, 1, 175],
};

const PHASES: Record<number, string[]> = {
  10: ['walk-tree', 'ask-owner', 'ask-owner', 'ask-owner', 'ask-owner', 'ask-owner', 'ask-owner'],
  30: ['walk-tree', 'cache-hit', 'cache-hit', 'ask-owner', 'cache-hit', 'cache-hit', 'cache-hit'],
  60: ['walk-tree', 'cache-hit', 'cache-hit', 'stale-answer', 'cache-hit', 'cache-hit', 'cache-hit'],
  120: ['walk-tree', 'cache-hit', 'cache-hit', 'stale-answer', 'stale-answer', 'cache-hit', 'cache-hit'],
  300: ['walk-tree', 'cache-hit', 'cache-hit', 'stale-answer', 'stale-answer', 'stale-answer', 'stale-answer'],
};

function totalsOf(ttl: number) {
  const r = planRound(data, ttl);
  const last = r.windows[r.windows.length - 1]!;
  const misses = r.windows.reduce((s, w) => s + w.misses, 0);
  const change = r.windows.find((w) => w.change !== null)?.change;
  if (!change) throw new Error('바뀜이 창에 없다');
  return { ...last.totals, misses, held: change.heldSeconds, windows: r.windows };
}

describe('dns', () => {
  it('사다리가 segments 와 같고 끝값이 300 이다', () => {
    const controls = (dnsFacet.blocks.controls as { controls: { widget?: string; segments?: { value: number }[] }[] }).controls;
    const slider = controls.find((c) => c.widget === 'segmented-slider');
    expect(slider?.segments?.map((s) => s.value)).toEqual(data.ttlLadder);
    expect(data.ttlLadder).toEqual([10, 30, 60, 120, 300]);
    expect(data.ttlLadder).toContain(data.ttl);
    expect(data.questionCount).toBe(30);
  });

  it('서버 표를 걸어 층 넷을 셈한다', () => {
    const path = walkTree(data);
    expect(path.map((h) => h.name)).toEqual(['a.root-servers.net', 'a.gtld-servers.net', 'ns1.example.com', 'ns.lab.example.com']);
    expect(path.map((h) => h.zone)).toEqual(['', 'com.', 'example.com.', 'lab.example.com.']);
  });

  it('넘김이 끊긴 표 · 사다리 밖 TTL 은 던진다', () => {
    const broken: DnsData = { ...data, servers: data.servers.slice(0, 2) };
    expect(() => walkTree(broken)).toThrow();
    expect(() => planRound(data, 45)).toThrow();
  });

  for (const ttl of data.ttlLadder) {
    it(`TTL ${ttl} — 알고리즘 · IR · 실측표가 같다`, () => {
      const got = totalsOf(ttl);
      const [q, h, s, m, held] = TABLE[ttl]!;
      expect([got.queries, got.hits, got.stale, got.misses, got.held]).toEqual([q, h, s, m, held]);
      const tally = [0, 0];
      const ret = runIR(dnsImperativeIR, 'resolveAll', [
        data.questionCount,
        data.askEverySec,
        ttl,
        data.changeAtSec,
        walkTree(data).length,
        tally,
      ]);
      expect(ret).toBe(got.queries);
      expect(tally).toEqual([got.hits, got.stale]);
      expect(got.windows.length).toBe(7);
      expect(got.windows.map((w) => w.questions.length)).toEqual([1, 5, 5, 5, 5, 5, 4]);
      expect(got.windows.map(lastPhaseOf)).toEqual(PHASES[ttl]);
    });
  }

  it('TTL 60 의 걸음 차례가 사양과 같다', () => {
    const w = planRound(data, 60).windows;
    expect(w.map((x) => x.totals.queries)).toEqual([4, 4, 5, 6, 7, 8, 8]);
    expect(w.map((x) => x.totals.stale)).toEqual([0, 0, 0, 3, 5, 5, 5]);
  });

  it('회차별 계기 — 60 → 300 → 60', async () => {
    const inputs = [300, 60].map((v) => ({ type: 'ttl', payload: { value: v, segmentIndex: data.ttlLadder.indexOf(v), ttl: String(v) } }));
    const totals = new Map<string, number>();
    const rounds: Record<string, number>[] = [];
    let cancelled = false;
    let done!: () => void;
    const finished = new Promise<void>((r) => (done = r));
    const snap = () => rounds.push(Object.fromEntries(totals));
    const ctx = {
      data: JSON.parse(JSON.stringify(data)) as DnsData,
      get cancelled() {
        return cancelled;
      },
      metric(name: string, delta: number | 'inc') {
        totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async emit(_e: FacetRuntimeEvent) {},
      async sleep() {
        return !cancelled;
      },
      async waitForInput() {
        snap();
        const next = inputs.shift();
        if (!next) {
          cancelled = true;
          done();
          return new Promise<never>(() => {});
        }
        return next;
      },
      pollInput() {
        return null;
      },
    };
    void dnsAlgorithm(ctx as never);
    await finished;
    expect(rounds).toEqual([
      { 'server-queries': 8, 'cache-hits': 25, 'stale-answers': 5 },
      { 'server-queries': 4, 'cache-hits': 29, 'stale-answers': 17 },
      { 'server-queries': 8, 'cache-hits': 25, 'stale-answers': 5 },
    ]);
  });

  it('무대가 마운트되고 판 하나를 즉시 모드로 그린다', async () => {
    const container = document.createElement('div');
    const inst = mountView(dnsStageView, container, { config: { type: 'dns-stage' }, initialData: data, isInstant: () => true }) as unknown as {
      beginRound: (...a: unknown[]) => Promise<void>;
      playWindow: (...a: unknown[]) => Promise<void>;
      destroy: () => void;
    };
    const r = planRound(data, 60);
    await inst.beginRound(
      { ttl: 60, maxTtl: 300, name: data.name, playEndSec: r.playEndSec, questionSecs: r.questionSecs, answerBefore: data.answerBefore, path: r.path },
      'x',
      0,
    );
    for (const w of r.windows) await inst.playWindow(w, 'y', 0);
    expect(container.textContent).toContain('192.0.2.90');
    inst.destroy();
  });
});
