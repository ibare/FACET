import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowIsolateTheFlood, SAY_KINDS, type IsolateTheFloodSayKind } from './algorithm';

/** 바탕 — 칸 하나. 칸 식별자 = 호출 대상 서비스 식별자 */
export type IsolateTheFloodBayBase = { id: string; size: number; stalled: boolean };

export type IsolateTheFloodReturned = { call: string; bay: string; slot: number };
export type IsolateTheFloodArrived = { call: string; bay: string; outcome: 'held' | 'away'; slot: number | null };

export type IsolateTheFloodStep = {
  returned: IsolateTheFloodReturned[];
  arrivals: IsolateTheFloodArrived[];
  say: { kind: IsolateTheFloodSayKind; stalled: string; other: string };
};

export type IsolateTheFloodScene = {
  /** 바탕 */
  bays: IsolateTheFloodBayBase[];
  /** 자취 — bays 와 같은 차례. 칸마다 스레드 자리의 호출(빈 자리는 null) */
  hold: (string | null)[][];
  /** 자취 — 칸마다 자리 없음으로 튕긴 호출 (튕긴 차례) */
  away: string[][];
  /** 자취 — 칸마다 돌아온 호출 (돌아온 차례) */
  back: string[][];
  /** 지금 틱. 걸음 0 은 null */
  tick: number | null;
  /** 이번 걸음 */
  step: IsolateTheFloodStep | null;
};

function fail(msg: string): never {
  throw new Error(`isolateTheFloodScene: ${msg}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readSlot(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(`${path} 가 자리 번호가 아니다`);
  return v;
}

function readText(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') fail(`${path} 가 문자열이 아니다`);
  return v;
}

function bayIndex(scene: IsolateTheFloodScene, id: string, path: string): number {
  const i = scene.bays.findIndex((b) => b.id === id);
  if (i === -1) fail(`${path} 의 칸 ${id} 가 바탕에 없다`);
  return i;
}

function reduceTick(scene: IsolateTheFloodScene, payload: unknown): IsolateTheFloodScene {
  if (!isRecord(payload)) fail('tick.payload 가 객체가 아니다');
  const tick = payload.tick;
  const want = scene.tick === null ? 0 : scene.tick + 1;
  if (tick !== want) fail(`tick.payload.tick 이 ${String(tick)} — 앞 장면 다음은 ${want}`);
  if (!Array.isArray(payload.returned)) fail('tick.payload.returned 가 배열이 아니다');
  if (!Array.isArray(payload.arrivals)) fail('tick.payload.arrivals 가 배열이 아니다');
  const say = payload.say;
  if (!isRecord(say)) fail('tick.payload.say 가 객체가 아니다');
  const kind = SAY_KINDS.find((k) => k === say.kind);
  if (kind === undefined) fail(`tick.payload.say.kind 를 모른다 (${String(say.kind)})`);
  const stalled = readText(say.stalled, 'tick.payload.say.stalled');
  const other = readText(say.other, 'tick.payload.say.other');
  bayIndex(scene, stalled, 'tick.payload.say.stalled');
  bayIndex(scene, other, 'tick.payload.say.other');

  const hold = scene.hold.map((h) => [...h]);
  const away = scene.away.map((a) => [...a]);
  const back = scene.back.map((b) => [...b]);

  const returned: IsolateTheFloodReturned[] = payload.returned.map((r: unknown, i: number) => {
    const path = `tick.payload.returned[${i}]`;
    if (!isRecord(r)) fail(`${path} 가 객체가 아니다`);
    const call = readText(r.call, `${path}.call`);
    const bay = readText(r.bay, `${path}.bay`);
    const slot = readSlot(r.slot, `${path}.slot`);
    const bi = bayIndex(scene, bay, path);
    const row = hold[bi] as (string | null)[];
    if (slot >= row.length) fail(`${path}.slot 이 칸 ${bay} 의 크기를 넘는다`);
    if (row[slot] !== call) fail(`${path} — 칸 ${bay} 의 자리 ${slot} 에 ${call} 가 없다`);
    row[slot] = null;
    (back[bi] as string[]).push(call);
    return { call, bay, slot };
  });

  const arrivals: IsolateTheFloodArrived[] = payload.arrivals.map((a: unknown, i: number) => {
    const path = `tick.payload.arrivals[${i}]`;
    if (!isRecord(a)) fail(`${path} 가 객체가 아니다`);
    const call = readText(a.call, `${path}.call`);
    const bay = readText(a.bay, `${path}.bay`);
    const bi = bayIndex(scene, bay, path);
    const row = hold[bi] as (string | null)[];
    if (a.outcome === 'held') {
      const slot = readSlot(a.slot, `${path}.slot`);
      if (slot >= row.length) fail(`${path}.slot 이 칸 ${bay} 의 크기를 넘는다`);
      if (row[slot] !== null) fail(`${path} — 칸 ${bay} 의 자리 ${slot} 가 비어 있지 않다`);
      row[slot] = call;
      return { call, bay, outcome: 'held', slot };
    }
    if (a.outcome === 'away') {
      if (a.slot !== null) fail(`${path}.slot 은 자리 없음이면 null 이어야 한다`);
      if (row.includes(null)) fail(`${path} — 칸 ${bay} 에 빈 스레드가 있는데 자리 없음이다`);
      (away[bi] as string[]).push(call);
      return { call, bay, outcome: 'away', slot: null };
    }
    return fail(`${path}.outcome 을 모른다 (${String(a.outcome)})`);
  });

  return {
    bays: scene.bays.map((b) => ({ ...b })),
    hold,
    away,
    back,
    tick: want,
    step: { returned, arrivals, say: { kind, stalled, other } },
  };
}

export const isolateTheFloodScene: ScenePlan<IsolateTheFloodScene> = {
  initial(initialData: unknown): IsolateTheFloodScene {
    const data = narrowIsolateTheFlood(initialData);
    const bays = data.bays.map((b) => {
      const svc = data.services.find((s) => s.id === b.id);
      if (!svc) fail(`칸 ${b.id} 의 서비스가 없다`);
      return { id: b.id, size: b.size, stalled: svc.returnsAfter === null };
    });
    return {
      bays,
      hold: bays.map((b) => new Array<string | null>(b.size).fill(null)),
      away: bays.map(() => []),
      back: bays.map(() => []),
      tick: null,
      step: null,
    };
  },

  reduce(scene: IsolateTheFloodScene, event: FacetRuntimeEvent): IsolateTheFloodScene {
    switch (event.type) {
      case 'tick':
        return reduceTick(scene, event.payload);
      default:
        return fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
