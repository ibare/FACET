/**
 * pin-what-was-chosen 의 장면.
 *
 * 바탕: 요구(wants) · 선반 칸 수(capacity).
 * 자취: 공개된 버전(published — 새 버전이 나오면 버전 차례로 끼어든다) · 나중에 나온 버전(fresh) ·
 *       첫 설치(first) · 잠금 파일의 줄(lock — 적기 전엔 null) · 둘째 설치(second).
 * 이번 걸음: step.
 *
 * 셈(범위 안 가장 큰 것 · 범위 안인가)은 알고리즘이 이벤트에 실어 보낸다. 장면은 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { compareVersions, readPinData, type Shelf, type Want } from './algorithm.js';

export type Pinned = { name: string; version: string };
export type Fresh = { name: string; version: string; inRange: boolean };

export type PinStep =
  | { kind: 'start' }
  | { kind: 'pick'; name: string; range: string; version: string }
  | { kind: 'write'; count: number }
  | { kind: 'release'; count: number; inRange: number }
  | { kind: 'read'; name: string; version: string };

export type PinScene = {
  wants: Want[];
  /** 한 꾸러미가 끝내 갖게 될 공개 버전 수의 최댓값 — 선반 칸 수. 걸음마다 칸이 바뀌지 않게 바탕에서 정한다 */
  capacity: number;
  published: Shelf[];
  fresh: Fresh[];
  first: Pinned[];
  lock: Pinned[] | null;
  second: Pinned[];
  step: PinStep;
};

function rec(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error('pin-what-was-chosen scene: payload 가 객체가 아니다');
  }
  return v as Record<string, unknown>;
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`pin-what-was-chosen scene: ${key} 가 문자열이 아니다`);
  return v;
}

function list(o: Record<string, unknown>, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`pin-what-was-chosen scene: ${key} 가 배열이 아니다`);
  return v;
}

function pinned(v: unknown): Pinned {
  const o = rec(v);
  return { name: str(o, 'name'), version: str(o, 'version') };
}

export const pinWhatWasChosenScene: ScenePlan<PinScene> = {
  initial(initialData: unknown): PinScene {
    const data = readPinData(initialData);
    let capacity = 0;
    for (const w of data.wants) {
      const now = data.published.find((s) => s.name === w.name);
      if (!now) throw new Error(`pin-what-was-chosen scene: ${w.name} 의 공개 목록이 없다`);
      const later = data.later.find((s) => s.name === w.name);
      capacity = Math.max(capacity, now.versions.length + (later ? later.versions.length : 0));
    }
    return {
      wants: data.wants.map((w) => ({ ...w })),
      capacity,
      published: data.published.map((s) => ({ name: s.name, versions: [...s.versions] })),
      fresh: [],
      first: [],
      lock: null,
      second: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: PinScene, event: FacetRuntimeEvent): PinScene {
    if (event.type === 'install-first') {
      const p = rec(event.payload);
      const name = str(p, 'name');
      const version = str(p, 'version');
      return {
        ...scene,
        first: [...scene.first, { name, version }],
        step: { kind: 'pick', name, range: str(p, 'range'), version },
      };
    }
    if (event.type === 'lock-write') {
      const entries = list(rec(event.payload), 'entries').map(pinned);
      return { ...scene, lock: entries, step: { kind: 'write', count: entries.length } };
    }
    if (event.type === 'release') {
      const versions: Fresh[] = list(rec(event.payload), 'versions').map((v) => {
        const o = rec(v);
        const flag = o['inRange'];
        if (typeof flag !== 'boolean') throw new Error('pin-what-was-chosen scene: inRange 가 참거짓이 아니다');
        return { name: str(o, 'name'), version: str(o, 'version'), inRange: flag };
      });
      const published = scene.published.map((s) => {
        const add = versions.filter((f) => f.name === s.name).map((f) => f.version);
        return { name: s.name, versions: [...s.versions, ...add].sort(compareVersions) };
      });
      for (const f of versions) {
        if (!published.some((s) => s.name === f.name)) {
          throw new Error(`pin-what-was-chosen scene: ${f.name} 의 공개 목록이 없다`);
        }
      }
      return {
        ...scene,
        published,
        fresh: [...scene.fresh, ...versions],
        step: { kind: 'release', count: versions.length, inRange: versions.filter((f) => f.inRange).length },
      };
    }
    if (event.type === 'install-second') {
      const p = pinned(event.payload);
      return { ...scene, second: [...scene.second, p], step: { kind: 'read', name: p.name, version: p.version } };
    }
    throw new Error(`pin-what-was-chosen scene: 모르는 이벤트 ${event.type}`);
  },
};
