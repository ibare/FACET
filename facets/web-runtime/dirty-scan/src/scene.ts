/**
 * dirty-scan 의 장면 — 이벤트를 화면 명령이 아니라 상태로 잇는다.
 *
 * 바탕(init 이 한 번 정하는 것) — 훑는 차례(`names`).
 * 자취(걸음이 쌓는 것)  — `now`(쓰기가 바꾸는 지금 값) · `last`(들여다보기가 다르면
 *   갈아 끼우는 지난번 값) · `everDirty`(한 번이라도 다르다고 나온 이름, 다시 그린
 *   자리를 되짚어도 남기려고) · `looks`(들여다본 수) · `dirtyFound`(다른 것으로 나온
 *   누적 수) · `pass`(지금 또는 마지막 바퀴 번호).
 * 이번 걸음(`step`) — 쓰기인지 들여다보기인지, 그 인자.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { DirtyScanFacetData } from './algorithm.js';

export type ScalarValue = string | number;

export type DirtyScanStep =
  | { kind: 'init' }
  | { kind: 'write'; name: string; from: ScalarValue; to: ScalarValue }
  | {
      kind: 'look';
      name: string;
      pass: number;
      lookIndex: number;
      last: ScalarValue;
      now: ScalarValue;
      dirty: boolean;
    };

export type DirtyScanScene = {
  names: string[];
  now: Record<string, ScalarValue>;
  last: Record<string, ScalarValue>;
  everDirty: string[];
  looks: number;
  dirtyFound: number;
  pass: number;
  step: DirtyScanStep;
};

function asRecord(payload: unknown, where: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`dirty-scan scene — ${where} payload 가 객체가 아니다`);
  }
  return payload as Record<string, unknown>;
}

function requireString(v: unknown, where: string): string {
  if (typeof v !== 'string') throw new Error(`dirty-scan scene — ${where} 이 문자열이 아니다`);
  return v;
}

function requireNumber(v: unknown, where: string): number {
  if (typeof v !== 'number') throw new Error(`dirty-scan scene — ${where} 이 수가 아니다`);
  return v;
}

function requireBoolean(v: unknown, where: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`dirty-scan scene — ${where} 이 불 값이 아니다`);
  return v;
}

function requireScalar(v: unknown, where: string): ScalarValue {
  if (typeof v === 'string' || typeof v === 'number') return v;
  throw new Error(`dirty-scan scene — ${where} 이 문자열도 수도 아니다`);
}

function initial(initialData: unknown): DirtyScanScene {
  const data = initialData as DirtyScanFacetData;
  if (!Array.isArray(data.watched) || data.watched.length === 0) {
    throw new Error('dirty-scan initialData.watched 가 비었다');
  }
  const names: string[] = [];
  const now: Record<string, ScalarValue> = {};
  const last: Record<string, ScalarValue> = {};
  for (const w of data.watched) {
    names.push(w.name);
    now[w.name] = w.value;
    last[w.name] = w.value;
  }
  return { names, now, last, everDirty: [], looks: 0, dirtyFound: 0, pass: 0, step: { kind: 'init' } };
}

function reduce(scene: DirtyScanScene, event: FacetRuntimeEvent): DirtyScanScene {
  if (event.type === 'write') {
    const p = asRecord(event.payload, 'write');
    const name = requireString(p.name, 'write.name');
    const from = requireScalar(p.from, 'write.from');
    const to = requireScalar(p.to, 'write.to');
    return {
      ...scene,
      now: { ...scene.now, [name]: to },
      step: { kind: 'write', name, from, to },
    };
  }
  if (event.type === 'look') {
    const p = asRecord(event.payload, 'look');
    const name = requireString(p.name, 'look.name');
    const pass = requireNumber(p.pass, 'look.pass');
    const lookIndex = requireNumber(p.lookIndex, 'look.lookIndex');
    const lastValue = requireScalar(p.last, 'look.last');
    const nowValue = requireScalar(p.now, 'look.now');
    const dirty = requireBoolean(p.dirty, 'look.dirty');
    const everDirty = dirty && !scene.everDirty.includes(name) ? [...scene.everDirty, name] : scene.everDirty;
    return {
      ...scene,
      last: dirty ? { ...scene.last, [name]: nowValue } : scene.last,
      everDirty,
      looks: lookIndex,
      dirtyFound: scene.dirtyFound + (dirty ? 1 : 0),
      pass,
      step: { kind: 'look', name, pass, lookIndex, last: lastValue, now: nowValue, dirty },
    };
  }
  throw new Error(`dirty-scan scene 이 모르는 이벤트: ${event.type}`);
}

export const dirtyScanScene: ScenePlan<DirtyScanScene> = { initial, reduce };
