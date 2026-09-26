import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { logCapacity, readConsumerOffsetData, type ConsumerGroup } from './algorithm.js';

/** 이번 걸음 — 무엇이 일어났는가 (문안 없이 종류와 인자) */
export type ConsumerOffsetStep =
  | { kind: 'start' }
  | { kind: 'init' }
  | { kind: 'read'; group: string; from: number; count: number; values: number[] }
  | { kind: 'append'; offset: number; value: number };

export type ConsumerOffsetScene = {
  /** 바탕 — 그룹과 로그가 끝내 가질 칸 수 */
  groups: ConsumerGroup[];
  slots: number;
  /** 자취 — 지금 로그의 값(오프셋 = 자리). 읽어도 줄지 않는다 */
  records: number[];
  /** 셈값 — silent init 이 채운다. 배열은 groups 차례 */
  offsets: number[] | null;
  lags: number[] | null;
  gap: number | null;
  step: ConsumerOffsetStep;
};

function fail(path: string, what: string): never {
  throw new Error(`consumer-offset scene: ${path} — ${what}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) fail(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

function int(p: Record<string, unknown>, key: string, path: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${path}.${key}`, '정수가 아니다');
  return v;
}

function num(p: Record<string, unknown>, key: string, path: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path}.${key}`, '수가 아니다');
  return v;
}

function ints(p: Record<string, unknown>, key: string, path: string, len: number): number[] {
  const v = p[key];
  if (!Array.isArray(v) || v.length !== len) fail(`${path}.${key}`, `길이 ${len} 의 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) fail(`${path}.${key}[${i}]`, '정수가 아니다');
    return x;
  });
}

/** 셈값 셋을 받아 끝 · 밀림이 서로 맞는지 본다 */
function readCounts(
  p: Record<string, unknown>,
  path: string,
  groups: number,
  end: number,
): { offsets: number[]; lags: number[]; gap: number } {
  const offsets = ints(p, 'offsets', path, groups);
  const lags = ints(p, 'lags', path, groups);
  const gap = int(p, 'gap', path);
  for (const [i, o] of offsets.entries()) {
    if (o < 0 || o > end) fail(`${path}.offsets[${i}]`, `끝 ${end} 밖이다`);
    if (lags[i] !== end - o) fail(`${path}.lags[${i}]`, `끝 − 오프셋과 다르다`);
  }
  return { offsets, lags, gap };
}

export const consumerOffsetScene: ScenePlan<ConsumerOffsetScene> = {
  initial(initialData: unknown): ConsumerOffsetScene {
    const data = readConsumerOffsetData(initialData);
    return {
      groups: data.groups.map((g) => ({ id: g.id, maxPoll: g.maxPoll })),
      slots: logCapacity(data),
      records: [...data.log],
      offsets: null,
      lags: null,
      gap: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: ConsumerOffsetScene, event: FacetRuntimeEvent): ConsumerOffsetScene {
    const n = scene.groups.length;
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const end = int(p, 'end', 'init');
        if (end !== scene.records.length) fail('init.end', `로그 길이 ${scene.records.length} 와 다르다`);
        const c = readCounts(p, 'init', n, end);
        return { ...scene, records: [...scene.records], ...c, step: { kind: 'init' } };
      }
      case 'read': {
        const p = payloadOf(event);
        if (scene.offsets === null) fail('read', 'init 앞에 왔다');
        const group = p.group;
        if (typeof group !== 'string') fail('read.group', '문자열이 아니다');
        const gi = scene.groups.findIndex((g) => g.id === group);
        if (gi < 0) fail('read.group', `없는 그룹 ${group}`);
        const from = int(p, 'from', 'read');
        const count = int(p, 'count', 'read');
        if (from !== scene.offsets[gi]) fail('read.from', `지금 오프셋 ${String(scene.offsets[gi])} 과 다르다`);
        if (count < 1 || from + count > scene.records.length) fail('read.count', '로그 밖을 읽는다');
        const values = ints(p, 'values', 'read', count);
        for (const [k, v] of values.entries()) {
          if (scene.records[from + k] !== v) fail(`read.values[${k}]`, `오프셋 ${from + k} 의 기록과 다르다`);
        }
        const end = int(p, 'end', 'read');
        if (end !== scene.records.length) fail('read.end', '읽기가 로그 길이를 바꾸었다');
        const c = readCounts(p, 'read', n, end);
        for (const [i, o] of c.offsets.entries()) {
          const was = scene.offsets[i];
          if (i === gi ? o !== from + count : o !== was) fail(`read.offsets[${i}]`, '읽은 그룹만 나아가야 한다');
        }
        return {
          ...scene,
          records: [...scene.records],
          ...c,
          step: { kind: 'read', group, from, count, values },
        };
      }
      case 'append': {
        const p = payloadOf(event);
        if (scene.offsets === null) fail('append', 'init 앞에 왔다');
        const offset = int(p, 'offset', 'append');
        if (offset !== scene.records.length) fail('append.offset', '로그 끝이 아니다');
        if (offset >= scene.slots) fail('append.offset', `칸 ${scene.slots} 을 넘는다`);
        const value = num(p, 'value', 'append');
        const end = int(p, 'end', 'append');
        if (end !== offset + 1) fail('append.end', '끝이 하나 늘지 않았다');
        const c = readCounts(p, 'append', n, end);
        for (const [i, o] of c.offsets.entries()) {
          if (o !== scene.offsets[i]) fail(`append.offsets[${i}]`, '붙이기가 오프셋을 옮겼다');
        }
        return {
          ...scene,
          records: [...scene.records, value],
          ...c,
          step: { kind: 'append', offset, value },
        };
      }
      default:
        return fail(event.type, '모르는 이벤트');
    }
  },
};
