/**
 * first-come-first-run 의 장면.
 *
 * 바탕  procs (식별자 · 도착 · 길이) · horizon (시간축 길이, init 이 정한다)
 * 자취  placed (CPU 에 오른 것의 시작 · 끝) · idles (CPU 가 빈 구간) · now (지금 틱)
 * 이번  step — 무엇이 일어났고, 지금 틱이 어디서 왔는가(from)
 *
 * 누가 언제 오르는지는 알고리즘이 셈했다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type FcfsSceneProc = { id: string; arrival: number; length: number };
export type FcfsPlaced = { id: string; start: number; end: number };
export type FcfsIdle = { from: number; to: number | null };

export type FcfsStep =
  | { kind: 'ready' }
  | { kind: 'start'; id: string; start: number; arrival: number; prevEnd: number; from: number | null }
  | { kind: 'idle'; tick: number; next: string; arrival: number; from: number | null }
  | { kind: 'done'; id: string; tick: number; from: number | null };

export type FirstComeFirstRunScene = {
  procs: FcfsSceneProc[];
  horizon: number | null;
  placed: FcfsPlaced[];
  idles: FcfsIdle[];
  now: number | null;
  step: FcfsStep;
};

function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number') throw new Error(`first-come-first-run scene: ${k} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`first-come-first-run scene: ${k} 가 글자가 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`first-come-first-run scene: ${event.type} 의 payload 가 없다`);
  return p as Record<string, unknown>;
}

function readProcs(initialData: unknown): FcfsSceneProc[] {
  if (typeof initialData !== 'object' || initialData === null) return [];
  const raw = (initialData as { procs?: unknown }).procs;
  if (!Array.isArray(raw)) return [];
  return raw.map((p: unknown) => {
    if (typeof p !== 'object' || p === null) throw new Error('first-come-first-run scene: procs 모양이 틀렸다');
    const o = p as Record<string, unknown>;
    return { id: str(o, 'id'), arrival: num(o, 'arrival'), length: num(o, 'length') };
  });
}

/** 빈 구간 가운데 열린 것을 tick 에서 닫는다. */
function closeIdles(idles: FcfsIdle[], tick: number): FcfsIdle[] {
  return idles.map((s) => (s.to === null ? { from: s.from, to: tick } : { ...s }));
}

export const firstComeFirstRunScene: ScenePlan<FirstComeFirstRunScene> = {
  initial(initialData: unknown): FirstComeFirstRunScene {
    return {
      procs: readProcs(initialData),
      horizon: null,
      placed: [],
      idles: [],
      now: null,
      step: { kind: 'ready' },
    };
  },

  reduce(scene: FirstComeFirstRunScene, event: FacetRuntimeEvent): FirstComeFirstRunScene {
    const base = {
      procs: scene.procs.map((p) => ({ ...p })),
      horizon: scene.horizon,
      placed: scene.placed.map((p) => ({ ...p })),
      idles: scene.idles.map((s) => ({ ...s })),
    };
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        return { ...base, horizon: num(p, 'horizon'), now: scene.now, step: { kind: 'ready' } };
      }
      case 'start': {
        const p = payloadOf(event);
        const id = str(p, 'id');
        const tick = num(p, 'tick');
        return {
          ...base,
          placed: [...base.placed, { id, start: tick, end: num(p, 'end') }],
          idles: closeIdles(base.idles, tick),
          now: tick,
          step: { kind: 'start', id, start: tick, arrival: num(p, 'arrival'), prevEnd: num(p, 'prevEnd'), from: scene.now },
        };
      }
      case 'idle': {
        const p = payloadOf(event);
        const tick = num(p, 'tick');
        return {
          ...base,
          idles: [...base.idles, { from: tick, to: null }],
          now: tick,
          step: { kind: 'idle', tick, next: str(p, 'next'), arrival: num(p, 'arrival'), from: scene.now },
        };
      }
      case 'done': {
        const p = payloadOf(event);
        const tick = num(p, 'tick');
        return { ...base, now: tick, step: { kind: 'done', id: str(p, 'id'), tick, from: scene.now } };
      }
      default:
        throw new Error(`first-come-first-run scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
