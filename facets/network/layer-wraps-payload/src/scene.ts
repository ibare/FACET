/**
 * layer-wraps-payload 의 장면.
 *
 * 바탕  — payload · layers (initialData 에서 베낀다)
 * 자취  — wraps: 지금까지 씌운 층과 그때의 크기 (알고리즘이 셈한 값), wire: 선에 올랐는가
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readWrapData, type WrapLayerId, type WrapLayerSpec } from './algorithm.js';

export interface WrapRecord {
  layer: WrapLayerId;
  head: number;
  tail: number;
  size: number;
}

export interface WireRecord {
  total: number;
  added: number;
  data: number;
  /** 응용 데이터 몫 (알고리즘이 셈한다) */
  share: number;
}

export type WrapStep = { kind: 'start' } | { kind: 'wrap'; layer: WrapLayerId } | { kind: 'wire' };

export interface LayerWrapsScene {
  payload: number;
  layers: WrapLayerSpec[];
  wraps: WrapRecord[];
  wire: WireRecord | null;
  step: WrapStep;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`layer-wraps-payload: ${type}.${key} 가 수가 아니다`);
  }
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`layer-wraps-payload: ${event.type} 의 payload 가 없다`);
  }
  return p as Record<string, unknown>;
}

export const layerWrapsPayloadScene: ScenePlan<LayerWrapsScene> = {
  initial(initialData: unknown): LayerWrapsScene {
    const { payload, layers } = readWrapData(initialData);
    return {
      payload,
      layers: layers.map((l) => ({ id: l.id, head: l.head, tail: l.tail })),
      wraps: [],
      wire: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: LayerWrapsScene, event: FacetRuntimeEvent): LayerWrapsScene {
    if (event.type === 'wrap') {
      const p = payloadOf(event);
      const next = scene.layers[scene.wraps.length];
      if (next === undefined) {
        throw new Error('layer-wraps-payload: 씌울 층이 더 없는데 wrap 이 왔다');
      }
      if (p.layer !== next.id) {
        throw new Error(
          `layer-wraps-payload: 차례는 ${next.id} 인데 ${String(p.layer)} 가 왔다`,
        );
      }
      const rec: WrapRecord = {
        layer: next.id,
        head: num(p, 'head', 'wrap'),
        tail: num(p, 'tail', 'wrap'),
        size: num(p, 'size', 'wrap'),
      };
      return {
        ...scene,
        wraps: [...scene.wraps, rec],
        step: { kind: 'wrap', layer: next.id },
      };
    }
    if (event.type === 'wire') {
      const p = payloadOf(event);
      return {
        ...scene,
        wire: {
          total: num(p, 'total', 'wire'),
          added: num(p, 'added', 'wire'),
          data: num(p, 'data', 'wire'),
          share: num(p, 'share', 'wire'),
        },
        step: { kind: 'wire' },
      };
    }
    return scene;
  },
};
