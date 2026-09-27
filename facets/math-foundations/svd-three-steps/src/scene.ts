/**
 * 특이값 분해 세 걸음의 장면.
 *
 * 바탕(base)은 silent init 이 한 번 정한다 — 행렬 · σ · 각 · 단위원 표본점.
 * 자취는 지금 모양(shape) · v₁ · v₂ · 한 번에 곱한 모양(direct) · 지난 동작의 차례(stage).
 * 이번 걸음(step)은 무엇이 어디서 출발해 움직였는지 계기값을 담는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readMat2, readSvdData, type Mat2, type Motion, type Pt } from './algorithm.js';

export type SvdBase = {
  matrix: Mat2;
  det: number;
  sigma1: number;
  sigma2: number;
  thetaV: number;
  thetaU: number;
  circle: Pt[];
};

export type SvdStep =
  | { kind: 'start' }
  | {
      kind: 'turn-in' | 'turn-out';
      motion: Motion;
      from: Pt[];
      fromV: [Pt, Pt];
      arcFrom: number;
    }
  | { kind: 'stretch'; motion: Motion; from: Pt[]; fromV: [Pt, Pt] }
  | { kind: 'direct'; from: Pt[]; gap: number; same: boolean };

export type SvdScene = {
  /** 받은 행렬 (initialData 에서 베낀 것) */
  matrix: Mat2;
  base: SvdBase | null;
  /** 0 처음 · 1 Vᵀ · 2 Σ · 3 U · 4 A 를 한 번에 */
  stage: 0 | 1 | 2 | 3 | 4;
  shape: Pt[];
  v: [Pt, Pt] | null;
  direct: Pt[] | null;
  step: SvdStep;
};

function num(x: unknown, path: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${path}: 수가 아니다`);
  return x;
}

function field(o: unknown, key: string, path: string): unknown {
  if (typeof o !== 'object' || o === null) throw new Error(`${path}: 객체가 아니다`);
  if (!(key in o)) throw new Error(`${path}.${key}: 없다`);
  return (o as Record<string, unknown>)[key];
}

function pt(x: unknown, path: string): Pt {
  return { x: num(field(x, 'x', path), `${path}.x`), y: num(field(x, 'y', path), `${path}.y`) };
}

function pts(x: unknown, path: string): Pt[] {
  if (!Array.isArray(x)) throw new Error(`${path}: 배열이 아니다`);
  return x.map((p: unknown, i) => pt(p, `${path}[${i}]`));
}

function pair(x: unknown, path: string): [Pt, Pt] {
  if (!Array.isArray(x) || x.length !== 2) throw new Error(`${path}: 벡터 둘이 아니다`);
  return [pt(x[0], `${path}[0]`), pt(x[1], `${path}[1]`)];
}

function motion(x: unknown, path: string): Motion {
  const kind = field(x, 'kind', path);
  if (kind === 'rotate') return { kind, deg: num(field(x, 'deg', path), `${path}.deg`) };
  if (kind === 'stretch') {
    return {
      kind,
      sx: num(field(x, 'sx', path), `${path}.sx`),
      sy: num(field(x, 'sy', path), `${path}.sy`),
    };
  }
  throw new Error(`${path}.kind: 모르는 동작 ${String(kind)}`);
}

function sameMatrix(a: Mat2, b: Mat2): boolean {
  return a[0][0] === b[0][0] && a[0][1] === b[0][1] && a[1][0] === b[1][0] && a[1][1] === b[1][1];
}

function needBase(scene: SvdScene, type: string): SvdBase {
  if (!scene.base) throw new Error(`${type}: init 앞에 왔다`);
  return scene.base;
}

function needStage(scene: SvdScene, type: string, want: SvdScene['stage']): void {
  if (scene.stage !== want) throw new Error(`${type}: 지금 차례 ${scene.stage} 에서 올 수 없다`);
}

export const svdThreeStepsScene: ScenePlan<SvdScene> = {
  initial(initialData: unknown): SvdScene {
    const data = readSvdData(initialData);
    return {
      matrix: [[...data.matrix[0]], [...data.matrix[1]]],
      base: null,
      stage: 0,
      shape: [],
      v: null,
      direct: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: SvdScene, event: FacetRuntimeEvent): SvdScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        if (scene.base) throw new Error('init: 두 번 왔다');
        const matrix = readMat2(field(p, 'matrix', 'init'), 'init.matrix');
        if (!sameMatrix(matrix, scene.matrix)) throw new Error('init.matrix: initialData 의 행렬과 다르다');
        const circle = pts(field(p, 'circle', 'init'), 'init.circle');
        const base: SvdBase = {
          matrix,
          det: num(field(p, 'det', 'init'), 'init.det'),
          sigma1: num(field(p, 'sigma1', 'init'), 'init.sigma1'),
          sigma2: num(field(p, 'sigma2', 'init'), 'init.sigma2'),
          thetaV: num(field(p, 'thetaV', 'init'), 'init.thetaV'),
          thetaU: num(field(p, 'thetaU', 'init'), 'init.thetaU'),
          circle,
        };
        return {
          ...scene,
          base,
          stage: 0,
          shape: circle.map((q) => ({ ...q })),
          v: pair(field(p, 'v', 'init'), 'init.v'),
          direct: null,
          step: { kind: 'start' },
        };
      }
      case 'turn-in':
      case 'turn-out': {
        needBase(scene, event.type);
        needStage(scene, event.type, event.type === 'turn-in' ? 0 : 2);
        if (!scene.v) throw new Error(`${event.type}: v 가 없다`);
        const points = pts(field(p, 'points', event.type), `${event.type}.points`);
        if (points.length !== scene.shape.length) throw new Error(`${event.type}.points: 표본 수가 다르다`);
        const m = motion(field(p, 'motion', event.type), `${event.type}.motion`);
        if (m.kind !== 'rotate') throw new Error(`${event.type}.motion.kind: rotate 가 아니다`);
        return {
          ...scene,
          stage: event.type === 'turn-in' ? 1 : 3,
          shape: points,
          v: pair(field(p, 'v', event.type), `${event.type}.v`),
          step: {
            kind: event.type,
            motion: m,
            from: scene.shape.map((q) => ({ ...q })),
            fromV: [{ ...scene.v[0] }, { ...scene.v[1] }],
            arcFrom: num(field(p, 'arcFrom', event.type), `${event.type}.arcFrom`),
          },
        };
      }
      case 'stretch': {
        needBase(scene, 'stretch');
        needStage(scene, 'stretch', 1);
        if (!scene.v) throw new Error('stretch: v 가 없다');
        const points = pts(field(p, 'points', 'stretch'), 'stretch.points');
        if (points.length !== scene.shape.length) throw new Error('stretch.points: 표본 수가 다르다');
        const m = motion(field(p, 'motion', 'stretch'), 'stretch.motion');
        if (m.kind !== 'stretch') throw new Error('stretch.motion.kind: stretch 가 아니다');
        return {
          ...scene,
          stage: 2,
          shape: points,
          v: pair(field(p, 'v', 'stretch'), 'stretch.v'),
          step: {
            kind: 'stretch',
            motion: m,
            from: scene.shape.map((q) => ({ ...q })),
            fromV: [{ ...scene.v[0] }, { ...scene.v[1] }],
          },
        };
      }
      case 'direct': {
        const base = needBase(scene, 'direct');
        needStage(scene, 'direct', 3);
        const points = pts(field(p, 'points', 'direct'), 'direct.points');
        if (points.length !== base.circle.length) throw new Error('direct.points: 표본 수가 다르다');
        const same = field(p, 'same', 'direct');
        if (typeof same !== 'boolean') throw new Error('direct.same: 참 · 거짓이 아니다');
        return {
          ...scene,
          stage: 4,
          direct: points,
          step: {
            kind: 'direct',
            from: base.circle.map((q) => ({ ...q })),
            gap: num(field(p, 'gap', 'direct'), 'direct.gap'),
            same,
          },
        };
      }
      default:
        throw new Error(`svdThreeStepsScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
