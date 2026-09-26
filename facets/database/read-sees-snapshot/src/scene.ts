/**
 * readSeesSnapshot 의 장면 — 이벤트를 판 사슬과 스냅샷 · 읽기의 자취로 잇는다.
 *
 * 바탕: 줄 이름 · 틱 자(처음 판의 틱부터 마지막 사건의 틱까지) · 판의 총수(색을 가른다).
 * 자취: 판 사슬 · 시작한 트랜잭션의 스냅샷 · 읽기.
 * 이번 걸음: step.
 *
 * 셈(보임 판 고르기 · 커밋이 닫는 판)은 알고리즘이 한다. 장면은 그 결과만 옮긴다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneVersion = {
  value: number;
  /** null 이면 커밋 전 */
  start: number | null;
  /** null 이면 끝 없음 */
  end: number | null;
  /** 쓴 트랜잭션. 처음 판은 null */
  by: string | null;
  /** 쓴 틱. 처음 판은 null */
  wroteAt: number | null;
};

export type SceneSnap = { txn: string; snap: number };
export type SceneRead = { txn: string; snap: number; value: number; version: number };

export type SnapshotStep =
  | { kind: 'start' }
  | { kind: 'begin'; txn: string; snap: number }
  | { kind: 'write'; txn: string; value: number; version: number }
  | { kind: 'commit'; txn: string; version: number; closed: number }
  | { kind: 'read'; txn: string; snap: number; value: number; version: number };

export type SnapshotScene = {
  row: string;
  /** 틱 자의 첫 눈금 (처음 판의 시작 틱) */
  t0: number;
  /** 틱 자의 마지막 눈금 (마지막 사건의 틱) */
  lastTick: number;
  /** 사슬에 생길 판의 총수 */
  versionTotal: number;
  /** 지금 틱 */
  tick: number;
  versions: SceneVersion[];
  snaps: SceneSnap[];
  reads: SceneRead[];
  step: SnapshotStep;
};

function record(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string, what: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what}.${key} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, key: string, what: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`${what}.${key} 가 글자가 아니다`);
  return v;
}

function versionAt(scene: SnapshotScene, i: number): SceneVersion {
  const v = scene.versions[i];
  if (v === undefined) throw new Error(`판 ${i} 이 사슬에 없다`);
  return v;
}

export const readSeesSnapshotScene: ScenePlan<SnapshotScene> = {
  initial(initialData: unknown): SnapshotScene {
    const d = record(initialData, 'initialData');
    const row = str(d, 'row', 'initialData');
    const value = num(d, 'value', 'initialData');
    const t0 = num(d, 'versionTick', 'initialData');
    const firstTick = num(d, 'firstTick', 'initialData');
    const events = d['events'];
    if (!Array.isArray(events)) throw new Error('initialData.events 가 배열이 아니다');
    let writes = 0;
    for (const e of events) {
      if (str(record(e, 'event'), 'kind', 'event') === 'write') writes += 1;
    }
    return {
      row,
      t0,
      lastTick: firstTick + events.length - 1,
      versionTotal: 1 + writes,
      tick: t0,
      versions: [{ value, start: t0, end: null, by: null, wroteAt: null }],
      snaps: [],
      reads: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: SnapshotScene, event: FacetRuntimeEvent): SnapshotScene {
    const p = record(event.payload, `${event.type}.payload`);
    const tick = num(p, 'tick', event.type);
    const txn = str(p, 'txn', event.type);
    switch (event.type) {
      case 'begin': {
        const snap = num(p, 'snap', event.type);
        return {
          ...scene,
          tick,
          snaps: [...scene.snaps, { txn, snap }],
          step: { kind: 'begin', txn, snap },
        };
      }
      case 'write': {
        const value = num(p, 'value', event.type);
        const version = num(p, 'version', event.type);
        if (version !== scene.versions.length) throw new Error(`판 ${version} 이 사슬 끝 자리가 아니다`);
        return {
          ...scene,
          tick,
          versions: [...scene.versions, { value, start: null, end: null, by: txn, wroteAt: tick }],
          step: { kind: 'write', txn, value, version },
        };
      }
      case 'commit': {
        const version = num(p, 'version', event.type);
        const closed = num(p, 'closed', event.type);
        versionAt(scene, version);
        versionAt(scene, closed);
        return {
          ...scene,
          tick,
          versions: scene.versions.map((v, i) =>
            i === version ? { ...v, start: tick } : i === closed ? { ...v, end: tick } : { ...v },
          ),
          step: { kind: 'commit', txn, version, closed },
        };
      }
      case 'read': {
        const snap = num(p, 'snap', event.type);
        const value = num(p, 'value', event.type);
        const version = num(p, 'version', event.type);
        versionAt(scene, version);
        return {
          ...scene,
          tick,
          reads: [...scene.reads, { txn, snap, value, version }],
          step: { kind: 'read', txn, snap, value, version },
        };
      }
      default:
        throw new Error(`모르는 이벤트: ${event.type}`);
    }
  },
};
