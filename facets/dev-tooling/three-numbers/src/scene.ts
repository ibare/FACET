/**
 * three-numbers 장면.
 *
 * 바탕  — 처음 버전 (initialData 에서 initial 이 채운다)
 * 자취  — 지금 버전 · 지나온 버전들 · 0 으로 떨어진 일의 수 · 본 바뀐 것의 수
 * 이번 걸음 — step: 처음 / 바뀐 것들이 들어옴 / 자리가 오름
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { formatVersion, isChangeKind, parseVersion } from './algorithm.js';
import type { Change, Place, Version } from './algorithm.js';

export type ThreeNumbersStep =
  | { kind: 'start' }
  | { kind: 'release'; index: number }
  | { kind: 'bump'; index: number; from: Version; fromText: string; place: Place; dropped: number[] };

export type ThreeNumbersScene = {
  digits: Version;
  text: string;
  /** 지나온 버전 문자열 (처음 버전 포함, 지금 버전으로 끝난다) */
  history: string[];
  /** 지금 내보냄의 바뀐 것들 — 아직 없으면 null */
  release: { index: number; changes: Change[]; heaviest: string } | null;
  releases: number;
  changesSeen: number;
  drops: number;
  done: boolean;
  step: ThreeNumbersStep;
};

function readStart(initialData: unknown): string {
  if (typeof initialData === 'object' && initialData !== null && 'start' in initialData) {
    const start = (initialData as { start: unknown }).start;
    if (typeof start === 'string') return start;
  }
  throw new Error('three-numbers: initialData.start 가 없다');
}

function readVersion(x: unknown, what: string): Version {
  if (Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === 'number')) {
    return [x[0] as number, x[1] as number, x[2] as number];
  }
  throw new Error(`three-numbers: ${what} 가 세 수가 아니다`);
}

function readNum(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number') throw new Error(`three-numbers: payload.${key} 가 수가 아니다`);
  return v;
}

function readStr(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`three-numbers: payload.${key} 가 글자가 아니다`);
  return v;
}

function readPlace(n: number): Place {
  if (n === 0 || n === 1 || n === 2) return n;
  throw new Error(`three-numbers: 모르는 자리 ${n}`);
}

function readChanges(x: unknown): Change[] {
  if (!Array.isArray(x)) throw new Error('three-numbers: payload.changes 가 목록이 아니다');
  return x.map((c: unknown) => {
    if (typeof c !== 'object' || c === null) throw new Error('three-numbers: 바뀐 것 모양이 틀렸다');
    const id = (c as Record<string, unknown>)['id'];
    const kind = (c as Record<string, unknown>)['kind'];
    if (typeof id !== 'string' || !isChangeKind(kind)) throw new Error('three-numbers: 바뀐 것 모양이 틀렸다');
    return { id, kind };
  });
}

export const threeNumbersScene: ScenePlan<ThreeNumbersScene> = {
  initial(initialData: unknown): ThreeNumbersScene {
    const start = readStart(initialData);
    const digits = parseVersion(start);
    return {
      digits,
      text: formatVersion(digits),
      history: [formatVersion(digits)],
      release: null,
      releases: 0,
      changesSeen: 0,
      drops: 0,
      done: false,
      step: { kind: 'start' },
    };
  },

  reduce(scene: ThreeNumbersScene, event: FacetRuntimeEvent): ThreeNumbersScene {
    const p = event.payload;
    if (typeof p !== 'object' || p === null) return scene;
    const o = p as Record<string, unknown>;

    if (event.type === 'release') {
      const index = readNum(o, 'index');
      const changes = readChanges(o['changes']);
      const heaviest = readStr(o, 'heaviest');
      return {
        ...scene,
        release: { index, changes, heaviest },
        releases: scene.releases + 1,
        changesSeen: scene.changesSeen + changes.length,
        step: { kind: 'release', index },
      };
    }

    if (event.type === 'bump') {
      const index = readNum(o, 'index');
      const from = readVersion(o['from'], 'payload.from');
      const to = readVersion(o['to'], 'payload.to');
      const place = readPlace(readNum(o, 'place'));
      const droppedRaw = o['dropped'];
      if (!Array.isArray(droppedRaw) || !droppedRaw.every((n) => typeof n === 'number')) {
        throw new Error('three-numbers: payload.dropped 가 수 목록이 아니다');
      }
      const dropped = droppedRaw.map((n) => n as number);
      const toText = readStr(o, 'toText');
      return {
        ...scene,
        digits: to,
        text: toText,
        history: [...scene.history, toText],
        drops: scene.drops + dropped.length,
        done: o['last'] === true,
        step: { kind: 'bump', index, from, fromText: readStr(o, 'fromText'), place, dropped },
      };
    }

    return scene;
  },
};
