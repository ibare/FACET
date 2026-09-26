// @vitest-environment happy-dom
/**
 * LFU 캐시 — facet 고유의 주장: 사양 표 대조 · IR ↔ algorithm 전 조합 · 섞기 검수 · 걸음마다 phase · 첫 그림 멱등.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  lfuCacheAlgorithm,
  lfuCacheFacet,
  lfuCacheImperativeIR,
  lfuCacheProjector,
  lfuCacheStageView,
  readLfuCacheData,
  simulateLfu,
  type LfuCacheData,
} from '../src/index.js';

const data = readLfuCacheData(lfuCacheFacet.initialData);

/** 사양 실측표 — 창 → [뒤 판 적중, 옛 키 자리, /event 밀려난 걸음, 횟수 동률이 걸린 밀어냄] */
const SPEC: Record<number, [number, number, number | null, number]> = {
  0: [8, 48, null, 8],
  32: [11, 30, 43, 9],
  16: [13, 17, 35, 8],
  8: [10, 6, 26, 28],
  4: [6, 4, 7, 33],
};

function ids(reqs: string[], order?: string[]): { reqs: number[]; distinct: number } {
  const keys = order ?? [...new Set(reqs)];
  const ix = new Map(keys.map((k, n) => [k, n]));
  return {
    reqs: reqs.map((r) => {
      const n = ix.get(r);
      if (n === undefined) throw new Error(`번호 없는 경로 ${r}`);
      return n;
    }),
    distinct: keys.length,
  };
}

function shuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let x = seed;
  for (let i = a.length - 1; i > 0; i--) {
    x = (75 * x + 74) % 65537;
    const j = Math.floor((x * (i + 1)) / 65537);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const segments = (): number[] => {
  const controls = (lfuCacheFacet.blocks.controls as { controls: unknown[] }).controls;
  const knob = controls.find(
    (c): c is { name: string; segments: { value: number; default?: boolean }[] } =>
      typeof c === 'object' && c !== null && (c as { name?: unknown }).name === 'window',
  );
  if (!knob) throw new Error('window 손잡이가 없다');
  return knob.segments.map((s) => s.value);
};

describe('lfu-cache 데이터와 사다리', () => {
  it('요청 60 · 사다리 끝값 4 · segments 와 같다 · 기본 0', () => {
    expect(data.requests).toHaveLength(60);
    expect(data.windows).toEqual([0, 32, 16, 8, 4]);
    expect(data.windows[data.windows.length - 1]).toBe(4);
    expect(segments()).toEqual(data.windows);
    expect(data.defaultWindow).toBe(0);
    expect(new Set(data.requests).size).toBe(31);
  });
});

describe('lfu-cache 사양 표 대조', () => {
  for (const w of [0, 32, 16, 8, 4]) {
    it(`창 ${w}`, () => {
      const run = simulateLfu(data, w);
      const [hits, old, out, ties] = SPEC[w];
      expect(run.lateHits).toBe(hits);
      expect(run.oldKeySlots).toBe(old);
      expect(run.hotOutStep).toBe(out);
      expect(run.ties).toBe(ties);
      expect(run.steps).toHaveLength(60);
      // 세 phase 가 모두 걸린다
      expect(new Set(run.steps.map((s) => s.kind))).toEqual(new Set(['hit', 'fill', 'evict']));
    });
  }
  it('끝없음의 걸음 차례 — 21 에 /p3, 22 에 /book, 29 에 /p1 이 밀려나고 /event(10) 는 남는다', () => {
    const run = simulateLfu(data, 0);
    expect(run.steps[20].victim).toBe('/p3');
    expect(run.steps[21].victim).toBe('/book');
    expect(run.steps[28].victim).toBe('/p1');
    const last = run.steps[59].slots;
    expect(last.find((s) => s.key === '/event')?.count).toBe(10);
  });
  it('창 음수는 던진다', () => {
    expect(() => simulateLfu(data, -1)).toThrow();
  });
});

describe('lfu-cache IR ↔ algorithm', () => {
  const base = ids(data.requests);
  it('창 다섯에서 lateHits = 뒤 판 적중', () => {
    for (const w of data.windows) {
      const got = runIR(lfuCacheImperativeIR, 'lateHits', [
        base.reqs,
        w,
        data.lateFrom - 1,
        data.capacity,
        new Array(data.capacity).fill(0),
        new Array(base.distinct).fill(0),
      ]);
      expect(got).toBe(simulateLfu(data, w).lateHits);
    }
  });
  it('밀어냄 걸음마다 pickVictim 이 가리키는 칸의 키 = algorithm 이 밀어낸 키', () => {
    const keys = [...new Set(data.requests)];
    for (const w of data.windows) {
      const run = simulateLfu(data, w);
      const cache: number[] = [];
      const lastUsed = new Array(base.distinct).fill(-1);
      run.steps.forEach((s, i) => {
        if (s.kind === 'evict') {
          const slot = runIR(lfuCacheImperativeIR, 'pickVictim', [
            [...cache],
            data.capacity,
            base.reqs,
            i,
            w,
            [...lastUsed],
          ]);
          expect(typeof slot).toBe('number');
          expect(keys[cache[slot as number]]).toBe(s.victim);
          expect(slot).toBe(s.slot);
        }
        // 다음 걸음의 캐시 — algorithm 의 칸 그대로
        cache.length = 0;
        for (const x of s.slots) {
          if (x.key === null) cache.push(-1);
          else cache.push(keys.indexOf(x.key));
        }
        lastUsed[base.reqs[i]] = i;
      });
    }
  });
  it('섞기 검수 — 경로 번호를 섞어도 답이 같다', () => {
    const keys = [...new Set(data.requests)];
    for (const w of data.windows) {
      const want = simulateLfu(data, w).lateHits;
      for (const seed of [1, 7, 42, 99]) {
        const mixed = ids(data.requests, shuffle(keys, seed));
        const got = runIR(lfuCacheImperativeIR, 'lateHits', [
          mixed.reqs,
          w,
          data.lateFrom - 1,
          data.capacity,
          new Array(data.capacity).fill(0),
          new Array(mixed.distinct).fill(0),
        ]);
        expect(got).toBe(want);
      }
    }
  });
  it('창 −1 → IR 은 −1, TS 는 던진다', () => {
    const got = runIR(lfuCacheImperativeIR, 'lateHits', [
      base.reqs,
      -1,
      data.lateFrom - 1,
      data.capacity,
      new Array(data.capacity).fill(0),
      new Array(base.distinct).fill(0),
    ]);
    expect(got).toBe(-1);
    expect(() => simulateLfu(data, -1)).toThrow();
  });
});

/** 손잡이 값 차례대로 판을 돌려 이벤트와 계기를 모은다. */
async function play(windows: number[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const perRun: Map<string, number>[] = [];
  // 첫 판은 늘 기본 창이다 — windows[0] 이 기본이 아니면 기본 판을 한 번 돌리고 버린다
  const skip = windows[0] === data.defaultWindow ? 0 : 1;
  const inputs = windows.slice(1 - skip);
  let cancelled = false;
  const ctx = {
    data: lfuCacheFacet.initialData as LfuCacheData,
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
      return true;
    },
    async waitForInput() {
      perRun.push(new Map(metrics));
      const next = inputs.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'window', payload: { value: 0 } };
      }
      return { type: 'window', payload: { value: next, segmentIndex: 0 } };
    },
    pollInput() {
      return null;
    },
  };
  await lfuCacheAlgorithm(ctx as never);
  const inits = events.map((e, i) => (e.type === 'init' ? i : -1)).filter((i) => i >= 0);
  expect(inits).toHaveLength(windows.length + skip);
  const kept = events.slice(inits[skip]);
  kept.forEach((e, i) => {
    if (e.type === 'init') expect((e.payload as { window: number }).window).toBe(windows[inits.indexOf(inits[skip] + i) - skip]);
  });
  return { events: kept, perRun: perRun.slice(skip) };
}

describe('lfu-cache 재생', () => {
  it('회차별 계기 — 0 → 16 → 4 → 0 이 사양 표와 같다 (판마다 쌓이지 않는다)', async () => {
    const order = [0, 16, 4, 0];
    const { perRun } = await play(order);
    expect(perRun).toHaveLength(4);
    perRun.forEach((m, k) => {
      expect(m.get('late-hits')).toBe(SPEC[order[k]][0]);
      expect(m.get('old-key-slots')).toBe(SPEC[order[k]][1]);
    });
  });
  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 다 · 걸음은 silent 가 아니다 · 60 걸음', async () => {
    const { events } = await play([8]);
    const reqs = events.filter((e) => e.type === 'request');
    expect(reqs).toHaveLength(60);
    events.forEach((e, i) => {
      if (e.type !== 'request') return;
      expect(e.silent).not.toBe(true);
      const prev = events[i - 1];
      expect(prev.type).toBe('phase');
      expect(prev.silent).toBe(true);
      expect((prev.payload as { phase: string }).phase).toBe((e.payload as { kind: string }).kind);
    });
    expect(events[0].type).toBe('init');
    expect(events[0].silent).toBe(true);
  });
  it('모든 창에서 hit · fill · evict phase 가 켜진다', async () => {
    for (const w of data.windows) {
      const { events } = await play([w]);
      const phases = new Set(
        events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
      );
      expect(phases).toEqual(new Set(['hit', 'fill', 'evict']));
    }
  });
});

describe('lfu-cache 무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같고, onReset 이 무대를 비운다', async () => {
    const { events } = await play([16]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(lfuCacheStageView, container, { config: {}, locale: 'ko', isInstant: () => true });
    const projector = lfuCacheProjector({ stage }, { getSpeed: () => 1, t: (_k, fb) => fb });
    const init = events[0];
    projector.onEvent(init);
    const once = container.querySelectorAll('*').length;
    projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    for (const e of events.slice(1, 40)) projector.onEvent(e);
    projector.onReset?.();
    projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    stage.destroy();
  });
  it('앞 판의 표지 자리만 점선으로 남는다 — A → 끝없음 → B 에서 두 판 전 자리가 남지 않는다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(lfuCacheStageView, container, { config: {}, isInstant: () => true });
    const projector = lfuCacheProjector({ stage }, { getSpeed: () => 1, t: (_k, fb) => fb });
    const ghosts = () => container.querySelectorAll('[data-role="hot-ghost"]');
    const hotAt = () => {
      const g = [...container.querySelectorAll('g')].find((x) => x.getAttribute('visibility') === 'visible');
      return g?.getAttribute('transform') ?? null;
    };
    const { events } = await play([32, 0, 16]);
    const inits = events.map((e, i) => (e.type === 'init' ? i : -1)).filter((i) => i >= 0);
    expect(inits).toHaveLength(3);
    const feed = (a: number, b: number) => events.slice(a, b).forEach((e) => projector.onEvent(e));
    // 32 판 — 표지는 걸음 43 에 선다
    feed(inits[0], inits[1]);
    expect(ghosts()).toHaveLength(0);
    const at32 = hotAt();
    expect(at32).not.toBeNull();
    // 끝없음 판 — 32 판의 자리가 점선으로 남고, 이 판의 표지는 서지 않는다
    projector.onEvent(events[inits[1]]);
    expect(ghosts()).toHaveLength(1);
    expect(ghosts()[0].getAttribute('transform')).toBe(at32);
    feed(inits[1] + 1, inits[2]);
    expect(hotAt()).toBeNull();
    // 16 판 — 앞 판(끝없음)은 끝까지 남았으니 점선이 없다 (43 자리가 남지 않는다)
    projector.onEvent(events[inits[2]]);
    expect(ghosts()).toHaveLength(0);
    feed(inits[2] + 1, events.length);
    expect(hotAt()).not.toBe(at32);
    stage.destroy();
  });
  it('모르는 이벤트는 던진다', () => {
    const container = document.createElement('div');
    const stage = mountView(lfuCacheStageView, container, { config: {} });
    const projector = lfuCacheProjector({ stage }, { getSpeed: () => 1, t: (_k, fb) => fb });
    expect(() => projector.onEvent({ type: 'nope' })).toThrow();
    expect(() => projector.onEvent({ type: 'request', payload: {} })).toThrow();
    stage.destroy();
  });
});
