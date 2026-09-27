/**
 * 순열과 조합의 장면.
 *
 * 바탕 — 물건과 고르는 수 (initial 이 자료에서 베낀다), 줄 세우기 전부와 묶음 자리 수 (lay 가 정한다).
 * 자취 — 모인 묶음들 (gather 가 쌓는다), 나눗셈 (divide).
 * 이번 걸음 — step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowPermutationVsCombinationData } from './algorithm.js';

export type PvcGroup = {
  /** 구성원 — 사전 차례 */
  members: string[];
  /** 모인 줄 세우기의 번호 (laid.arrangements 의 차례) */
  picks: number[];
};

export type PvcLaid = {
  arrangements: string[][];
  factors: number[];
  total: number;
  slots: number;
};

export type PvcStep =
  | { kind: 'start' }
  | { kind: 'lay' }
  | { kind: 'gather'; group: number }
  | { kind: 'divide' };

export type PermutationVsCombinationScene = {
  objects: string[];
  choose: number;
  laid: PvcLaid | null;
  groups: PvcGroup[];
  remaining: number | null;
  divided: { total: number; size: number; count: number; n: number; r: number } | null;
  step: PvcStep;
};

function fail(path: string, why: string): never {
  throw new Error(`permutationVsCombinationScene: ${path} — ${why}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

function intField(p: Record<string, unknown>, path: string, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${path}.${key}`, '정수가 아니다');
  return v;
}

function strList(v: unknown, path: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) fail(path, '글자 배열이 아니다');
  return [...(v as string[])];
}

function intList(v: unknown, path: string): number[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isInteger(x))) fail(path, '정수 배열이 아니다');
  return [...(v as number[])];
}

function reduceLay(scene: PermutationVsCombinationScene, event: FacetRuntimeEvent): PermutationVsCombinationScene {
  if (scene.laid !== null) fail('lay', '줄 세우기가 이미 나와 있다');
  const p = payloadOf(event);
  const raw = p.arrangements;
  if (!Array.isArray(raw)) fail('lay.payload.arrangements', '배열이 아니다');
  const arrangements = raw.map((a, i) => {
    const row = strList(a, `lay.payload.arrangements[${i}]`);
    if (row.length !== scene.choose) fail(`lay.payload.arrangements[${i}]`, `길이가 고르는 수 ${scene.choose} 와 다르다`);
    for (const s of row) {
      if (!scene.objects.includes(s)) fail(`lay.payload.arrangements[${i}]`, `물건에 없는 기호 ${s}`);
    }
    return row;
  });
  const factors = intList(p.factors, 'lay.payload.factors');
  const total = intField(p, 'lay.payload', 'total');
  const slots = intField(p, 'lay.payload', 'slots');
  if (total !== arrangements.length) fail('lay.payload.total', `줄 세우기 수 ${arrangements.length} 와 다르다`);
  if (slots < 1) fail('lay.payload.slots', '1 보다 작다');
  return {
    ...scene,
    laid: { arrangements, factors, total, slots },
    remaining: total,
    step: { kind: 'lay' },
  };
}

function reduceGather(scene: PermutationVsCombinationScene, event: FacetRuntimeEvent): PermutationVsCombinationScene {
  const laid = scene.laid;
  if (laid === null || scene.remaining === null) fail('gather', '줄 세우기가 아직 없다');
  const p = payloadOf(event);
  const members = strList(p.members, 'gather.payload.members');
  const picks = intList(p.picks, 'gather.payload.picks');
  const remaining = intField(p, 'gather.payload', 'remaining');
  const groups = intField(p, 'gather.payload', 'groups');
  const taken = new Set(scene.groups.flatMap((g) => g.picks));
  picks.forEach((i, k) => {
    const a = laid.arrangements[i];
    if (a === undefined) fail(`gather.payload.picks[${k}]`, `줄 세우기 ${i} 가 없다`);
    if (taken.has(i)) fail(`gather.payload.picks[${k}]`, `줄 세우기 ${i} 는 이미 모였다`);
    if (a.length !== members.length || !members.every((m) => a.includes(m))) {
      fail(`gather.payload.picks[${k}]`, `줄 세우기 ${a.join('')} 는 묶음 ${members.join('')} 의 것이 아니다`);
    }
  });
  if (remaining !== scene.remaining - picks.length) {
    fail('gather.payload.remaining', `앞 장면 ${scene.remaining} 에서 ${picks.length} 를 뺀 값과 다르다`);
  }
  if (groups !== scene.groups.length + 1) fail('gather.payload.groups', `앞 묶음 수 ${scene.groups.length} 의 다음이 아니다`);
  if (groups > laid.slots) fail('gather.payload.groups', `묶음 자리 ${laid.slots} 를 넘는다`);
  return {
    ...scene,
    groups: [...scene.groups, { members, picks }],
    remaining,
    step: { kind: 'gather', group: groups - 1 },
  };
}

function reduceDivide(scene: PermutationVsCombinationScene, event: FacetRuntimeEvent): PermutationVsCombinationScene {
  if (scene.laid === null) fail('divide', '줄 세우기가 아직 없다');
  if (scene.remaining !== 0) fail('divide', `아직 안 모인 줄 세우기 ${String(scene.remaining)}`);
  const p = payloadOf(event);
  const total = intField(p, 'divide.payload', 'total');
  const size = intField(p, 'divide.payload', 'size');
  const count = intField(p, 'divide.payload', 'count');
  const n = intField(p, 'divide.payload', 'n');
  const r = intField(p, 'divide.payload', 'r');
  if (total !== scene.laid.total) fail('divide.payload.total', `줄 세우기 수 ${scene.laid.total} 와 다르다`);
  if (count !== scene.groups.length) fail('divide.payload.count', `묶음 수 ${scene.groups.length} 와 다르다`);
  if (n !== scene.objects.length || r !== scene.choose) fail('divide.payload', 'n · r 가 바탕과 다르다');
  if (size * count !== total) fail('divide.payload.size', `${size} × ${count} 가 ${total} 가 아니다`);
  return { ...scene, divided: { total, size, count, n, r }, step: { kind: 'divide' } };
}

export const permutationVsCombinationScene: ScenePlan<PermutationVsCombinationScene> = {
  initial(initialData: unknown): PermutationVsCombinationScene {
    const data = narrowPermutationVsCombinationData(initialData);
    return {
      objects: [...data.objects],
      choose: data.choose,
      laid: null,
      groups: [],
      remaining: null,
      divided: null,
      step: { kind: 'start' },
    };
  },
  reduce(scene, event) {
    switch (event.type) {
      case 'lay':
        return reduceLay(scene, event);
      case 'gather':
        return reduceGather(scene, event);
      case 'divide':
        return reduceDivide(scene, event);
      default:
        throw new Error(`permutationVsCombinationScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
