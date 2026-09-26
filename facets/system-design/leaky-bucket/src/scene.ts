/**
 * 누출 버킷의 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 한다.
 *
 * 바탕: capacity · leakEvery · requests (initialData) · lastSec · arrivalGaps (silent init)
 * 자취: sec · arrived · bucket · dropped · exits
 * 이번 걸음: step (그 초에 일어난 일과 움직임의 계기값 before)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowLeakyBucketData, type LeakyRequest } from './algorithm.js';

export type LeakyExit = { id: string; at: number; gap: number | null };

export type LeakyStep = {
  sec: number;
  came: string[];
  dropped: string[];
  afterIn: string[];
  out: string | null;
  gap: number | null;
  /** 이 초가 시작될 때의 통 — 움직임의 출발 자리 */
  before: string[];
};

export type LeakyBucketScene = {
  capacity: number;
  leakEvery: number;
  requests: LeakyRequest[];
  lastSec: number | null;
  /** requests 와 같은 차례. 첫 요청은 null */
  arrivalGaps: Array<number | null> | null;
  sec: number | null;
  arrived: string[];
  bucket: string[];
  dropped: string[];
  exits: LeakyExit[];
  step: LeakyStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringList(v: unknown, path: string): string[] {
  if (!Array.isArray(v)) throw new Error(`leakyBucketScene: ${path} 가 배열이 아니다`);
  return v.map((x: unknown, i: number) => {
    if (typeof x !== 'string') throw new Error(`leakyBucketScene: ${path}[${i}] 가 문자열이 아니다`);
    return x;
  });
}

function intOrNull(v: unknown, path: string): number | null {
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`leakyBucketScene: ${path} 가 정수나 null 이 아니다`);
  return v;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function reduceInit(scene: LeakyBucketScene, payload: Record<string, unknown>): LeakyBucketScene {
  const lastSec = intOrNull(payload.lastSec, 'init.payload.lastSec');
  if (lastSec === null || lastSec < 0) throw new Error('leakyBucketScene: init.payload.lastSec 가 0 이상의 정수가 아니다');
  const gapsRaw = payload.arrivalGaps;
  if (!Array.isArray(gapsRaw) || gapsRaw.length !== scene.requests.length) {
    throw new Error('leakyBucketScene: init.payload.arrivalGaps 의 길이가 요청 수와 다르다');
  }
  const arrivalGaps = gapsRaw.map((g: unknown, i: number) => {
    if (!isRecord(g) || g.id !== scene.requests[i].id) {
      throw new Error(`leakyBucketScene: init.payload.arrivalGaps[${i}].id 가 요청 차례와 다르다`);
    }
    return intOrNull(g.gap, `init.payload.arrivalGaps[${i}].gap`);
  });
  return { ...scene, lastSec, arrivalGaps };
}

function reduceSecond(scene: LeakyBucketScene, payload: Record<string, unknown>): LeakyBucketScene {
  if (scene.lastSec === null) throw new Error('leakyBucketScene: init 앞에 second 가 왔다');
  const sec = intOrNull(payload.sec, 'second.payload.sec');
  const expected = scene.sec === null ? 0 : scene.sec + 1;
  if (sec !== expected) throw new Error(`leakyBucketScene: second.payload.sec 가 ${expected} 가 아니다 (${String(sec)})`);
  const came = stringList(payload.came, 'second.payload.came');
  const dropped = stringList(payload.dropped, 'second.payload.dropped');
  const afterIn = stringList(payload.afterIn, 'second.payload.afterIn');
  const bucket = stringList(payload.bucket, 'second.payload.bucket');
  const gap = intOrNull(payload.gap, 'second.payload.gap');
  const outRaw = payload.out;
  if (outRaw !== null && typeof outRaw !== 'string') throw new Error('leakyBucketScene: second.payload.out 가 문자열이나 null 이 아니다');
  const out: string | null = outRaw;

  for (const [i, id] of came.entries()) {
    const req = scene.requests.find((r) => r.id === id);
    if (!req) throw new Error(`leakyBucketScene: second.payload.came[${i}] (${id}) 가 요청에 없다`);
    if (req.at !== sec) throw new Error(`leakyBucketScene: second.payload.came[${i}] (${id}) 의 도착 시각이 ${sec} 가 아니다`);
    if (scene.arrived.includes(id)) throw new Error(`leakyBucketScene: second.payload.came[${i}] (${id}) 는 이미 왔다`);
  }
  for (const [i, id] of dropped.entries()) {
    if (!came.includes(id)) throw new Error(`leakyBucketScene: second.payload.dropped[${i}] (${id}) 가 이 초에 온 요청이 아니다`);
  }
  if (!sameList(afterIn.slice(0, scene.bucket.length), scene.bucket)) {
    throw new Error('leakyBucketScene: second.payload.afterIn 이 앞 장면의 통으로 시작하지 않는다');
  }
  for (const [i, id] of afterIn.slice(scene.bucket.length).entries()) {
    if (!came.includes(id) || dropped.includes(id)) {
      throw new Error(`leakyBucketScene: second.payload.afterIn[${scene.bucket.length + i}] (${id}) 는 이 초에 받은 요청이 아니다`);
    }
  }
  if (afterIn.length > scene.capacity) throw new Error('leakyBucketScene: second.payload.afterIn 이 용량을 넘는다');
  if (out !== null) {
    if (afterIn[0] !== out) throw new Error(`leakyBucketScene: second.payload.out (${out}) 이 통 머리가 아니다`);
    if (!sameList(bucket, afterIn.slice(1))) throw new Error('leakyBucketScene: second.payload.bucket 이 머리를 뺀 통이 아니다');
    if (scene.exits.length === 0 ? gap !== null : gap === null) {
      throw new Error('leakyBucketScene: second.payload.gap 이 앞선 흘림과 맞지 않는다');
    }
  } else {
    if (!sameList(bucket, afterIn)) throw new Error('leakyBucketScene: second.payload.bucket 이 afterIn 과 다르다 (흘림 없음)');
    if (gap !== null) throw new Error('leakyBucketScene: 흘림이 없는데 second.payload.gap 이 있다');
  }

  return {
    ...scene,
    sec,
    arrived: [...scene.arrived, ...came],
    bucket: [...bucket],
    dropped: [...scene.dropped, ...dropped],
    exits: out === null ? scene.exits : [...scene.exits, { id: out, at: sec, gap }],
    step: {
      sec,
      came: [...came],
      dropped: [...dropped],
      afterIn: [...afterIn],
      out,
      gap,
      before: [...scene.bucket],
    },
  };
}

export const leakyBucketScene: ScenePlan<LeakyBucketScene> = {
  initial(initialData: unknown): LeakyBucketScene {
    const data = narrowLeakyBucketData(initialData);
    return {
      capacity: data.capacity,
      leakEvery: data.leakEvery,
      requests: data.requests.map((r) => ({ id: r.id, at: r.at })),
      lastSec: null,
      arrivalGaps: null,
      sec: null,
      arrived: [],
      bucket: [],
      dropped: [],
      exits: [],
      step: null,
    };
  },
  reduce(scene: LeakyBucketScene, event: FacetRuntimeEvent): LeakyBucketScene {
    const payload = event.payload;
    if (!isRecord(payload)) throw new Error(`leakyBucketScene: ${event.type} 의 payload 가 객체가 아니다`);
    switch (event.type) {
      case 'init':
        return reduceInit(scene, payload);
      case 'second':
        return reduceSecond(scene, payload);
      default:
        throw new Error(`leakyBucketScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
