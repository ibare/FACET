import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 장면 — 바탕(요소와 규칙 다섯) · 자취(드러난 무게 · 자리 · 진 규칙) · 이번 걸음.
 *
 * 무게와 판정은 알고리즘이 셈해 싣는다. 장면은 이벤트를 이어 붙이기만 한다.
 */

export type SceneWeight = readonly [number, number, number];

export interface SceneNode {
  tag: string;
  id: string | null;
  classes: string[];
}

export interface SceneRule {
  order: number;
  selector: string;
  prop: string;
  value: string;
}

export type Verdict = 'heavier' | 'equal' | 'lighter';

export interface LostRule {
  order: number;
  /** displaced — 쥐고 있다가 자리를 뺏겼다. blocked — 들어왔으나 가벼워 밀려났다. */
  how: 'displaced' | 'blocked';
}

export type CascadeStep =
  | { kind: 'start' }
  | { kind: 'take'; order: number }
  | { kind: 'duel'; order: number; holder: number; verdict: Verdict; column: number | null }
  | { kind: 'apply'; order: number; swaps: number; kept: number };

export interface CascadeConflictScene {
  path: SceneNode[];
  rules: SceneRule[];
  /** 원본 차례 자리마다. 들어오기 전엔 null. */
  weights: (SceneWeight | null)[];
  holder: number | null;
  lost: LostRule[];
  applied: number | null;
  step: CascadeStep;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readString(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`cascade-conflict 장면: ${where}.${key} 가 문자열이 아니다`);
  return v;
}

function readInt(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`cascade-conflict 장면: ${where}.${key} 가 정수가 아니다`);
  }
  return v;
}

function readWeight(o: Record<string, unknown>, key: string, where: string): SceneWeight {
  const v = o[key];
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === 'number')) {
    throw new Error(`cascade-conflict 장면: ${where}.${key} 가 무게 셋이 아니다`);
  }
  return [v[0] as number, v[1] as number, v[2] as number];
}

function readNode(v: unknown, i: number): SceneNode {
  if (!isRecord(v)) throw new Error(`cascade-conflict 장면: path[${i}] 가 객체가 아니다`);
  const tag = readString(v, 'tag', `path[${i}]`);
  const id = v.id === undefined ? null : readString(v, 'id', `path[${i}]`);
  const raw = v.classes === undefined ? [] : v.classes;
  if (!Array.isArray(raw) || !raw.every((c) => typeof c === 'string')) {
    throw new Error(`cascade-conflict 장면: path[${i}].classes 가 문자열 목록이 아니다`);
  }
  return { tag, id, classes: [...(raw as string[])] };
}

function readRule(v: unknown, i: number): SceneRule {
  if (!isRecord(v)) throw new Error(`cascade-conflict 장면: rules[${i}] 가 객체가 아니다`);
  const where = `rules[${i}]`;
  return {
    order: i + 1,
    selector: readString(v, 'selector', where),
    prop: readString(v, 'prop', where),
    value: readString(v, 'value', where),
  };
}

function ruleExists(scene: CascadeConflictScene, order: number): void {
  if (order < 1 || order > scene.rules.length) {
    throw new Error(`cascade-conflict 장면: 없는 규칙 #${order}`);
  }
}

function withWeight(scene: CascadeConflictScene, order: number, w: SceneWeight): (SceneWeight | null)[] {
  return scene.weights.map((x, i) => (i === order - 1 ? w : x));
}

export const cascadeConflictScene: ScenePlan<CascadeConflictScene> = {
  initial(initialData: unknown): CascadeConflictScene {
    if (!isRecord(initialData)) throw new Error('cascade-conflict 장면: initialData 가 없다');
    const { path, rules } = initialData;
    if (!Array.isArray(path) || path.length === 0) throw new Error('cascade-conflict 장면: path 가 비었다');
    if (!Array.isArray(rules) || rules.length === 0) throw new Error('cascade-conflict 장면: rules 가 비었다');
    return {
      path: path.map(readNode),
      rules: rules.map(readRule),
      weights: rules.map(() => null),
      holder: null,
      lost: [],
      applied: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: CascadeConflictScene, event: FacetRuntimeEvent): CascadeConflictScene {
    const p = event.payload;
    if (event.type === 'take') {
      if (!isRecord(p)) throw new Error('cascade-conflict 장면: take 에 payload 가 없다');
      const order = readInt(p, 'order', 'take');
      ruleExists(scene, order);
      return {
        ...scene,
        weights: withWeight(scene, order, readWeight(p, 'weight', 'take')),
        holder: order,
        step: { kind: 'take', order },
      };
    }
    if (event.type === 'duel') {
      if (!isRecord(p)) throw new Error('cascade-conflict 장면: duel 에 payload 가 없다');
      const order = readInt(p, 'order', 'duel');
      const holder = readInt(p, 'holder', 'duel');
      ruleExists(scene, order);
      ruleExists(scene, holder);
      const verdict = p.verdict;
      if (verdict !== 'heavier' && verdict !== 'equal' && verdict !== 'lighter') {
        throw new Error(`cascade-conflict 장면: 모르는 판정 ${String(verdict)}`);
      }
      const column = p.column === null ? null : readInt(p, 'column', 'duel');
      const weights = withWeight(scene, order, readWeight(p, 'weight', 'duel'));
      const step: CascadeStep = { kind: 'duel', order, holder, verdict, column };
      if (verdict === 'lighter') {
        return { ...scene, weights, lost: [...scene.lost, { order, how: 'blocked' }], step };
      }
      return {
        ...scene,
        weights,
        holder: order,
        lost: [...scene.lost, { order: holder, how: 'displaced' }],
        step,
      };
    }
    if (event.type === 'apply') {
      if (!isRecord(p)) throw new Error('cascade-conflict 장면: apply 에 payload 가 없다');
      const order = readInt(p, 'order', 'apply');
      ruleExists(scene, order);
      return {
        ...scene,
        applied: order,
        step: {
          kind: 'apply',
          order,
          swaps: readInt(p, 'swaps', 'apply'),
          kept: readInt(p, 'kept', 'apply'),
        },
      };
    }
    return scene;
  },
};
