/**
 * collision-and-backoff 의 장면.
 *
 * - 바탕: 스테이션 식별자 · 프레임 길이 · 재생 전체의 슬롯 수 (`init`)
 * - 자취: 선이 슬롯마다 겪은 일 · 충돌 뒤 쥔 기다림 · 찬 선을 듣고 미룬 슬롯 · 충돌 수
 * - 이번 걸음: `step` — 막 지나간 슬롯
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트를 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneHeard = { id: string; busy: boolean };
export type ScenePick = { id: string; n: number; k: number; hi: number; relisten: number };
export type SceneWaitLeft = { id: string; left: number };

export type SlotStep = {
  slot: number;
  heard: SceneHeard[];
  senders: string[];
  collision: boolean;
  picks: ScenePick[];
  left: number | null;
  doneBy: string | null;
  waitLeft: SceneWaitLeft[];
  finished: boolean;
};

/** 선이 한 슬롯에 겪은 일. */
export type LineCell = { slot: number; senders: string[]; collision: boolean };
/** 충돌 뒤 쥔 기다림 — 슬롯 `from` 머리부터 `until` 머리까지 쉰다. */
export type HeldWait = { id: string; from: number; until: number; k: number; hi: number };
/** 찬 선을 듣고 미룬 슬롯. */
export type Deferral = { id: string; slot: number };

export type CollisionAndBackoffScene = {
  stations: string[];
  frameSlots: number;
  slots: number;
  /** 첫 슬롯에 보낼 프레임이 준비된 스테이션 수 (`init`). */
  ready: number;
  cells: LineCell[];
  waits: HeldWait[];
  deferrals: Deferral[];
  collisions: number;
  /** 지금 시각 — 지나간 슬롯의 수 = 다음 슬롯의 번호. */
  now: number;
  step: SlotStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number') throw new Error(`collision-and-backoff scene: ${key} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`collision-and-backoff scene: ${key} 가 글자가 아니다`);
  return v;
}

function bool(o: Record<string, unknown>, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`collision-and-backoff scene: ${key} 가 참거짓이 아니다`);
  return v;
}

function list(o: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`collision-and-backoff scene: ${key} 가 목록이 아니다`);
  return v.map((x) => {
    if (!isRecord(x)) throw new Error(`collision-and-backoff scene: ${key} 의 칸이 객체가 아니다`);
    return x;
  });
}

function strList(o: Record<string, unknown>, key: string): string[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`collision-and-backoff scene: ${key} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`collision-and-backoff scene: ${key} 의 칸이 글자가 아니다`);
    return x;
  });
}

function numOrNull(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== 'number') throw new Error(`collision-and-backoff scene: ${key} 가 수도 null 도 아니다`);
  return v;
}

function strOrNull(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`collision-and-backoff scene: ${key} 가 글자도 null 도 아니다`);
  return v;
}

function readStep(payload: unknown): SlotStep {
  if (!isRecord(payload)) throw new Error('collision-and-backoff scene: slot payload 가 객체가 아니다');
  return {
    slot: num(payload, 'slot'),
    heard: list(payload, 'heard').map((h) => ({ id: str(h, 'id'), busy: bool(h, 'busy') })),
    senders: strList(payload, 'senders'),
    collision: bool(payload, 'collision'),
    picks: list(payload, 'picks').map((p) => ({
      id: str(p, 'id'),
      n: num(p, 'n'),
      k: num(p, 'k'),
      hi: num(p, 'hi'),
      relisten: num(p, 'relisten'),
    })),
    left: numOrNull(payload, 'left'),
    doneBy: strOrNull(payload, 'doneBy'),
    waitLeft: list(payload, 'waitLeft').map((w) => ({ id: str(w, 'id'), left: num(w, 'left') })),
    finished: bool(payload, 'finished'),
  };
}

/** initialData 에서 스테이션 식별자만 베낀다. 모양이 아니면 던진다 (C6). */
function readStations(initialData: Record<string, unknown>): string[] {
  return list(initialData, 'stations').map((s) => str(s, 'id'));
}

export const collisionAndBackoffScene: ScenePlan<CollisionAndBackoffScene> = {
  initial(initialData: unknown): CollisionAndBackoffScene {
    if (!isRecord(initialData)) {
      throw new Error('collision-and-backoff scene: initialData 가 객체가 아니다');
    }
    return {
      stations: readStations(initialData),
      frameSlots: num(initialData, 'frameSlots'),
      slots: 0,
      ready: 0,
      cells: [],
      waits: [],
      deferrals: [],
      collisions: 0,
      now: 0,
      step: null,
    };
  },

  reduce(scene: CollisionAndBackoffScene, event: FacetRuntimeEvent): CollisionAndBackoffScene {
    if (event.type === 'init') {
      if (!isRecord(event.payload)) throw new Error('collision-and-backoff scene: init payload 가 객체가 아니다');
      return { ...scene, slots: num(event.payload, 'slots'), ready: num(event.payload, 'ready') };
    }
    if (event.type === 'slot') {
      const step = readStep(event.payload);
      const cell: LineCell = { slot: step.slot, senders: [...step.senders], collision: step.collision };
      const waits: HeldWait[] = step.picks.map((p) => ({
        id: p.id,
        from: step.slot + 1,
        until: p.relisten,
        k: p.k,
        hi: p.hi,
      }));
      const deferrals: Deferral[] = step.heard
        .filter((h) => h.busy)
        .map((h) => ({ id: h.id, slot: step.slot }));
      return {
        ...scene,
        cells: [...scene.cells, cell],
        waits: [...scene.waits, ...waits],
        deferrals: [...scene.deferrals, ...deferrals],
        collisions: scene.collisions + (step.collision ? 1 : 0),
        now: step.slot + 1,
        step,
      };
    }
    return scene;
  },
};
