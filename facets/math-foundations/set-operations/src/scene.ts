/**
 * 집합 연산의 장면.
 *
 * - 바탕: 두 모음 A · B 와 연산 차례 · 기호 (자료에서 베낀다)
 * - 자취: 지금까지 모인 결과 모음들 (앞 연산의 결과는 남는다)
 * - 이번 걸음: 떠난 사본 · 포개진 원소 · 덜어진 원소 · 덜 것이 없던 원소
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowSetOperationsData,
  SET_OPERATIONS,
  type Origin,
  type SetOperation,
} from './algorithm.js';

export type SetOperationsBase = {
  a: { name: string; items: number[] };
  b: { name: string; items: number[] };
  operations: SetOperation[];
  symbols: Record<SetOperation, string>;
};

export type SetOperationsResult = {
  op: SetOperation;
  items: { value: number; from: Origin | 'both' }[];
};

export type SetOperationsStep =
  | { kind: 'start' }
  | {
      kind: 'gather';
      op: SetOperation;
      taken: { value: number; from: Origin }[];
      merged: number[];
      removed: number[];
      idle: number[];
    };

export type SetOperationsScene = {
  base: SetOperationsBase;
  results: SetOperationsResult[];
  step: SetOperationsStep;
};

function fail(path: string, why: string): never {
  throw new Error(`setOperationsScene: ${path} ${why}`);
}

function numberList(v: unknown, path: string): number[] {
  if (!Array.isArray(v)) fail(path, '가 배열이 아니다');
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) fail(`${path}[${i}]`, '가 정수가 아니다');
    return x;
  });
}

function origin(v: unknown, path: string): Origin {
  if (v !== 'a' && v !== 'b') fail(path, "가 'a' · 'b' 가 아니다");
  return v;
}

function readGather(payload: unknown): Extract<SetOperationsStep, { kind: 'gather' }> & {
  result: SetOperationsResult['items'];
} {
  if (typeof payload !== 'object' || payload === null) fail('gather.payload', '가 객체가 아니다');
  const p = payload as Record<string, unknown>;
  const op = p.op;
  if (typeof op !== 'string' || !(SET_OPERATIONS as readonly string[]).includes(op)) {
    fail('gather.payload.op', '가 알 수 없는 연산이다');
  }
  if (!Array.isArray(p.taken)) fail('gather.payload.taken', '가 배열이 아니다');
  const taken = p.taken.map((c, i) => {
    if (typeof c !== 'object' || c === null) fail(`gather.payload.taken[${i}]`, '가 객체가 아니다');
    const r = c as Record<string, unknown>;
    if (typeof r.value !== 'number') fail(`gather.payload.taken[${i}].value`, '가 수가 아니다');
    return { value: r.value, from: origin(r.from, `gather.payload.taken[${i}].from`) };
  });
  if (!Array.isArray(p.result)) fail('gather.payload.result', '가 배열이 아니다');
  const result = p.result.map((c, i) => {
    if (typeof c !== 'object' || c === null) fail(`gather.payload.result[${i}]`, '가 객체가 아니다');
    const r = c as Record<string, unknown>;
    if (typeof r.value !== 'number') fail(`gather.payload.result[${i}].value`, '가 수가 아니다');
    const from = r.from === 'both' ? ('both' as const) : origin(r.from, `gather.payload.result[${i}].from`);
    return { value: r.value, from };
  });
  return {
    kind: 'gather',
    op: op as SetOperation,
    taken,
    result,
    merged: numberList(p.merged, 'gather.payload.merged'),
    removed: numberList(p.removed, 'gather.payload.removed'),
    idle: numberList(p.idle, 'gather.payload.idle'),
  };
}

export const setOperationsScene: ScenePlan<SetOperationsScene> = {
  initial(initialData: unknown): SetOperationsScene {
    const d = narrowSetOperationsData(initialData);
    return {
      base: {
        a: { name: d.a.name, items: [...d.a.items] },
        b: { name: d.b.name, items: [...d.b.items] },
        operations: [...d.operations],
        symbols: { ...d.symbols },
      },
      results: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: SetOperationsScene, event: FacetRuntimeEvent): SetOperationsScene {
    switch (event.type) {
      case 'gather': {
        const g = readGather(event.payload);
        const expected = scene.base.operations[scene.results.length];
        if (expected === undefined) fail('gather.payload.op', '— 연산 차례가 이미 끝났다');
        if (g.op !== expected) fail('gather.payload.op', `가 차례의 연산(${expected})이 아니다`);
        const { a, b } = scene.base;
        g.taken.forEach((c, i) => {
          const home = c.from === 'a' ? a.items : b.items;
          if (!home.includes(c.value)) fail(`gather.payload.taken[${i}]`, '의 원소가 제 모음에 없다');
        });
        for (const [i, r] of g.result.entries()) {
          if (!g.taken.some((c) => c.value === r.value)) fail(`gather.payload.result[${i}]`, '의 원소가 떠난 사본에 없다');
        }
        for (const [i, v] of g.removed.entries()) {
          if (!g.taken.some((c) => c.value === v)) fail(`gather.payload.removed[${i}]`, '의 원소가 들어온 사본에 없다');
          if (!b.items.includes(v)) fail(`gather.payload.removed[${i}]`, '의 원소가 B 쪽에 없다');
        }
        for (const [i, v] of g.idle.entries()) {
          if (!b.items.includes(v)) fail(`gather.payload.idle[${i}]`, '의 원소가 B 쪽에 없다');
        }
        return {
          base: scene.base,
          results: [...scene.results, { op: g.op, items: g.result.map((r) => ({ ...r })) }],
          step: {
            kind: 'gather',
            op: g.op,
            taken: g.taken,
            merged: g.merged,
            removed: g.removed,
            idle: g.idle,
          },
        };
      }
      default:
        throw new Error(`setOperationsScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
