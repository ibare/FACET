/**
 * wDivide 장면 — 바탕(묶음 다섯) · 자취(나뉜 결과) · 이번 걸음.
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트가 실어 온 점 · 방향을 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowWDivideData, type Bundle } from './algorithm.js';

export type WDivideOutcome =
  | { kind: 'point'; id: string; px: number; py: number }
  | { kind: 'direction'; id: string; dx: number; dy: number };

export type WDivideStep = { kind: 'start' } | { kind: 'land'; id: string } | { kind: 'direction'; id: string };

export type WDivideScene = {
  /** 바탕 — 자료의 묶음, 자료 차례대로 */
  bundles: Bundle[];
  /** 자취 — 지금까지 나뉜(또는 방향으로 남은) 묶음, 걸음 차례대로 */
  outcomes: WDivideOutcome[];
  step: WDivideStep;
};

function field(payload: Record<string, unknown>, key: string, type: string): number {
  const v = payload[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`wDivideScene: ${type}.payload.${key} 가 수가 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`wDivideScene: ${event.type}.payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

/** 이벤트가 가리키는 묶음이 바탕에 있고, 걸음 차례가 맞는지 본다. */
function bundleAt(scene: WDivideScene, payload: Record<string, unknown>, type: string): Bundle {
  const id = payload.id;
  if (typeof id !== 'string') throw new Error(`wDivideScene: ${type}.payload.id 가 글자가 아니다`);
  const index = field(payload, 'index', type);
  const b = scene.bundles[index];
  if (b === undefined || b.id !== id) throw new Error(`wDivideScene: ${type}.payload.id '${id}' 가 바탕의 ${index} 번째 묶음이 아니다`);
  if (index !== scene.outcomes.length) {
    throw new Error(`wDivideScene: ${type}.payload.index ${index} 가 다음 차례 ${scene.outcomes.length} 와 다르다`);
  }
  return b;
}

export const wDivideScene: ScenePlan<WDivideScene> = {
  initial(initialData: unknown): WDivideScene {
    const data = narrowWDivideData(initialData);
    return {
      bundles: data.bundles.map((b) => ({ ...b })),
      outcomes: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: WDivideScene, event: FacetRuntimeEvent): WDivideScene {
    switch (event.type) {
      case 'land': {
        const payload = payloadOf(event);
        const b = bundleAt(scene, payload, 'land');
        const w = field(payload, 'w', 'land');
        if (w !== b.w) throw new Error(`wDivideScene: land.payload.w ${w} 가 묶음 ${b.id} 의 w ${b.w} 와 다르다`);
        const px = field(payload, 'px', 'land');
        const py = field(payload, 'py', 'land');
        return {
          bundles: scene.bundles,
          outcomes: [...scene.outcomes, { kind: 'point', id: b.id, px, py }],
          step: { kind: 'land', id: b.id },
        };
      }
      case 'direction': {
        const payload = payloadOf(event);
        const b = bundleAt(scene, payload, 'direction');
        if (b.w !== 0) throw new Error(`wDivideScene: direction 인데 묶음 ${b.id} 의 w 가 0 이 아니다`);
        const dx = field(payload, 'dx', 'direction');
        const dy = field(payload, 'dy', 'direction');
        return {
          bundles: scene.bundles,
          outcomes: [...scene.outcomes, { kind: 'direction', id: b.id, dx, dy }],
          step: { kind: 'direction', id: b.id },
        };
      }
      default:
        throw new Error(`wDivideScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
