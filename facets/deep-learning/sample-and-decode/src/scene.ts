import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowSampleAndDecode, type Vec2 } from './algorithm.js';

/** 뽑기 하나의 자취. 되돌리기 전에는 cells 가 null 이다. */
export type SampleDraw = {
  k: number;
  eps: Vec2;
  scaled: Vec2;
  unscaled: Vec2;
  z: Vec2;
  cells: number[] | null;
};

export type SampleGap = { a: number; b: number; d: number };

export type SampleStep =
  | { kind: 'start' }
  | { kind: 'draw'; k: number }
  | { kind: 'decode'; k: number };

export type SampleAndDecodeScene = {
  // 바탕 — initialData 에서 한 번 정해진다
  mu: Vec2;
  sigma: Vec2;
  /** 뽑기 횟수 — 출력 줄 수와 뽑기별 색의 수. */
  drawCount: number;
  /** 잠재 평면의 테를 잡을 자리 목록. 알고리즘의 silent init 이 채운다. */
  extent: Vec2[] | null;
  cellCount: number;
  // 자취
  draws: SampleDraw[];
  gaps: SampleGap[];
  // 이번 걸음
  step: SampleStep;
};

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`sample-and-decode 장면: ${what} 가 유한한 수가 아니다`);
  }
  return v;
}

function pair(v: unknown, what: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2) {
    throw new Error(`sample-and-decode 장면: ${what} 는 수 둘이어야 한다`);
  }
  return [num(v[0], what), num(v[1], what)];
}

function record(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) {
    throw new Error(`sample-and-decode 장면: ${what} payload 가 객체가 아니다`);
  }
  return v as Record<string, unknown>;
}

export const sampleAndDecodeScene: ScenePlan<SampleAndDecodeScene> = {
  initial(initialData: unknown): SampleAndDecodeScene {
    const d = narrowSampleAndDecode(initialData);
    return {
      mu: [d.mu[0], d.mu[1]],
      sigma: [d.sigma[0], d.sigma[1]],
      drawCount: d.eps.length,
      extent: null,
      cellCount: d.weights.length,
      draws: [],
      gaps: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: SampleAndDecodeScene, event: FacetRuntimeEvent): SampleAndDecodeScene {
    if (event.type === 'init') {
      const p = record(event.payload, 'init');
      if (!Array.isArray(p.extent) || p.extent.length === 0) {
        throw new Error('sample-and-decode 장면: init.extent 가 비었다');
      }
      const extent = p.extent.map((q) => pair(q, 'init.extent'));
      return { ...scene, extent };
    }
    if (event.type === 'draw') {
      const p = record(event.payload, 'draw');
      const k = num(p.k, 'draw.k');
      if (scene.extent === null) {
        throw new Error('sample-and-decode 장면: init 전에 draw 가 왔다');
      }
      if (!Number.isInteger(k) || k < 1 || k > scene.drawCount) {
        throw new Error(`sample-and-decode 장면: draw.k ${k} 가 1..${scene.drawCount} 밖이다`);
      }
      const draw: SampleDraw = {
        k,
        eps: pair(p.eps, 'draw.eps'),
        scaled: pair(p.scaled, 'draw.scaled'),
        unscaled: pair(p.unscaled, 'draw.unscaled'),
        z: pair(p.z, 'draw.z'),
        cells: null,
      };
      return { ...scene, draws: [...scene.draws, draw], step: { kind: 'draw', k } };
    }
    if (event.type === 'decode') {
      const p = record(event.payload, 'decode');
      const k = num(p.k, 'decode.k');
      if (!Array.isArray(p.cells) || p.cells.length !== scene.cellCount) {
        throw new Error('sample-and-decode 장면: decode.cells 의 칸 수가 맞지 않는다');
      }
      const cells = p.cells.map((c) => num(c, 'decode.cells'));
      if (!Array.isArray(p.gaps)) {
        throw new Error('sample-and-decode 장면: decode.gaps 가 배열이 아니다');
      }
      const gaps = p.gaps.map((g): SampleGap => {
        const r = record(g, 'decode.gaps');
        return { a: num(r.a, 'gap.a'), b: num(r.b, 'gap.b'), d: num(r.d, 'gap.d') };
      });
      if (!scene.draws.some((dr) => dr.k === k)) {
        throw new Error(`sample-and-decode 장면: 뽑지 않은 ${k} 번을 되돌리려 한다`);
      }
      return {
        ...scene,
        draws: scene.draws.map((dr) => (dr.k === k ? { ...dr, cells } : dr)),
        gaps: [...scene.gaps, ...gaps],
        step: { kind: 'decode', k },
      };
    }
    throw new Error(`sample-and-decode 장면: 모르는 이벤트 ${event.type}`);
  },
};
