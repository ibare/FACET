/**
 * 장면 — 묶음의 요청(바탕)과 지나온 걸음 수(자취), 이번 걸음(step).
 *
 * 칸 하나하나는 바탕과 걸음 수에서 파생된다. 그래서 자취는 `t` 하나로 족하다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { BatchRequest } from './algorithm.js';

// 셈은 알고리즘이 쥔다. stage 는 장면을 거쳐 같은 함수를 쓴다.
export {
  batchSteps,
  blankPercent,
  cellAt,
  tallyAt,
  type BatchRequest,
  type Tally,
} from './algorithm.js';

export type ShortWaitsStep =
  | { kind: 'init' }
  /** 걸음 `from` 에서 `to` 로 — 넷이 함께 한 칸씩 는다. */
  | { kind: 'grow'; from: number; to: number };

export interface ShortWaitsForLongScene {
  /** 바탕 — init 이 한 번 정한다. */
  requests: BatchRequest[];
  /** 자취 — 지나온 걸음 수. */
  t: number;
  /** 이번 걸음. */
  step: ShortWaitsStep | null;
}

function readRequests(payload: unknown): BatchRequest[] {
  const p = payload as { requests?: unknown } | undefined;
  if (!p || !Array.isArray(p.requests)) return [];
  const out: BatchRequest[] = [];
  for (const raw of p.requests as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as { id?: unknown; words?: unknown };
    if (typeof r.id !== 'string' || !Array.isArray(r.words)) continue;
    const words: string[] = [];
    for (const w of r.words as unknown[]) if (typeof w === 'string') words.push(w);
    out.push({ id: r.id, words });
  }
  return out;
}

export const shortWaitsForLongScene: ScenePlan<ShortWaitsForLongScene> = {
  initial() {
    return { requests: [], t: 0, step: null };
  },
  reduce(scene, event: FacetRuntimeEvent) {
    if (event.type === 'init') {
      return { requests: readRequests(event.payload), t: 0, step: { kind: 'init' } };
    }
    if (event.type === 'step') {
      const p = event.payload as { t?: unknown } | undefined;
      const t = typeof p?.t === 'number' ? p.t : scene.t + 1;
      return { requests: scene.requests, t, step: { kind: 'grow', from: scene.t, to: t } };
    }
    return scene;
  },
};
