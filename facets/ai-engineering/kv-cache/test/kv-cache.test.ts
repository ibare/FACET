// @vitest-environment happy-dom
/**
 * KV 캐시 — 사양 표 대조 · IR ↔ algorithm 전 조합 · phase 동기 · 회차별 계기 · 화면 캡션.
 */

import { describe, expect, it } from 'vitest';
import {
  getAlgorithmMechanismKind,
  makeTranslator,
  mountView,
  type FacetRuntimeEvent,
  type IR,
  type IRStmt,
  type ReactiveContext,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  countKvCache,
  kvCacheAlgorithm,
  kvCacheFacet,
  kvCacheImperativeIR,
  kvCacheProjector,
  kvCacheStageView,
  registerKvCache,
  savedPercent,
  splitWords,
  type KvCacheData,
} from '../src/index.js';

const initial = kvCacheFacet.initialData as unknown as KvCacheData;
const P = splitWords(initial.prompt).length;

/** 사양 표 — [캐시, 만들 토큰, 셈한 K·V 자리, 주의 점수 셈, 끝의 캐시 자리] */
const SPEC: Array<[number, number, number, number, number]> = [
  [0, 2, 17, 81, 0],
  [0, 4, 38, 202, 0],
  [0, 8, 92, 596, 0],
  [0, 16, 248, 2216, 0],
  [1, 2, 9, 45, 9],
  [1, 4, 11, 66, 11],
  [1, 8, 15, 120, 15],
  [1, 16, 23, 276, 23],
];
const SPEC_SAVED: Array<[number, number]> = [
  [2, 47],
  [4, 71],
  [8, 84],
  [16, 91],
];

type Board = {
  cache: number;
  steps: number;
  metrics: Record<string, number>;
  perStep: number[];
  finish: Record<string, unknown>;
};

/** 알고리즘을 가짜 reactive 문맥으로 돌린다. 입력을 다 쓰면 취소한다. */
async function drive(inputs: ReactiveInputEvent[]) {
  const metrics: Record<string, number> = {};
  const events: FacetRuntimeEvent[] = [];
  const emittedPhases = new Set<string>();
  const litAtBoundary = new Set<string>();
  const boards: Board[] = [];
  const queue = [...inputs];
  let lastPhase: string | null = null;
  let cancelled = false;
  let perStep: number[] = [];
  let boardInfo: { cache: number; steps: number } = { cache: -1, steps: -1 };

  const ctx = {
    data: structuredClone(initial),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      const p = (e.payload ?? {}) as Record<string, unknown>;
      if (e.type === 'phase') {
        lastPhase = String(p.phase);
        emittedPhases.add(lastPhase);
      }
      if (e.type === 'board') {
        boardInfo = { cache: Number(p.cache), steps: Number(p.steps) };
        perStep = [];
      }
      if (e.type === 'step') perStep.push(Number(p.computed));
      if (e.type === 'finish') {
        boards.push({ ...boardInfo, metrics: { ...metrics }, perStep: [...perStep], finish: p });
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      if (lastPhase !== null) litAtBoundary.add(lastPhase);
      return !cancelled;
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<KvCacheData>;

  await kvCacheAlgorithm(ctx);
  return { boards, events, emittedPhases, litAtBoundary, metrics };
}

const knob = (type: 'cache' | 'steps', value: number): ReactiveInputEvent => ({
  type,
  payload: { value, segmentIndex: 0 },
});

/** 여덟 조합을 모두 지나는 입력 — 처음은 기본(끔 · 8) */
function allCombos(): ReactiveInputEvent[] {
  const seq: ReactiveInputEvent[] = [];
  for (const c of [0, 1]) {
    seq.push(knob('cache', c));
    for (const s of [2, 4, 8, 16]) seq.push(knob('steps', s));
  }
  return seq;
}

function collectPhases(stmts: IRStmt[], into: Set<string>) {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') into.add(s.phase);
    if (s.kind === 'if') {
      collectPhases(s.then, into);
      if (s.else) collectPhases(s.else, into);
    }
    if (s.kind === 'for-range' || s.kind === 'while') collectPhases(s.body, into);
  }
}

function irPhases(ir: IR): Set<string> {
  const set = new Set<string>();
  for (const f of ir.functions) collectPhases(f.body, set);
  return set;
}

describe('KV 캐시 — 셈', () => {
  it('프롬프트는 낱말 여덟, 이어짐은 열여섯', () => {
    expect(P).toBe(8);
    expect(splitWords(initial.continuation)).toHaveLength(16);
  });

  it.each(SPEC)('캐시 %i · 만들 토큰 %i → K·V %i · 점수 %i · 캐시 %i', (cache, steps, kv, scores, size) => {
    const c = countKvCache(P, steps, cache);
    expect([c.kv, c.scores, c.cacheSize]).toEqual([kv, scores, size]);
    if (cache === 1) {
      expect(c.perStep).toEqual([8, ...Array(steps - 1).fill(1)]);
      // 캐시 켬에서 셈한 자리와 캐시 자리가 같은 수다
      expect(c.kv).toBe(c.cacheSize);
    } else {
      expect(c.perStep).toEqual(Array.from({ length: steps }, (_, i) => 8 + i));
    }
  });

  it.each(SPEC_SAVED)('만들 토큰 %i 에서 아낀 몫 %i %', (steps, pct) => {
    expect(savedPercent(countKvCache(P, steps, 0).kv, countKvCache(P, steps, 1).kv)).toBe(pct);
  });
});

describe('KV 캐시 — 알고리즘', () => {
  it('처음 판(기본 끔 · 8)과 여덟 조합의 계기가 사양 표와 같다', async () => {
    const { boards } = await drive(allCombos());
    // 처음 판 + 입력 열 (캐시 두 번 · 만들 토큰 여덟 번)
    expect(boards).toHaveLength(11);
    expect(new Set(boards.map((b) => `${b.cache}:${b.steps}`)).size).toBe(8);
    expect(boards[0].cache).toBe(0);
    expect(boards[0].steps).toBe(8);
    for (const b of boards) {
      const row = SPEC.find(([c, s]) => c === b.cache && s === b.steps);
      expect(row).toBeDefined();
      const [, , kv, scores, size] = row!;
      expect(b.metrics).toEqual({ 'kv-compute-count': kv, 'score-count': scores, 'cache-size': size });
      expect(b.perStep).toEqual(countKvCache(P, b.steps, b.cache).perStep);
      if (b.cache === 1) {
        const pct = SPEC_SAVED.find(([s]) => s === b.steps)![1];
        expect(b.finish.savedPct).toBe(pct);
        expect(b.finish.kvWithout).toBe(SPEC.find(([c, s]) => c === 0 && s === b.steps)![2]);
      }
    }
  });

  it('회차별 — 손잡이를 A → B → A 로 돌려도 계기가 쌓이지 않는다', async () => {
    const { boards } = await drive([
      knob('cache', 1), // 켬 · 8
      knob('cache', 0), // 끔 · 8
      knob('cache', 1), // 켬 · 8
      knob('steps', 16), // 켬 · 16
      knob('steps', 2), // 켬 · 2
      knob('steps', 16), // 켬 · 16
    ]);
    const got = boards.map((b) => [b.cache, b.steps, b.metrics['kv-compute-count'], b.metrics['score-count'], b.metrics['cache-size']]);
    expect(got).toEqual([
      [0, 8, 92, 596, 0],
      [1, 8, 15, 120, 15],
      [0, 8, 92, 596, 0],
      [1, 8, 15, 120, 15],
      [1, 16, 23, 276, 23],
      [1, 2, 9, 45, 9],
      [1, 16, 23, 276, 23],
    ]);
  });

  it('처음 판에서 계기 이름 셋이 모두 실린다 (끔의 cache-size 0 포함)', async () => {
    const { boards } = await drive([]);
    expect(Object.keys(boards[0].metrics).sort()).toEqual(['cache-size', 'kv-compute-count', 'score-count']);
  });

  it('사다리 밖 · 남의 입력 · 문자열 값은 흘린다', async () => {
    const { boards } = await drive([
      knob('steps', 3),
      { type: 'other', payload: { value: 1 } },
      { type: 'cache', payload: { value: '1' } },
      knob('cache', 1),
    ]);
    expect(boards.map((b) => [b.cache, b.steps])).toEqual([
      [0, 8],
      [1, 8],
    ]);
  });
});

describe('KV 캐시 — IR', () => {
  it.each(SPEC)('캐시 %i · 만들 토큰 %i — IR 의 답이 알고리즘 계기와 같다', async (cache, steps) => {
    const { boards } = await drive([knob('cache', cache), knob('steps', steps)]);
    const b = boards[boards.length - 1];
    expect([b.cache, b.steps]).toEqual([cache, steps]);
    expect(runIR(kvCacheImperativeIR, 'kvCompute', [P, steps, cache])).toBe(b.metrics['kv-compute-count']);
    expect(runIR(kvCacheImperativeIR, 'scoreCount', [P, steps, cache])).toBe(b.metrics['score-count']);
  });

  it('phase 집합 — 알고리즘 = IR, 걸음 경계마다 켜진 것 = IR', async () => {
    const { emittedPhases, litAtBoundary } = await drive(allCombos());
    const ir = irPhases(kvCacheImperativeIR);
    expect([...emittedPhases].sort()).toEqual([...ir].sort());
    expect([...litAtBoundary].sort()).toEqual([...ir].sort());
  });

  it('32 비트 — 사다리와 프롬프트가 커지면 여기서 먼저 깨진다', () => {
    expect(P).toBe(8);
    expect(Math.max(...initial.stepsLadder)).toBe(16);
    const maxSeen = P + 16 - 1;
    expect(maxSeen * (maxSeen + 1)).toBe(552);
    expect(countKvCache(P, 16, 0).scores).toBe(2216);
    expect(countKvCache(P, 16, 0).scores).toBeLessThan(2 ** 31);
  });
});

describe('KV 캐시 — 선언', () => {
  it('reactive 로 등록된다', () => {
    registerKvCache();
    expect(getAlgorithmMechanismKind('kvCache')).toBe('reactive');
  });

  it('사다리 = 손잡이 구간 값, 처음 값 = 기본 구간', () => {
    const controls = (kvCacheFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const seg = (action: string) => {
      const c = controls.find((x) => x.action === action)!;
      return c.segments as Array<{ value: number; default?: boolean }>;
    };
    expect(seg('cache').map((s) => s.value)).toEqual(initial.cacheLadder);
    expect(seg('steps').map((s) => s.value)).toEqual(initial.stepsLadder);
    expect(seg('cache').find((s) => s.default)!.value).toBe(initial.cache);
    expect(seg('steps').find((s) => s.default)!.value).toBe(initial.steps);
  });
});

describe('KV 캐시 — 화면', () => {
  function mountStage(locale = 'en') {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator(locale, kvCacheFacet.messages);
    const stage = mountView(kvCacheStageView, container, {
      config: { type: 'kv-cache-stage' },
      initialData: kvCacheFacet.initialData as Record<string, unknown>,
      locale,
      t,
    });
    const svg = container.querySelector('svg')!;
    return { container, stage, svg };
  }

  it('initialData 없이 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    expect(() => mountView(kvCacheStageView, container, { config: {} })).not.toThrow();
  });

  it('알고리즘 이벤트를 그대로 먹이면 캡션 · 더미의 수가 계기와 같다', async () => {
    const { stage, svg } = mountStage();
    const projector = kvCacheProjector({ stage }, { getSpeed: () => 1, t: makeTranslator('en', kvCacheFacet.messages) });
    projector.onInit?.(kvCacheFacet.initialData);
    const viewBox = svg.getAttribute('viewBox');

    const { events } = await drive([knob('cache', 1), knob('steps', 16)]);
    // 마지막 판(켬 · 16)만 먹인다 — 앞 판의 이벤트도 먹여 윤곽이 옮겨 가게 한다
    for (const e of events) await projector.onEvent(e);
    const texts = [...svg.querySelectorAll('text')].map((n) => n.textContent ?? '');
    expect(texts[0]).toBe('Done — K·V computed in total: 23 · without the cache: 248 · saved: 91%');
    // 더미의 칸 23, 칸마다 그 자리의 낱말 — 맨 위는 from, above 는 들지 않는다
    expect(texts).toContain('23');
    expect(texts).toContain('from');
    expect(texts).not.toContain('above');
    expect(svg.getAttribute('viewBox')).toBe(viewBox);
    (stage as { destroy(): void }).destroy();
  });

  it('끔 · 8 의 끝 캡션은 계기와 같은 수를 말한다 (한국어)', async () => {
    const { stage, svg } = mountStage('ko');
    const projector = kvCacheProjector({ stage }, { getSpeed: () => 1, t: makeTranslator('ko', kvCacheFacet.messages) });
    projector.onInit?.(kvCacheFacet.initialData);
    const { events } = await drive([]);
    for (const e of events) await projector.onEvent(e);
    const caption = svg.querySelector('text')?.textContent;
    expect(caption).toBe('끝 — 셈한 K·V 자리 모두: 92 · 들고 있는 캐시 자리: 0');
    (stage as { destroy(): void }).destroy();
  });
});
