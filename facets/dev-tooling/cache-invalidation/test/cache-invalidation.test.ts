// @vitest-environment happy-dom
/**
 * cache-invalidation 고유 검수 — 사양 실측표 대조 · 회차별 계기 · 사다리 · 무대 글자.
 * IR 을 두지 않으므로(irs.ts 의 주석) IR ↔ algorithm 대조 대신 빈 배열을 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  cacheInvalidationAlgorithm,
  cacheInvalidationFacet,
  cacheInvalidationIRs,
  cacheInvalidationProjector,
  cacheInvalidationStageView,
  computeRound,
  fnv1a,
  type CacheInvalidationData,
} from '../src/index.js';

const data = cacheInvalidationFacet.initialData as CacheInvalidationData;
const short = (s: string): string => s.slice(0, 6);

// 사양 실측표 (measure.py) — [층 차례, 바뀐 파일, cached, redone, 다시 드는 초, 첫 바뀐 층 자리, 다시 하는 층]
const TABLE: [number, number, number, number, number, number, string[]][] = [
  [0, 0, 3, 3, 31, 4, ['copy-src', 'build', 'test']],
  [0, 1, 1, 5, 92, 2, ['copy-deps', 'install', 'copy-src', 'build', 'test']],
  [1, 0, 1, 5, 92, 2, ['copy-src', 'copy-deps', 'install', 'build', 'test']],
  [1, 1, 2, 4, 91, 3, ['copy-deps', 'install', 'build', 'test']],
];

// 층마다 열쇠 앞 여섯 자 (지난번 → 이번), 사양의 행 차례
const KEYS: string[][] = [
  ['ef227b ef227b', '356a3c 356a3c', 'df9f90 df9f90', 'f6e06a d66d31', '2276a3 22e33f', 'c40932 555b65'],
  ['ef227b ef227b', '356a3c 0e2e00', 'df9f90 bd4eef', 'f6e06a c93052', '2276a3 e8c42a', 'c40932 8eedc2'],
  ['ef227b ef227b', 'f64185 440291', 'd67ab4 5a2676', 'd136c6 b5219f', '84e3d8 7defe1', '72db41 9b8234'],
  ['ef227b ef227b', 'f64185 f64185', 'd67ab4 126cc6', 'd136c6 855bbd', '84e3d8 c260c6', '72db41 7449c1'],
];

describe('cache-invalidation — 사양 대조', () => {
  it('파일 지문', () => {
    expect(fnv1a('show greet()')).toBe('1e7cccc2');
    expect(fnv1a('show greet("hi")')).toBe('90884429');
    expect(fnv1a('left-pad 1.0')).toBe('5472b1fd');
    expect(fnv1a('left-pad 1.1')).toBe('5372b06a');
  });

  it('네 칸 모두 실측표 · 열쇠와 같다', () => {
    TABLE.forEach(([order, changed, cached, redone, seconds, first, redoneIds], row) => {
      const r = computeRound(data, order, changed);
      expect(r.cached).toBe(cached);
      expect(r.redone).toBe(redone);
      expect(r.redoSeconds).toBe(seconds);
      expect(r.firstChanged).toBe(first);
      expect(r.allSeconds).toBe(92);
      expect(r.layers.filter((l) => l.verdict !== 'cached').map((l) => l.id)).toEqual(redoneIds);
      expect(r.layers.map((l) => `${short(l.prevKey)} ${short(l.newKey)}`)).toEqual(KEYS[row]);
      // 다시 = 층 수 − 첫 바뀐 층 자리 + 1
      expect(r.redone).toBe(r.layers.length - r.firstChanged + 1);
      // 첫 바뀐 층만 제 파일, 그 뒤는 앞 층
      r.layers.forEach((l, i) => {
        if (i < first - 1) expect(l.verdict).toBe('cached');
        else if (i === first - 1) expect(l.verdict).toBe('own-file');
        else expect(l.verdict).toBe('prev-layer');
      });
    });
  });

  it('IR 은 두지 않는다', () => {
    expect(cacheInvalidationIRs).toEqual([]);
  });
});

describe('cache-invalidation — 사다리', () => {
  const controls = (cacheInvalidationFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
  const knob = (action: string): { value: number; default?: boolean }[] => {
    const c = controls.find((x) => x.action === action);
    if (c === undefined) throw new Error(`손잡이 ${action} 이 없다`);
    return c.segments as { value: number; default?: boolean }[];
  };

  it('layer-order 는 orders 의 순번', () => {
    expect(data.orders).toHaveLength(2);
    expect(knob('layer-order').map((s) => s.value)).toEqual(data.orders.map((_, i) => i));
    expect(knob('layer-order').findIndex((s) => s.default === true)).toBe(data.initialOrder);
  });

  it('changed-file 은 files 의 순번', () => {
    expect(data.files.map((f) => f.name)).toEqual(['app.src', 'deps.txt']);
    expect(knob('changed-file').map((s) => s.value)).toEqual(data.files.map((_, i) => i));
    expect(knob('changed-file').findIndex((s) => s.default === true)).toBe(data.initialChanged);
  });
});

type Input = { type: string; payload?: unknown };

async function play(inputs: Input[]): Promise<{ events: FacetRuntimeEvent[]; rounds: Record<string, number>[] }> {
  const events: FacetRuntimeEvent[] = [];
  const totals = new Map<string, number>();
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
      if (e.type === 'redo-seconds') rounds.push(Object.fromEntries(totals));
    },
    metric(name: string, delta: number | 'inc') {
      const d = delta === 'inc' ? 1 : delta;
      totals.set(name, (totals.get(name) ?? 0) + d);
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
  };
  await cacheInvalidationAlgorithm(ctx as never);
  return { events, rounds };
}

describe('cache-invalidation — 회차별 계기', () => {
  it('층 차례 1 → 0 → 1 (app.src)', async () => {
    const { rounds } = await play([
      { type: 'layer-order', payload: { value: 0 } },
      { type: 'layer-order', payload: { value: 1 } },
    ]);
    expect(rounds).toEqual([
      { cached: 1, redone: 5, 'redo-seconds': 92 },
      { cached: 3, redone: 3, 'redo-seconds': 31 },
      { cached: 1, redone: 5, 'redo-seconds': 92 },
    ]);
  });

  it('바뀐 파일 app.src → deps.txt → app.src (소스 먼저), 모르는 입력은 흘린다', async () => {
    const { rounds, events } = await play([
      { type: 'changed-file', payload: { value: 1 } },
      { type: 'something-else', payload: { value: 0 } },
      { type: 'changed-file', payload: { value: 0 } },
    ]);
    expect(rounds).toEqual([
      { cached: 1, redone: 5, 'redo-seconds': 92 },
      { cached: 2, redone: 4, 'redo-seconds': 91 },
      { cached: 1, redone: 5, 'redo-seconds': 92 },
    ]);
    // 한 판은 걸음 넷
    expect(events.map((e) => e.type).slice(0, 4)).toEqual(['round-start', 'file-changed', 'cascade', 'redo-seconds']);
  });
});

describe('cache-invalidation — 틀린 손잡이 값', () => {
  it('사다리 밖 값은 던진다', async () => {
    await expect(play([{ type: 'changed-file', payload: { value: 7 } }])).rejects.toThrow(/사다리/);
  });
});

describe('cache-invalidation — 무대', () => {
  it('projector 를 거쳐 한 판을 그린다 — 캡션과 화면의 수가 같다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(cacheInvalidationStageView, container, {
      config: { type: 'cache-invalidation-stage' },
      initialData: data,
      locale: 'en',
    });
    const projector = cacheInvalidationProjector({ stage }, { getSpeed: () => 1000, t: (_k, f, v) => fill(f, v) });
    const { events } = await play([{ type: 'layer-order', payload: { value: 0 } }]);
    // 둘째 판(의존 먼저 × app.src)까지 그린다
    for (const e of events) await projector.onEvent(e);
    await new Promise((r) => setTimeout(r, 50));
    const texts = Array.from(container.querySelectorAll('text')).map((n) => n.textContent ?? '');
    expect(texts).toContain('Seconds of redone layers: 1 + 20 + 10');
    expect(texts).toContain('31 s');
    expect(texts.filter((s) => s.startsWith('Redo ·'))).toHaveLength(3);
    expect(texts.filter((s) => s === 'Cached')).toHaveLength(3);
    stage.destroy();
  });
});

function fill(text: string, vars?: Record<string, string | number>): string {
  let out = text;
  for (const [k, v] of Object.entries(vars ?? {})) out = out.split(`{${k}}`).join(String(v));
  return out;
}
