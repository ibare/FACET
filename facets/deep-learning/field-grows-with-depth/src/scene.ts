/**
 * field-grows-with-depth 의 장면.
 *
 * 바탕 — 층들(식별자 · 한 변)과 창의 한 변. `init` 이 한 번 정한다.
 * 자취 — 층마다 기대는 칸의 범위. 맨 위 층의 출발 칸부터 걸음마다 한 층씩 아래로 쌓인다.
 * 이번 걸음 — 출발인가, 어느 층에서 어느 층으로 내려왔는가.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type FieldRegion = {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
  side: number;
  count: number;
};

export type FieldLayer = { id: string; size: number };

export type FieldStep =
  | { kind: 'start'; layer: number }
  | { kind: 'spread'; layer: number; from: number };

export type FieldBase = { layers: FieldLayer[]; kernel: number };

export type FieldGrowsWithDepthScene = {
  /** 층들과 창의 한 변. init 전에는 없다 */
  base: FieldBase | null;
  /** 층 번호(입력 0 부터) 마다 기대는 칸. 아직 닿지 않은 층은 null */
  regions: (FieldRegion | null)[];
  step: FieldStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`field-grows-with-depth 장면: ${k} 가 수가 아니다`);
  }
  return v;
}

function readRegion(v: unknown): FieldRegion {
  if (!isRecord(v)) throw new Error('field-grows-with-depth 장면: 범위가 객체가 아니다');
  return {
    r0: num(v, 'r0'),
    r1: num(v, 'r1'),
    c0: num(v, 'c0'),
    c1: num(v, 'c1'),
    side: num(v, 'side'),
    count: num(v, 'count'),
  };
}

function readLayers(v: unknown): FieldLayer[] {
  if (!Array.isArray(v) || v.length < 2) throw new Error('field-grows-with-depth 장면: 층 목록이 없다');
  return v.map((l) => {
    if (!isRecord(l) || typeof l.id !== 'string') throw new Error('field-grows-with-depth 장면: 층 식별자가 없다');
    return { id: l.id, size: num(l, 'size') };
  });
}

export const fieldGrowsWithDepthScene: ScenePlan<FieldGrowsWithDepthScene> = {
  initial(): FieldGrowsWithDepthScene {
    // 층 크기는 알고리즘이 셈한다 — 바탕은 silent init 이 채워 걸음 0 을 갈아 끼운다
    return { base: null, regions: [], step: null };
  },

  reduce(scene: FieldGrowsWithDepthScene, event: FacetRuntimeEvent): FieldGrowsWithDepthScene {
    const p = event.payload;
    if (event.type === 'init') {
      if (!isRecord(p)) throw new Error('field-grows-with-depth 장면: init 에 payload 가 없다');
      const layers = readLayers(p.layers);
      const top = layers.length - 1;
      const regions: (FieldRegion | null)[] = layers.map(() => null);
      regions[top] = readRegion(p.start);
      return { base: { layers, kernel: num(p, 'kernel') }, regions, step: { kind: 'start', layer: top } };
    }
    if (event.type === 'spread') {
      if (!isRecord(p)) throw new Error('field-grows-with-depth 장면: spread 에 payload 가 없다');
      const layer = num(p, 'layer');
      const from = num(p, 'from');
      if (scene.base === null) throw new Error('field-grows-with-depth 장면: init 전에 spread 가 왔다');
      if (layer < 0 || layer >= scene.regions.length) {
        throw new Error(`field-grows-with-depth 장면: 층 ${layer} 이 바탕에 없다`);
      }
      const regions = scene.regions.slice();
      regions[layer] = readRegion(p);
      return { ...scene, regions, step: { kind: 'spread', layer, from } };
    }
    throw new Error(`field-grows-with-depth 장면: 모르는 이벤트 ${event.type}`);
  },
};
