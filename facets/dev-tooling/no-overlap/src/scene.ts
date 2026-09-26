/**
 * no-overlap 장면.
 *
 * 바탕 — 꾸러미 이름 · 요구 목록 (initial 이 initialData 에서 베낀다. 걸음 0)
 * 자취 — 요구마다 풀린 두 끝 · 함께 쓸 아래 끝 · 위 끝 · 판정
 * 이번 걸음 — step
 *
 * 셈(두 끝 풀기 · 큰 것 / 작은 것 고르기 · 판정)은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type NoOverlapReq = { from: string; range: string };
export type NoOverlapEnd = { version: string; from: number };
export type NoOverlapVerdict = { empty: boolean; low: string; high: string; clash: number[] };

export type NoOverlapStep =
  | { kind: 'start' }
  | { kind: 'unfold'; index: number }
  | { kind: 'lower' }
  | { kind: 'upper' }
  | { kind: 'verdict' };

export type NoOverlapScene = {
  dep: string;
  reqs: NoOverlapReq[];
  /** 요구 index 마다 풀린 두 끝. 아직 안 풀렸으면 null */
  unfolded: Array<{ low: string; high: string } | null>;
  lower: NoOverlapEnd | null;
  upper: NoOverlapEnd | null;
  verdict: NoOverlapVerdict | null;
  step: NoOverlapStep;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`no-overlap: ${what} 가 객체가 아니다`);
  }
  return v as Record<string, unknown>;
}

function str(o: Record<string, unknown>, k: string, what: string): string {
  const v = o[k];
  if (typeof v !== 'string' || v === '') throw new Error(`no-overlap: ${what}.${k} 가 문자열이 아니다`);
  return v;
}

function int(o: Record<string, unknown>, k: string, what: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`no-overlap: ${what}.${k} 가 음 아닌 정수가 아니다`);
  }
  return v;
}

/** initialData 에서 꾸러미 이름과 요구 목록을 좁힌다. stage 도 같은 좁히개를 쓴다. */
export function readNoOverlapBase(data: unknown): { dep: string; reqs: NoOverlapReq[] } {
  const d = rec(data, 'initialData');
  const dep = str(d, 'dep', 'initialData');
  const raw = d['requests'];
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error('no-overlap: initialData.requests 는 요구 둘 이상의 배열이어야 한다');
  }
  const reqs = raw.map((r, i) => {
    const o = rec(r, `requests[${i}]`);
    return { from: str(o, 'from', `requests[${i}]`), range: str(o, 'range', `requests[${i}]`) };
  });
  return { dep, reqs };
}

export const noOverlapScene: ScenePlan<NoOverlapScene> = {
  initial(initialData: unknown): NoOverlapScene {
    const { dep, reqs } = readNoOverlapBase(initialData);
    return {
      dep,
      reqs,
      unfolded: reqs.map(() => null),
      lower: null,
      upper: null,
      verdict: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: NoOverlapScene, event: FacetRuntimeEvent): NoOverlapScene {
    const p = rec(event.payload ?? {}, `${event.type} payload`);
    switch (event.type) {
      case 'unfold': {
        const index = int(p, 'index', 'unfold');
        if (index >= scene.reqs.length) throw new Error(`no-overlap: 없는 요구 ${index}`);
        const unfolded = scene.unfolded.slice();
        unfolded[index] = { low: str(p, 'low', 'unfold'), high: str(p, 'high', 'unfold') };
        return { ...scene, unfolded, step: { kind: 'unfold', index } };
      }
      case 'lower':
        return {
          ...scene,
          lower: { version: str(p, 'version', 'lower'), from: int(p, 'from', 'lower') },
          step: { kind: 'lower' },
        };
      case 'upper':
        return {
          ...scene,
          upper: { version: str(p, 'version', 'upper'), from: int(p, 'from', 'upper') },
          step: { kind: 'upper' },
        };
      case 'verdict': {
        const empty = p['empty'];
        if (typeof empty !== 'boolean') throw new Error('no-overlap: verdict.empty 가 참거짓이 아니다');
        const clashRaw = p['clash'];
        if (!Array.isArray(clashRaw)) throw new Error('no-overlap: verdict.clash 가 배열이 아니다');
        const clash = clashRaw.map((c) => {
          if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= scene.reqs.length) {
            throw new Error(`no-overlap: verdict.clash 에 없는 요구 ${String(c)}`);
          }
          return c;
        });
        return {
          ...scene,
          verdict: { empty, low: str(p, 'low', 'verdict'), high: str(p, 'high', 'verdict'), clash },
          step: { kind: 'verdict' },
        };
      }
      default:
        throw new Error(`no-overlap: 모르는 이벤트 "${event.type}"`);
    }
  },
};
