/**
 * filters-learn-edges 장면.
 *
 * 바탕 — 창의 무게와 무늬 다섯 (initialData 에서 베낀다. 걸음 0 은 창만 보이는 화면).
 * 자취 — 무늬마다 잰 응답, 늘어선 차례.
 * 이번 걸음 — 맞댄 무늬와 그 앞에 맞대어 있던 무늬(`was`), 또는 늘어섬.
 *
 * 장면에 오는 이벤트는 알고리즘이 보낸 것뿐이다 — 모양이 틀리면 조용히 넘기지 않고 던진다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readData } from './algorithm.js';

export type ScenePattern = { id: string; cells: number[][] };

export type FiltersLearnEdgesStep =
  | { kind: 'start' }
  | { kind: 'press'; index: number; was: number | null }
  | { kind: 'rank'; was: number | null };

export type FiltersLearnEdgesScene = {
  kernel: number[][];
  patterns: ScenePattern[];
  /** 무늬 차례마다 잰 응답. 아직 맞대지 않았으면 null */
  responses: (number | null)[];
  /** 지금 창에 맞대어 있는 무늬 차례 */
  docked: number | null;
  /** 응답 큰 것부터의 무늬 차례. 늘어서기 전에는 null */
  order: number[] | null;
  step: FiltersLearnEdgesStep;
};

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (typeof event.payload !== 'object' || event.payload === null) {
    throw new Error(`filters-learn-edges 장면: ${event.type} 에 payload 가 없다`);
  }
  return event.payload as Record<string, unknown>;
}

function patternIndex(scene: FiltersLearnEdgesScene, v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= scene.patterns.length) {
    throw new Error(`filters-learn-edges 장면: ${field} 가 무늬 차례(0..${scene.patterns.length - 1}) 가 아니다: ${String(v)}`);
  }
  return v;
}

export const filtersLearnEdgesScene: ScenePlan<FiltersLearnEdgesScene> = {
  initial(initialData: unknown): FiltersLearnEdgesScene {
    // 알고리즘과 같은 검증 — 틀린 칸 · 무늬 · 빈 자료는 던진다. readData 는 베낀 값을 돌려준다
    const data = readData(initialData);
    return {
      kernel: data.kernel.map((row) => row.slice()),
      patterns: data.patterns.map((p) => ({ id: p.id, cells: p.cells.map((row) => row.slice()) })),
      responses: data.patterns.map(() => null),
      docked: null,
      order: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: FiltersLearnEdgesScene, event: FacetRuntimeEvent): FiltersLearnEdgesScene {
    if (event.type === 'press') {
      const p = payloadOf(event);
      const index = patternIndex(scene, p['index'], 'press.index');
      const response = p['response'];
      if (typeof response !== 'number' || !Number.isFinite(response)) {
        throw new Error(`filters-learn-edges 장면: press.response 가 유한한 수가 아니다: ${String(response)}`);
      }
      const responses = scene.responses.slice();
      responses[index] = response;
      return {
        ...scene,
        responses,
        docked: index,
        step: { kind: 'press', index, was: scene.docked },
      };
    }

    if (event.type === 'rank') {
      const p = payloadOf(event);
      const raw = p['order'];
      if (!Array.isArray(raw) || raw.length !== scene.patterns.length) {
        throw new Error(`filters-learn-edges 장면: rank.order 가 무늬 수(${scene.patterns.length}) 만큼의 배열이 아니다`);
      }
      const order = raw.map((v: unknown, i) => patternIndex(scene, v, `rank.order[${i}]`));
      if (new Set(order).size !== order.length) {
        throw new Error('filters-learn-edges 장면: rank.order 에 같은 무늬가 두 번 있다');
      }
      scene.responses.forEach((r, i) => {
        if (r === null) throw new Error(`filters-learn-edges 장면: rank 전에 무늬 ${i} 의 응답이 없다`);
      });
      return {
        ...scene,
        docked: null,
        order,
        step: { kind: 'rank', was: scene.docked },
      };
    }

    throw new Error(`filters-learn-edges 장면: 모르는 이벤트 ${event.type}`);
  },
};
