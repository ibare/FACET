/**
 * 오프셋 재생의 장면.
 *
 * 바탕   로그의 값 · 그룹 식별자 (initialData 에서 베낀다)
 * 계기   오프셋 · 끝 · 기록마다 읽힌 횟수 · 줄 수 — 알고리즘이 셈해 init · read · rewind 로 보낸다
 * 이번 걸음 처음 · 읽음(from → next, 읽은 값) · 되감기(from → to)
 *
 * 장면은 셈을 다시 돌리지 않는다. 이벤트가 지금 장면과 맞는지만 보고 어긋나면 던진다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowReplayData } from './algorithm.js';

export type ReplayGauge = {
  offset: number;
  end: number;
  times: number[];
  passes: number;
};

export type ReplayStepView =
  | { kind: 'start' }
  | { kind: 'read'; from: number; next: number; offsets: number[]; values: number[] }
  | { kind: 'rewind'; from: number; to: number; records: number };

export type ReplayScene = {
  /** 로그의 값 (오프셋 차례) — 걸음 내내 그대로 */
  values: number[];
  group: string;
  /** 알고리즘의 init 이 채운다. 그 전에는 null */
  gauge: ReplayGauge | null;
  step: ReplayStepView;
};

function field(payload: unknown, key: string, type: string): unknown {
  if (typeof payload !== 'object' || payload === null) throw new Error(`${type}.payload: 객체가 아니다`);
  const v = (payload as Record<string, unknown>)[key];
  if (v === undefined) throw new Error(`${type}.payload.${key}: 없다`);
  return v;
}

function int(payload: unknown, key: string, type: string): number {
  const v = field(payload, key, type);
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`${type}.payload.${key}: 정수가 아니다`);
  return v;
}

function ints(payload: unknown, key: string, type: string): number[] {
  const v = field(payload, key, type);
  if (!Array.isArray(v)) throw new Error(`${type}.payload.${key}: 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${type}.payload.${key}[${i}]: 수가 아니다`);
    return x;
  });
}

function need(scene: ReplayScene, type: string): ReplayGauge {
  if (!scene.gauge) throw new Error(`${type}: init 전에 왔다`);
  return scene.gauge;
}

export const replayFromOffsetScene: ScenePlan<ReplayScene> = {
  initial(initialData: unknown): ReplayScene {
    const data = narrowReplayData(initialData);
    return { values: data.values.slice(), group: data.group, gauge: null, step: { kind: 'start' } };
  },

  reduce(scene: ReplayScene, event: FacetRuntimeEvent): ReplayScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const offset = int(p, 'offset', 'init');
        const end = int(p, 'end', 'init');
        const times = ints(p, 'times', 'init');
        const passes = int(p, 'passes', 'init');
        if (end !== scene.values.length) throw new Error(`init.payload.end: ${end} 이 로그 길이 ${scene.values.length} 와 다르다`);
        if (times.length !== end) throw new Error('init.payload.times: 길이가 끝과 다르다');
        if (offset < 0 || offset > end) throw new Error(`init.payload.offset: ${offset} 는 0..${end} 밖이다`);
        return { ...scene, gauge: { offset, end, times, passes }, step: { kind: 'start' } };
      }
      case 'read': {
        const g = need(scene, 'read');
        const from = int(p, 'from', 'read');
        const next = int(p, 'next', 'read');
        const offsets = ints(p, 'offsets', 'read');
        const values = ints(p, 'values', 'read');
        const times = ints(p, 'times', 'read');
        if (from !== g.offset) throw new Error(`read.payload.from: ${from} 이 지금 오프셋 ${g.offset} 과 다르다`);
        if (next > g.end || next <= from) throw new Error(`read.payload.next: ${next} 가 ${from}..${g.end} 안에 없다`);
        if (offsets.length !== next - from || values.length !== offsets.length) {
          throw new Error('read.payload.offsets/values: 읽은 개수가 next − from 과 다르다');
        }
        offsets.forEach((o, i) => {
          if (o !== from + i) throw new Error(`read.payload.offsets[${i}]: ${o} 가 차례에 맞지 않다`);
          if (scene.values[o] !== values[i]) throw new Error(`read.payload.values[${i}]: 로그 오프셋 ${o} 의 값과 다르다`);
        });
        if (times.length !== g.end) throw new Error('read.payload.times: 길이가 끝과 다르다');
        return {
          ...scene,
          gauge: { ...g, offset: next, times },
          step: { kind: 'read', from, next, offsets, values },
        };
      }
      case 'rewind': {
        const g = need(scene, 'rewind');
        const from = int(p, 'from', 'rewind');
        const to = int(p, 'to', 'rewind');
        const records = int(p, 'records', 'rewind');
        if (from !== g.offset) throw new Error(`rewind.payload.from: ${from} 이 지금 오프셋 ${g.offset} 과 다르다`);
        if (to < 0 || to > g.end) throw new Error(`rewind.payload.to: ${to} 는 0..${g.end} 밖이다`);
        if (records !== scene.values.length) throw new Error('rewind.payload.records: 로그 길이와 다르다');
        return {
          ...scene,
          gauge: { ...g, offset: to, times: g.times.slice() },
          step: { kind: 'rewind', from, to, records },
        };
      }
      default:
        throw new Error(`replayFromOffsetScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
