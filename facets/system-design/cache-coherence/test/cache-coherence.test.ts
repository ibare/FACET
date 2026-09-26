// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  cacheCoherenceAlgorithm,
  cacheCoherenceFacet,
  cacheCoherenceImperativeIR,
  cacheCoherenceProjector,
  cacheCoherenceStageView,
  coherenceTileAxis,
  readCoherenceData,
  simulateCoherence,
  type CacheCoherenceData,
  type CoherenceStage,
} from '../src/index.js';

const data = readCoherenceData(cacheCoherenceFacet.initialData);

/** 사양 실측표 — 잇단 쓰기 · 없음·옛값 · 없음·통 · 무효화·통 · 무효화·DB · 갱신·통 · 갱신·DB · 걸음 수 · 끝 DB */
const SPEC: [number, number, number, number, number, number, number, number, number][] = [
  [1, 12, 0, 12, 12, 12, 0, 16, 46],
  [2, 12, 0, 12, 12, 24, 0, 20, 42],
  [3, 12, 0, 12, 12, 36, 0, 24, 38],
  [4, 12, 0, 12, 12, 48, 0, 28, 34],
  [6, 12, 0, 12, 12, 72, 0, 36, 26],
];

function irRun(
  policy: number,
  run: number,
  writer: number,
  readers: number[],
  servers = 4,
): { messages: number; result: number[] } {
  const result = [0, 0, 0];
  const cache = new Array<number>(servers).fill(0);
  const messages = runIR(cacheCoherenceImperativeIR, 'coherence', [
    policy,
    run,
    data.rounds,
    data.start,
    writer,
    readers,
    cache,
    result,
  ]);
  if (typeof messages !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { messages, result };
}

const writerIndex = data.servers.indexOf(data.writer);
const readerIndex = data.readers.map((s) => data.servers.indexOf(s));

describe('cache-coherence 데이터와 사다리', () => {
  it('서버 넷 · 판 넷 · 사다리 끝값 6 · 사다리 = segments', () => {
    expect(data.servers).toHaveLength(4);
    expect(data.rounds).toBe(4);
    expect(data.runs[data.runs.length - 1]).toBe(6);
    const controls = (cacheCoherenceFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] })
      .controls;
    const notify = controls.find((c) => c.action === 'notify');
    const run = controls.find((c) => c.action === 'run');
    expect(notify?.segments?.map((s) => s.value)).toEqual(data.notifies);
    expect(run?.segments?.map((s) => s.value)).toEqual(data.runs);
    expect(notify?.segments?.find((s) => s.default)?.value).toBe(data.defaultNotify);
    expect(run?.segments?.find((s) => s.default)?.value).toBe(data.defaultRun);
    expect(coherenceTileAxis(data)).toBe(72);
  });
});

describe('cache-coherence 셈 — 사양 표 · IR 대조', () => {
  it('15 조합 모두 사양 표와 같다', () => {
    for (const [run, noneStale, noneMsg, invMsg, invDb, updMsg, updDb, steps, endDb] of SPEC) {
      const none = simulateCoherence(data, 0, run);
      const inv = simulateCoherence(data, 1, run);
      const upd = simulateCoherence(data, 2, run);
      expect(none.totals).toEqual({ messages: noneMsg, dbReads: 0, staleReads: noneStale });
      expect(inv.totals).toEqual({ messages: invMsg, dbReads: invDb, staleReads: 0 });
      expect(upd.totals).toEqual({ messages: updMsg, dbReads: updDb, staleReads: 0 });
      for (const p of [none, inv, upd]) {
        expect(p.steps).toHaveLength(steps);
        expect(p.endDb).toBe(endDb);
      }
    }
  });

  it('IR 의 result 셋이 15 조합 모두 algorithm 의 계기 셋과 같다', () => {
    for (const policy of data.notifies) {
      for (const run of data.runs) {
        const { totals } = simulateCoherence(data, policy, run);
        const ir = irRun(policy, run, writerIndex, readerIndex);
        expect(ir.result).toEqual([totals.staleReads, totals.messages, totals.dbReads]);
        expect(ir.messages).toBe(totals.messages);
      }
    }
  });

  it('섞기 검수 — 쓰는 서버 번호를 바꾸고 읽는 차례를 섞어도 셋이 같다', () => {
    const layouts: [number, number[]][] = [
      [0, [1, 2, 3]],
      [2, [3, 0, 1]],
      [3, [1, 0, 2]],
      [1, [3, 2, 0]],
    ];
    for (const policy of data.notifies) {
      for (const run of data.runs) {
        const base = irRun(policy, run, writerIndex, readerIndex).result;
        for (const [writer, readers] of layouts) {
          expect(irRun(policy, run, writer, readers).result).toEqual(base);
        }
        // TS 쪽도 같은 셈 — 이름을 바꿔 붙이고 읽는 차례를 뒤집는다.
        const shuffled: CacheCoherenceData = {
          ...data,
          servers: ['api-3', 'api-1', 'api-4', 'api-2'],
          readers: [...data.readers].reverse(),
        };
        const a = simulateCoherence(shuffled, policy, run).totals;
        expect([a.staleReads, a.messages, a.dbReads]).toEqual(base);
      }
    }
  });

  it('모르는 policy · 벗어난 잇단 쓰기 — TS 는 던지고 IR 은 −1', () => {
    expect(irRun(3, 3, writerIndex, readerIndex).messages).toBe(-1);
    expect(irRun(-1, 3, writerIndex, readerIndex).messages).toBe(-1);
    expect(irRun(1, 0, writerIndex, readerIndex).messages).toBe(-1);
    expect(() => simulateCoherence(data, 3, 3)).toThrow();
    expect(() => simulateCoherence(data, 1, 0)).toThrow();
  });

  it('무효화 통은 판의 첫 쓰기에만 난다 — 규칙이 아니라 셈의 결과', () => {
    for (const run of data.runs) {
      const writes = simulateCoherence(data, 1, run).steps.filter((s) => s.kind === 'write');
      for (const w of writes) {
        if (w.kind !== 'write') continue;
        expect(w.targets.length).toBe(w.index === 1 ? 3 : 0);
        expect(w.carry).toBeNull();
      }
    }
  });
});

type Input = { type: string; payload?: unknown };

async function drive(inputs: Input[]): Promise<{ events: FacetRuntimeEvent[]; ends: Record<string, number>[] }> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const ends: Record<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: structuredClone(cacheCoherenceFacet.initialData) as CacheCoherenceData,
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
    async waitForInput() {
      ends.push(Object.fromEntries(metrics));
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        return { type: 'end' };
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await cacheCoherenceAlgorithm(ctx as never);
  return { events, ends };
}

describe('cache-coherence 재생', () => {
  it('회차별 계기 — 무효화 → 갱신 → 무효화 → 잇단 6 → 알림 없음', async () => {
    const { ends } = await drive([
      { type: 'notify', payload: { value: 2 } },
      { type: 'notify', payload: { value: 1 } },
      { type: 'run', payload: { value: 6 } },
      { type: 'notify', payload: { value: 0 } },
      { type: 'run', payload: { value: 5 } }, // 사다리 밖 — 흘린다
    ]);
    expect(ends).toEqual([
      { messages: 12, 'db-reads': 12, 'stale-reads': 0 },
      { messages: 36, 'db-reads': 0, 'stale-reads': 0 },
      { messages: 12, 'db-reads': 12, 'stale-reads': 0 },
      { messages: 12, 'db-reads': 12, 'stale-reads': 0 },
      { messages: 0, 'db-reads': 0, 'stale-reads': 12 },
      // 사다리 밖 값은 흘려 판을 다시 돌리지 않는다 — 같은 끝 값에서 또 기다린다
      { messages: 0, 'db-reads': 0, 'stale-reads': 12 },
    ]);
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 다 · 기본값에서 write · invalidate · refill 이 켜진다', async () => {
    const { events } = await drive([]);
    const steps = events.filter((e) => !e.silent);
    expect(steps).toHaveLength(24);
    const lit = new Set<string>();
    events.forEach((e, i) => {
      if (e.silent) return;
      const before = events[i - 1];
      expect(before?.type).toBe('phase');
      const phase = (before?.payload as { phase: string }).phase;
      lit.add(phase);
      const p = e.payload as { targets?: number[]; refill?: boolean };
      if (e.type === 'write') expect(phase).toBe((p.targets?.length ?? 0) > 0 ? 'invalidate' : 'write');
      if (e.type === 'read') expect(phase).toBe(p.refill ? 'refill' : 'read');
    });
    expect([...lit].sort()).toEqual(['invalidate', 'refill', 'write']);
    const upd = await drive([{ type: 'notify', payload: { value: 2 } }, { type: 'notify', payload: { value: 0 } }]);
    const all = new Set(upd.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase));
    expect([...all].sort()).toEqual(['invalidate', 'read', 'refill', 'update', 'write']);
  });
});

describe('cache-coherence 무대', () => {
  function mount(): { stage: CoherenceStage; svg: SVGSVGElement } {
    const container = document.createElement('div');
    const stage = mountView(cacheCoherenceStageView, container, {
      config: {},
      initialData: cacheCoherenceFacet.initialData,
      locale: 'ko',
    }) as unknown as CoherenceStage;
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('svg 가 없다');
    return { stage, svg };
  }

  it('첫 그림은 멱등 — 두 번 먹여도, 한 판을 돈 뒤 새 판 머리에서도 요소 수가 같다', async () => {
    const { stage, svg } = mount();
    const proj = cacheCoherenceProjector({ stage }, { getSpeed: () => 1000, t: (_k, f) => f });
    const { events } = await drive([]);
    const init = events[0];
    if (!init) throw new Error('init 이 없다');
    proj.onEvent(init);
    const once = svg.querySelectorAll('*').length;
    proj.onEvent(init);
    expect(svg.querySelectorAll('*').length).toBe(once);
    for (const e of events.slice(1)) proj.onEvent(e);
    proj.onEvent(init);
    expect(svg.querySelectorAll('*').length).toBe(once);
    proj.onReset?.();
    proj.onEvent(init);
    expect(svg.querySelectorAll('*').length).toBe(once);
  });

  it('모르는 이벤트 · 없는 서버는 던진다', async () => {
    const { stage } = mount();
    const proj = cacheCoherenceProjector({ stage });
    expect(() => proj.onEvent({ type: 'mystery', payload: {} })).toThrow();
    const { events } = await drive([]);
    const init = events[0];
    if (!init) throw new Error('init 이 없다');
    proj.onEvent(init);
    const write = events.find((e) => e.type === 'write');
    if (!write) throw new Error('write 가 없다');
    const bad = { ...write, payload: { ...(write.payload as object), targets: [9] } };
    expect(() => proj.onEvent(bad)).toThrow();
  });
});
