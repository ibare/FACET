/**
 * key-to-value 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 한다.
 *
 * 바탕: 저장소의 짝 · 물음 둘 (initialData 에서 베낀다. 걸음 0 이 곧 저장소)
 * 자취: 바깥으로 나온 값들 (`out`) · 두 물음의 꺼낸 값 셈
 * 이번 걸음: `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type StorePair = { key: string; value: string };

/** 바깥으로 나온 값 하나. check 가 null 이면 ① 에서 나온 값 (열어 가리지 않는다) */
export type OutCard = {
  key: string;
  value: string;
  check: { found: string; match: boolean } | null;
};

export type KeyToValueStep =
  | { kind: 'store' }
  | { kind: 'get'; key: string }
  | { kind: 'scan'; key: string; found: string; match: boolean }
  | { kind: 'done' };

export type KeyToValueScene = {
  pairs: StorePair[];
  getKey: string;
  field: string;
  want: string;
  /** 지금 바깥에 나와 있는 값들. ① 의 값은 ② 가 시작되면 치운다 */
  out: OutCard[];
  /** ① 에서 꺼낸 값 */
  byKey: number;
  /** ② 에서 꺼낸 값 */
  byField: number;
  /** ② 에서 맞은 것 */
  matched: number;
  step: KeyToValueStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(rec: Record<string, unknown>, name: string, where: string): string {
  const v = rec[name];
  if (typeof v !== 'string') throw new Error(`keyToValueScene: ${where} 의 ${name} 가 글자가 아니다`);
  return v;
}

function num(rec: Record<string, unknown>, name: string, where: string): number {
  const v = rec[name];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`keyToValueScene: ${where} 의 ${name} 가 수가 아니다`);
  }
  return v;
}

function bool(rec: Record<string, unknown>, name: string, where: string): boolean {
  const v = rec[name];
  if (typeof v !== 'boolean') throw new Error(`keyToValueScene: ${where} 의 ${name} 가 참거짓이 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`keyToValueScene: ${event.type} 에 payload 가 없다`);
  return event.payload;
}

/** initialData 를 좁힌다 (없거나 틀리면 null). 장면의 initial 만 부른다 — stage 는 장면에서 읽는다 */
export function readStoreData(
  raw: unknown,
): { pairs: StorePair[]; getKey: string; field: string; want: string } | null {
  if (!isRecord(raw)) return null;
  const { pairs, get, field, want } = raw;
  if (!Array.isArray(pairs) || typeof get !== 'string' || typeof field !== 'string' || typeof want !== 'string') {
    return null;
  }
  const out: StorePair[] = [];
  for (const p of pairs) {
    if (!isRecord(p) || typeof p.key !== 'string' || typeof p.value !== 'string') return null;
    out.push({ key: p.key, value: p.value });
  }
  return { pairs: out, getKey: get, field, want };
}

export const keyToValueScene: ScenePlan<KeyToValueScene> = {
  initial(initialData: unknown): KeyToValueScene {
    const base = readStoreData(initialData);
    if (base === null) throw new Error('keyToValueScene: initialData 의 모양이 틀렸다');
    return {
      pairs: base.pairs,
      getKey: base.getKey,
      field: base.field,
      want: base.want,
      out: [],
      byKey: 0,
      byField: 0,
      matched: 0,
      step: { kind: 'store' },
    };
  },

  reduce(scene: KeyToValueScene, event: FacetRuntimeEvent): KeyToValueScene {
    switch (event.type) {
      case 'get': {
        const p = payloadOf(event);
        const key = str(p, 'key', 'get');
        return {
          ...scene,
          out: [{ key, value: str(p, 'value', 'get'), check: null }],
          byKey: num(p, 'taken', 'get'),
          step: { kind: 'get', key },
        };
      }
      case 'scan': {
        const p = payloadOf(event);
        const key = str(p, 'key', 'scan');
        const found = str(p, 'found', 'scan');
        const match = bool(p, 'match', 'scan');
        // ② 가 시작되면 ① 의 값은 치운다 — 두 물음은 따로 센다
        const kept = scene.step.kind === 'scan' ? scene.out : [];
        return {
          ...scene,
          out: [...kept, { key, value: str(p, 'value', 'scan'), check: { found, match } }],
          byField: num(p, 'taken', 'scan'),
          matched: num(p, 'matched', 'scan'),
          step: { kind: 'scan', key, found, match },
        };
      }
      case 'done': {
        const p = payloadOf(event);
        if (!Array.isArray(p.matched)) throw new Error('keyToValueScene: done 의 matched 가 목록이 아니다');
        return {
          ...scene,
          byKey: num(p, 'byKey', 'done'),
          byField: num(p, 'byField', 'done'),
          matched: p.matched.length,
          step: { kind: 'done' },
        };
      }
      default:
        throw new Error(`keyToValueScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
