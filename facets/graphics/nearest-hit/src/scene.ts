import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowNearestHitData } from './algorithm.js';
import type { Nearest, SphereSpec, Vec3, Verdict } from './algorithm.js';

/** 시험을 마친 물체 하나의 자취. */
export type TestedEntry = {
  id: string;
  roots: [number, number] | null;
  used: number | null;
  verdict: Verdict;
};

export type NearestHitStep =
  | { kind: 'start' }
  | { kind: 'test'; index: number; verdict: Verdict; from: Nearest | null }
  | { kind: 'pixel'; id: string };

export type NearestHitScene = {
  /** 바탕 — initialData 에서 한 번 정해진다 */
  origin: Vec3;
  dir: Vec3;
  objects: SphereSpec[];
  /** 자취 — 시험한 차례대로 */
  tested: TestedEntry[];
  best: Nearest | null;
  /** 픽셀이 받은 색의 주인. 마지막 걸음에서만 선다 */
  pixel: string | null;
  /** 이번 걸음 */
  step: NearestHitStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readNumber(p: Record<string, unknown>, key: string, where: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${where}.${key}: 수가 아니다`);
  return v;
}

function readString(p: Record<string, unknown>, key: string, where: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`${where}.${key}: 문자열이 아니다`);
  return v;
}

function readNearest(v: unknown, where: string): Nearest | null {
  if (v === null) return null;
  if (!isRecord(v)) throw new Error(`${where}: 객체도 null 도 아니다`);
  return { id: readString(v, 'id', where), tHit: readNumber(v, 'tHit', where) };
}

function readRoots(v: unknown, where: string): [number, number] | null {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 2) throw new Error(`${where}: 근 둘이 아니다`);
  const [a, b] = v as unknown[];
  if (typeof a !== 'number' || typeof b !== 'number') throw new Error(`${where}: 근이 수가 아니다`);
  if (a > b) throw new Error(`${where}: 작은 근이 먼저 와야 한다`);
  return [a, b];
}

function readVerdict(v: unknown, where: string): Verdict {
  if (v === 'closer' || v === 'farther' || v === 'behind' || v === 'miss') return v;
  throw new Error(`${where}: 모르는 판정 ${String(v)}`);
}

function sameNearest(a: Nearest | null, b: Nearest | null): boolean {
  if (a === null || b === null) return a === b;
  return a.id === b.id && a.tHit === b.tHit;
}

export const nearestHitScene: ScenePlan<NearestHitScene> = {
  initial(initialData: unknown): NearestHitScene {
    const data = narrowNearestHitData(initialData);
    return {
      origin: [...data.ray.origin],
      dir: [...data.ray.dir],
      objects: data.objects.map((o) => ({
        id: o.id,
        center: [...o.center],
        radius: o.radius,
        color: [...o.color],
      })),
      tested: [],
      best: null,
      pixel: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: NearestHitScene, event: FacetRuntimeEvent): NearestHitScene {
    const p = event.payload;
    switch (event.type) {
      case 'test': {
        if (!isRecord(p)) throw new Error('test.payload: 객체가 아니다');
        if (scene.pixel !== null) throw new Error('test: 픽셀이 이미 색을 받은 뒤다');
        const index = readNumber(p, 'index', 'test.payload');
        if (index !== scene.tested.length) {
          throw new Error(`test.payload.index: ${index} — 다음 차례는 ${scene.tested.length}`);
        }
        const obj = scene.objects[index];
        if (obj === undefined) throw new Error(`test.payload.index: ${index} 번 물체가 바탕에 없다`);
        const id = readString(p, 'id', 'test.payload');
        if (id !== obj.id) throw new Error(`test.payload.id: ${id} — 차례의 물체는 ${obj.id}`);
        const roots = readRoots(p['roots'], 'test.payload.roots');
        const usedRaw = p['used'];
        const used = usedRaw === null ? null : readNumber(p, 'used', 'test.payload');
        const verdict = readVerdict(p['verdict'], 'test.payload.verdict');
        const before = readNearest(p['before'], 'test.payload.before');
        const best = readNearest(p['best'], 'test.payload.best');
        if (!sameNearest(before, scene.best)) throw new Error('test.payload.before: 지금 최근접과 어긋난다');
        if ((verdict === 'miss') !== (roots === null)) throw new Error('test.payload: 빗나감과 근이 어긋난다');
        if ((verdict === 'miss' || verdict === 'behind') !== (used === null)) {
          throw new Error('test.payload.used: 판정과 쓸 근이 어긋난다');
        }
        if (verdict === 'closer') {
          if (best === null || best.id !== id || best.tHit !== used) throw new Error('test.payload.best: 새 최근접이 이 물체가 아니다');
        } else if (!sameNearest(best, before)) {
          throw new Error('test.payload.best: 바뀌지 않는 판정인데 최근접이 바뀌었다');
        }
        return {
          ...scene,
          tested: [...scene.tested, { id, roots, used, verdict }],
          best,
          step: { kind: 'test', index, verdict, from: before },
        };
      }
      case 'pixel': {
        if (!isRecord(p)) throw new Error('pixel.payload: 객체가 아니다');
        const id = readString(p, 'id', 'pixel.payload');
        const tHit = readNumber(p, 'tHit', 'pixel.payload');
        if (scene.best === null || scene.best.id !== id || scene.best.tHit !== tHit) {
          throw new Error('pixel.payload: 지금 최근접과 어긋난다');
        }
        if (scene.tested.length !== scene.objects.length) throw new Error('pixel: 아직 시험하지 않은 물체가 있다');
        return { ...scene, pixel: id, step: { kind: 'pixel', id } };
      }
      default:
        throw new Error(`nearest-hit 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
