/**
 * IR 과 화면이 네 연관도 전부에서 같은 답을 내는가.
 *
 * 완제품이 코드 패널을 다는 까닭은 "이 셈이 여섯 언어로 이렇게 갈린다" 를
 * 보이기 위해서다. 그 패널이 셈하는 수와 그림이 보이는 수가 어긋나면 그것이
 * 거짓말이므로, 여기서 둘을 맞댄다 — 그림 쪽은 algorithm 이 발신한
 * `cache-miss` 이벤트와 `miss-count` 계기이고, 패널 쪽은 같은 IR 을
 * `ir-interpreter` 로 돌린 값이다.
 *
 * 곁들여 잠그는 것 넷.
 *   - 손잡이 표 (15 · 11 · 5 · 5) 그 자체. 4-way 에서 멈추는 것이 이 화면의 요점이다.
 *   - phase 어휘가 algorithm 과 IR 에서 같은 집합인가 (C3).
 *   - IR 의 32비트 천장 근거 — 수가 작다는 것이 구조로 잠겨 있는가.
 *   - IR 이름이 여섯 언어의 예약어를 피했는가 (S-transpiler).
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import {
  clearRegistry,
  registerBuiltinViews,
  runFacet,
  type FacetContext,
  type IRStmt,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

import {
  countSetAssociativeMisses,
  setAssociativeCacheAlgorithm,
  type SetAssociativeCacheData,
} from '../src/algorithm.js';
import {
  SET_ASSOCIATIVE_CACHE_PHASES,
  setAssociativeCacheImperativeIR as IR,
  walkIRStatements,
} from '../src/irs.js';
import { setAssociativeCacheFacet } from '../src/facet.js';
import { registerSetAssociativeCache } from '../src/index.js';

const BASE = setAssociativeCacheFacet.initialData as unknown as SetAssociativeCacheData;

/** 사양의 실측표. 15 → 11 → 5 로 떨어지다 4-way 에서 멈춘다. */
const TABLE = [
  { ways: 1, sets: 8, misses: 15 },
  { ways: 2, sets: 4, misses: 11 },
  { ways: 4, sets: 2, misses: 5 },
  { ways: 8, sets: 1, misses: 5 },
];

type Emitted = { type: string; target?: unknown; payload?: unknown };

type Run = {
  events: Emitted[];
  metrics: Map<string, number>;
};

/**
 * 알고리즘을 러너 없이 굴린다.
 *
 * `queued` 는 판이 도는 중에 `pollInput` 으로 집히는 입력이고, `waiting` 은
 * 판이 끝난 뒤 `waitForInput` 이 받는 입력이다. 둘 다 비면 reset 이 하는 일을
 * 흉내 낸다 — cancelled 를 세우고 reject.
 */
async function drive(
  ways: number,
  queued: ReactiveInputEvent[] = [],
  waiting: ReactiveInputEvent[] = [],
): Promise<Run> {
  const data: SetAssociativeCacheData = { ...BASE, ways };
  const events: Emitted[] = [];
  const metrics = new Map<string, number>();
  const state = { cancelled: false };
  const ctx = {
    data,
    get cancelled(): boolean {
      return state.cancelled;
    },
    async emit(event: Emitted): Promise<void> {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc'): void {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep(): Promise<boolean> {
      return !state.cancelled;
    },
    pollInput(): ReactiveInputEvent | null {
      return queued.shift() ?? null;
    },
    async waitForInput(): Promise<ReactiveInputEvent> {
      const next = waiting.shift();
      if (next) return next;
      state.cancelled = true;
      throw new Error('cancelled');
    },
  };
  await setAssociativeCacheAlgorithm(ctx as unknown as FacetContext<SetAssociativeCacheData>);
  return { events, metrics };
}

/** IR 로 센 미스 수. 상태 배열은 부르는 쪽이 마련한다 (irs.ts 머리말). */
function missesFromIR(ways: number): { misses: number; tags: number[]; stamps: number[] } {
  const tags = new Array<number>(BASE.slots).fill(-1);
  const stamps = new Array<number>(BASE.slots).fill(0);
  const misses = runIR(IR, 'countMisses', [
    tags,
    stamps,
    [...BASE.addresses],
    BASE.rounds,
    BASE.slots,
    ways,
    BASE.lineBytes,
  ]);
  return { misses: misses as number, tags, stamps };
}

describe('집합 연관 캐시 — IR 과 화면', () => {
  it.each(TABLE)('$ways-way 는 IR·화면·표가 모두 미스 $misses', async ({ ways, sets, misses }) => {
    const { events, metrics } = await drive(ways);
    const fromScreen = events.filter((e) => e.type === 'cache-miss').length;
    const fromMetric = metrics.get('miss-count');
    const fromIR = missesFromIR(ways).misses;
    const fromPure = countSetAssociativeMisses(BASE, ways);

    expect({ fromScreen, fromMetric, fromIR, fromPure }).toEqual({
      fromScreen: misses,
      fromMetric: misses,
      fromIR: misses,
      fromPure: misses,
    });

    // 묶음 수는 칸 수를 연관도로 나눈 몫이다 — 칸이 늘지 않는다는 것이 여기 있다.
    const layout = events.find((e) => e.type === 'layout-changed');
    expect(layout?.payload).toEqual({ ways, sets, slots: 8 });
    // 한 번 찾을 때 뒤지는 칸 수가 곧 연관도다.
    expect(metrics.get('probe-width')).toBe(ways);
  });

  it('접근열을 세 바퀴 돈다 — 접근 15회', async () => {
    const { events } = await drive(4);
    const accesses = events.filter((e) => e.type === 'highlight').length;
    expect(accesses).toBe(BASE.rounds * BASE.addresses.length);
    expect(events.filter((e) => e.type === 'cache-hit').length).toBe(15 - 5);
  });

  it('4-way 위로는 나아지지 않는다 — 얻는 것이 멈추는 자리를 표가 잠근다', () => {
    const ladder = TABLE.map((row) => countSetAssociativeMisses(BASE, row.ways));
    expect(ladder).toEqual([15, 11, 5, 5]);
    expect(ladder[3]).toBe(ladder[2]);
  });

  it('손잡이를 돌리면 판을 그 자리에서 다시 시작한다', async () => {
    const { events } = await drive(1, [{ type: 'ways', payload: { value: 4 } }]);
    const layouts = events
      .filter((e) => e.type === 'layout-changed')
      .map((e) => (e.payload as { ways: number }).ways);
    expect(layouts).toEqual([1, 4]);

    const done = events.filter((e) => e.type === 'done');
    expect(done).toHaveLength(1);
    expect(done[0].payload).toEqual({ ways: 4, misses: 5, prevWays: 2, prevMisses: 11 });
    // 되돌아온 판의 미스만 센다 — 1-way 로 돌던 것은 첫 접근 전에 끊겼다.
    expect(events.filter((e) => e.type === 'cache-miss').length).toBe(5);
  });

  it('사다리에 없는 값은 받지 않는다', async () => {
    const { events } = await drive(1, [{ type: 'ways', payload: { value: 3 } }]);
    const layouts = events
      .filter((e) => e.type === 'layout-changed')
      .map((e) => (e.payload as { ways: number }).ways);
    expect(layouts).toEqual([1]);
  });
});

describe('집합 연관 캐시 — IR 의 짜임', () => {
  it('phase 어휘가 algorithm 과 IR 에서 같은 집합이다 (C3)', async () => {
    const { events } = await drive(2);
    const fromAlgorithm = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    const fromIR = new Set<string>();
    for (const fn of IR.functions) {
      walkIRStatements(fn.body, (s: IRStmt) => {
        if (s.kind !== 'comment' && s.phase !== undefined) fromIR.add(s.phase);
      });
    }
    const declared = new Set(SET_ASSOCIATIVE_CACHE_PHASES);

    expect([...fromIR].sort()).toEqual([...declared].sort());
    expect([...fromAlgorithm].sort()).toEqual([...declared].sort());
  });

  it('32비트 천장 — 수가 작다는 것이 구조로 잠긴다', () => {
    const json = JSON.stringify(IR);

    // (1) IR 안의 수 리터럴은 전부 작다. 큰 상수가 슬그머니 들어오면 여기서 걸린다.
    const literals = [...json.matchAll(/"value":(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(literals.length).toBeGreaterThan(0);
    for (const value of literals) expect(Math.abs(value)).toBeLessThanOrEqual(16);

    // (2) 곱은 `si * ways` 하나뿐이다. 둘 다 칸 수 이하라 곱도 칸 수 이하다.
    const ops = new Set([...json.matchAll(/"op":"([^"]+)"/g)].map((m) => m[1]));
    expect([...ops].sort()).toEqual(['%', '*', '+', '//', '<', '=='].sort());

    // (3) 실제로 돌려도 배열의 값이 경계를 넘지 않는다.
    for (const { ways } of TABLE) {
      const { tags, stamps } = missesFromIR(ways);
      const bound = BASE.rounds * BASE.addresses.length;
      for (const tag of tags) expect(tag).toBeLessThanOrEqual(BASE.slots * 2);
      for (const stamp of stamps) expect(stamp).toBeLessThanOrEqual(bound);
    }
  });

  it('이름이 여섯 언어의 예약어를 피한다 (S-transpiler)', () => {
    const reserved = new Set([
      'base', 'out', 'ref', 'params', 'event', 'lock', 'checked', 'fixed', 'sealed',
      'object', 'string', 'set', 'value', 'pass', 'lambda', 'from', 'global',
      'final', 'synchronized', 'native', 'class', 'new', 'return', 'this',
    ]);
    const names = new Set<string>();
    for (const fn of IR.functions) {
      names.add(fn.name);
      for (const p of fn.params) names.add(p.name);
      walkIRStatements(fn.body, (s: IRStmt) => {
        if (s.kind === 'var') names.add(s.name);
        if (s.kind === 'for-range') names.add(s.var);
      });
    }
    expect([...names].filter((n) => reserved.has(n))).toEqual([]);
  });

  it('여섯 언어가 모두 코드를 낸다', () => {
    const all = [
      pythonTranspiler,
      javascriptTranspiler,
      typescriptTranspiler,
      javaTranspiler,
      cppTranspiler,
      csharpTranspiler,
    ];
    for (const transpiler of all) {
      const { lines } = transpiler.transpile(IR);
      expect(lines.length).toBeGreaterThan(20);
      // 나눗셈은 전부 정수 나눗셈이다 — 파이썬에서 실수가 되면 색인이 터진다.
      if (transpiler.id === 'python') {
        expect(lines.some((l) => l.code.includes('//'))).toBe(true);
      }
    }
  });
});

describe('집합 연관 캐시 — 마운트', () => {
  it('띄우면 그림이 뜨고 첫 걸음에 던지지 않는다', async () => {
    clearRegistry();
    registerBuiltinViews();
    registerSetAssociativeCache();

    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(setAssociativeCacheFacet, container);
    try {
      await new Promise((r) => setTimeout(r, 400));
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.childNodes.length ?? 0).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      handle.destroy();
      console.error = original;
    }
  });
});
