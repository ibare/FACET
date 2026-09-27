import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowShadowRayData } from './algorithm';
import type { Blocker, FloorPoint, RayTest, Vec2 } from './algorithm';

/** 바탕 — initialData 가 한 번 정한다. */
export type ShadowRayBase = {
  floorY: number;
  light: { x: number; y: number };
  points: FloorPoint[];
  blockers: Blocker[];
};

/** 자취 — 판정한 점 하나. */
export type JudgedPoint = {
  point: string;
  dir: Vec2;
  dist: number;
  tests: RayTest[];
  blockedBy: string | null;
};

export type ShadowRayScene = {
  base: ShadowRayBase;
  judged: JudgedPoint[];
  /** 이번 걸음에 광선을 보낸 점. 걸음 0 은 null. */
  step: { point: string } | null;
};

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`shadowRayScene: ${path} 가 유한한 수가 아니다`);
  return v;
}

function readTests(raw: unknown, base: ShadowRayBase): RayTest[] {
  if (!Array.isArray(raw)) throw new Error('shadowRayScene: payload.tests 가 배열이 아니다');
  if (raw.length !== base.blockers.length) {
    throw new Error('shadowRayScene: payload.tests 의 길이가 막을 수 있는 것의 수와 다르다');
  }
  return raw.map((item: unknown, i: number) => {
    if (typeof item !== 'object' || item === null) throw new Error(`shadowRayScene: payload.tests[${i}] 가 객체가 아니다`);
    const rec = item as Record<string, unknown>;
    const expected = base.blockers[i];
    if (expected === undefined || rec.id !== expected.id) {
      throw new Error(`shadowRayScene: payload.tests[${i}].id 가 시험 차례와 다르다`);
    }
    const tHit = rec.tHit === null ? null : num(rec.tHit, `payload.tests[${i}].tHit`);
    return { id: expected.id, tHit };
  });
}

export const shadowRayScene: ScenePlan<ShadowRayScene> = {
  initial(initialData: unknown): ShadowRayScene {
    const data = narrowShadowRayData(initialData);
    return {
      base: {
        floorY: data.floor.y,
        light: { x: data.light.x, y: data.light.y },
        points: data.points.map((p) => ({ ...p })),
        blockers: data.blockers.map((b) => ({ ...b })),
      },
      judged: [],
      step: null,
    };
  },

  reduce(scene: ShadowRayScene, event: FacetRuntimeEvent): ShadowRayScene {
    switch (event.type) {
      case 'shadow-ray': {
        const payload = event.payload;
        if (typeof payload !== 'object' || payload === null) throw new Error('shadowRayScene: shadow-ray 의 payload 가 없다');
        const rec = payload as Record<string, unknown>;
        const expected = scene.base.points[scene.judged.length];
        if (expected === undefined) throw new Error('shadowRayScene: 판정할 점이 더 없다');
        if (rec.point !== expected.id) {
          throw new Error(`shadowRayScene: payload.point 가 차례의 점 '${expected.id}' 가 아니다`);
        }
        const dirRaw = rec.dir;
        if (!Array.isArray(dirRaw) || dirRaw.length !== 2) throw new Error('shadowRayScene: payload.dir 는 수 둘이어야 한다');
        const dir: Vec2 = [num(dirRaw[0], 'payload.dir[0]'), num(dirRaw[1], 'payload.dir[1]')];
        const dist = num(rec.dist, 'payload.dist');
        const tests = readTests(rec.tests, scene.base);
        const blockedBy = rec.blockedBy;
        if (blockedBy !== null) {
          if (typeof blockedBy !== 'string') throw new Error('shadowRayScene: payload.blockedBy 가 문자열도 null 도 아니다');
          const hit = tests.find((x) => x.id === blockedBy);
          if (hit === undefined || hit.tHit === null || hit.tHit >= dist) {
            throw new Error(`shadowRayScene: payload.blockedBy '${blockedBy}' 가 빛 앞에서 맞은 것이 아니다`);
          }
        }
        return {
          base: scene.base,
          judged: [...scene.judged, { point: expected.id, dir, dist, tests, blockedBy }],
          step: { point: expected.id },
        };
      }
      default:
        throw new Error(`shadowRayScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
