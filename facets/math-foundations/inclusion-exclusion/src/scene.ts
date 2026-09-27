import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowInclusionExclusionData, type NamedSet } from './algorithm.js';

/** 표 하나 — 어느 모음을 셀 때 붙었는가. */
export type TallyFrom = 'a' | 'b';

/** 식의 항 하나. */
export type Term = { op: 'add'; which: TallyFrom; n: number } | { op: 'sub'; n: number };

/** 바탕 — init 이 한 번 정한다. */
export type IeBase = {
  a: NamedSet;
  b: NamedSet;
  elements: string[];
  inA: boolean[];
  inB: boolean[];
};

/** 이번 걸음. */
export type IeStep =
  | { kind: 'start' }
  | { kind: 'add'; which: TallyFrom; indices: number[] }
  | { kind: 'subtract'; indices: number[]; removed: TallyFrom[] }
  | { kind: 'direct'; direct: number };

export type InclusionExclusionScene = {
  /** 바탕. init 전엔 null. */
  base: IeBase | null;
  /** 자취 — 원소마다 쌓인 표 (아래에서 위로). */
  tallies: TallyFrom[][];
  /** 자취 — 지금까지의 식. */
  terms: Term[];
  /** 자취 — 식의 값 (init 전엔 null). */
  total: number | null;
  /** 자취 — 하나씩 직접 센 수 (마지막 걸음 전엔 null). */
  direct: number | null;
  step: IeStep | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`${type}.payload.${key} 가 정수가 아니다`);
  }
  return v;
}

function indexList(p: Record<string, unknown>, key: string, type: string, length: number): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`${type}.payload.${key} 가 배열이 아니다`);
  return v.map((i, k) => {
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= length) {
      throw new Error(`${type}.payload.${key}[${k}] 가 원소 자리가 아니다`);
    }
    return i;
  });
}

function boolList(p: Record<string, unknown>, key: string, length: number): boolean[] {
  const v = p[key];
  if (!Array.isArray(v) || v.length !== length) {
    throw new Error(`init.payload.${key} 가 원소 수와 같은 길이의 배열이 아니다`);
  }
  return v.map((x, k) => {
    if (typeof x !== 'boolean') throw new Error(`init.payload.${key}[${k}] 가 참거짓이 아니다`);
    return x;
  });
}

function copySet(s: NamedSet): NamedSet {
  return { name: s.name, members: [...s.members] };
}

function requireBase(scene: InclusionExclusionScene, type: string): IeBase {
  if (scene.base === null || scene.total === null) throw new Error(`${type} 가 init 보다 먼저 왔다`);
  return scene.base;
}

function reduceInit(event: FacetRuntimeEvent): InclusionExclusionScene {
  const p = event.payload;
  if (!isRecord(p)) throw new Error('init.payload 가 객체가 아니다');
  // 모음 둘의 모양은 initialData 좁히개가 가진 규칙으로 잰다 — 두 벌을 두지 않는다.
  const sets = narrowInclusionExclusionData({ type: 'inclusion-exclusion', stepMs: 0, a: p.a, b: p.b });
  const rawElements = p.elements;
  if (!Array.isArray(rawElements) || rawElements.length === 0) {
    throw new Error('init.payload.elements 가 비었거나 배열이 아니다');
  }
  const elements = rawElements.map((e, k) => {
    if (typeof e !== 'string' || e.length === 0) throw new Error(`init.payload.elements[${k}] 가 글자가 아니다`);
    return e;
  });
  const inA = boolList(p, 'inA', elements.length);
  const inB = boolList(p, 'inB', elements.length);
  elements.forEach((e, k) => {
    if (inA[k] !== sets.a.members.includes(e)) throw new Error(`init.payload.inA[${k}] 가 모음 A 와 어긋난다`);
    if (inB[k] !== sets.b.members.includes(e)) throw new Error(`init.payload.inB[${k}] 가 모음 B 와 어긋난다`);
    if (!inA[k] && !inB[k]) throw new Error(`init.payload.elements[${k}] ${e} 가 어느 모음에도 없다`);
  });
  return {
    base: { a: copySet(sets.a), b: copySet(sets.b), elements, inA, inB },
    tallies: elements.map(() => []),
    terms: [],
    total: 0,
    direct: null,
    step: { kind: 'start' },
  };
}

export const inclusionExclusionScene: ScenePlan<InclusionExclusionScene> = {
  initial(initialData: unknown): InclusionExclusionScene {
    // 모양만 잰다. 원소 차례 · 소속은 알고리즘이 셈해 silent init 으로 보낸다.
    narrowInclusionExclusionData(initialData);
    return { base: null, tallies: [], terms: [], total: null, direct: null, step: null };
  },

  reduce(scene: InclusionExclusionScene, event: FacetRuntimeEvent): InclusionExclusionScene {
    switch (event.type) {
      case 'init':
        return reduceInit(event);

      case 'addSet': {
        const base = requireBase(scene, 'addSet');
        const p = event.payload;
        if (!isRecord(p)) throw new Error('addSet.payload 가 객체가 아니다');
        const which = p.which;
        if (which !== 'a' && which !== 'b') throw new Error('addSet.payload.which 가 a · b 가 아니다');
        if (scene.terms.some((term) => term.op === 'add' && term.which === which)) {
          throw new Error(`addSet.payload.which ${which} 모음을 이미 더했다`);
        }
        const size = num(p, 'size', 'addSet');
        const indices = indexList(p, 'indices', 'addSet', base.elements.length);
        const member = which === 'a' ? base.inA : base.inB;
        const expected = member.flatMap((m, i) => (m ? [i] : []));
        if (indices.length !== expected.length || indices.some((i, k) => i !== expected[k])) {
          throw new Error(`addSet.payload.indices 가 모음 ${which} 의 원소와 어긋난다`);
        }
        if (size !== indices.length) throw new Error('addSet.payload.size 가 원소 수와 어긋난다');
        const total = num(p, 'total', 'addSet');
        if (total !== (scene.total as number) + size) {
          throw new Error('addSet.payload.total 이 앞의 센 수 + size 와 어긋난다');
        }
        return {
          base,
          tallies: scene.tallies.map((stack, i) => (indices.includes(i) ? [...stack, which] : [...stack])),
          terms: [...scene.terms, { op: 'add', which, n: size }],
          total,
          direct: null,
          step: { kind: 'add', which, indices },
        };
      }

      case 'subtract': {
        const base = requireBase(scene, 'subtract');
        const p = event.payload;
        if (!isRecord(p)) throw new Error('subtract.payload 가 객체가 아니다');
        const size = num(p, 'size', 'subtract');
        const indices = indexList(p, 'indices', 'subtract', base.elements.length);
        if (size !== indices.length) throw new Error('subtract.payload.size 가 원소 수와 어긋난다');
        // 떨어져 나가는 표 — 원소마다 맨 위의 것. 운동의 출발 계기값으로 장면이 말한다.
        const removed = indices.map((i, k) => {
          const stack = scene.tallies[i] as TallyFrom[];
          if (stack.length !== 2) throw new Error(`subtract.payload.indices[${k}] 원소의 표가 둘이 아니다`);
          return stack[1] as TallyFrom;
        });
        const total = num(p, 'total', 'subtract');
        if (total !== (scene.total as number) - size) {
          throw new Error('subtract.payload.total 이 앞의 센 수 − size 와 어긋난다');
        }
        return {
          base,
          tallies: scene.tallies.map((stack, i) => (indices.includes(i) ? stack.slice(0, -1) : [...stack])),
          terms: [...scene.terms, { op: 'sub', n: size }],
          total,
          direct: null,
          step: { kind: 'subtract', indices, removed },
        };
      }

      case 'direct': {
        const base = requireBase(scene, 'direct');
        const p = event.payload;
        if (!isRecord(p)) throw new Error('direct.payload 가 객체가 아니다');
        const direct = num(p, 'direct', 'direct');
        const total = num(p, 'total', 'direct');
        if (total !== scene.total) throw new Error('direct.payload.total 이 지금 센 수와 어긋난다');
        if (direct !== base.elements.length) throw new Error('direct.payload.direct 가 원소 수와 어긋난다');
        return {
          base,
          tallies: scene.tallies.map((stack) => [...stack]),
          terms: [...scene.terms],
          total,
          direct,
          step: { kind: 'direct', direct },
        };
      }

      default:
        throw new Error(`inclusionExclusionScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
