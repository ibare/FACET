/**
 * matrixAsTransform 의 장면.
 *
 * 바탕 — 행렬 · 격자 점 · 격자 줄 (initialData 에서), 축척 extent (silent init 에서)
 * 자취 — 옮긴 자리 · 원점 · 움직인 거리 · 곧은 줄 · 고른 간격 (걸음이 하나씩 쌓는다)
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  gridLines,
  gridPoints,
  readMatrixAsTransformData,
  type GridLine,
  type Mat2,
  type Vec2,
} from './algorithm.js';

export type MatrixAsTransformStep = 'start' | 'move' | 'origin' | 'distance' | 'straight' | 'even';

export type Extreme = { dist: number; points: number[] };
export type LineCheck = { ok: boolean[]; count: number; total: number };

export type MatrixAsTransformScene = {
  matrix: Mat2;
  points: Vec2[];
  lines: GridLine[];
  extent: number | null;
  moved: { to: Vec2[]; changed: number; total: number } | null;
  origin: { index: number; to: Vec2; dist: number } | null;
  distance: { near: Extreme; far: Extreme; kinds: number[] } | null;
  straight: LineCheck | null;
  even: LineCheck | null;
  step: MatrixAsTransformStep;
};

function bad(path: string, why: string): never {
  throw new Error(`matrixAsTransformScene: ${path} — ${why}`);
}

function field(v: unknown, key: string, path: string): unknown {
  if (typeof v !== 'object' || v === null) bad(path, '객체가 아니다');
  return (v as Record<string, unknown>)[key];
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(path, '유한한 수가 아니다');
  return v;
}

function list(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) bad(path, '배열이 아니다');
  return v;
}

function vec(v: unknown, path: string): Vec2 {
  const xs = list(v, path);
  if (xs.length !== 2) bad(path, '좌표 둘이 아니다');
  return [num(xs[0], `${path}[0]`), num(xs[1], `${path}[1]`)];
}

function index(v: unknown, size: number, path: string): number {
  const i = num(v, path);
  if (!Number.isInteger(i) || i < 0 || i >= size) bad(path, `0..${size - 1} 밖의 번호 ${i}`);
  return i;
}

function extreme(v: unknown, size: number, path: string): Extreme {
  const pts = list(field(v, 'points', path), `${path}.points`).map((x, i) =>
    index(x, size, `${path}.points[${i}]`),
  );
  if (pts.length === 0) bad(`${path}.points`, '비었다');
  return { dist: num(field(v, 'dist', path), `${path}.dist`), points: pts };
}

function lineCheck(payload: unknown, lines: readonly GridLine[], path: string): LineCheck {
  const raw = list(field(payload, 'lines', path), `${path}.lines`);
  if (raw.length !== lines.length) bad(`${path}.lines`, `줄 ${lines.length} 이 아니라 ${raw.length}`);
  const ok = raw.map((r, i) => {
    const id = field(r, 'id', `${path}.lines[${i}]`);
    const ln = lines[i];
    if (ln === undefined || id !== ln.id) bad(`${path}.lines[${i}].id`, '바탕의 줄 차례와 어긋난다');
    const v = field(r, 'ok', `${path}.lines[${i}]`);
    if (typeof v !== 'boolean') bad(`${path}.lines[${i}].ok`, '참 거짓이 아니다');
    return v;
  });
  const count = num(field(payload, 'count', path), `${path}.count`);
  if (count !== ok.filter(Boolean).length) bad(`${path}.count`, '줄마다의 판정과 수가 어긋난다');
  const total = num(field(payload, 'total', path), `${path}.total`);
  if (total !== lines.length) bad(`${path}.total`, '바탕의 줄 수와 어긋난다');
  return { ok, count, total };
}

function need<T>(v: T | null, path: string): T {
  if (v === null) bad(path, '앞 걸음이 아직 오지 않았다');
  return v;
}

export const matrixAsTransformScene: ScenePlan<MatrixAsTransformScene> = {
  initial(initialData: unknown): MatrixAsTransformScene {
    const data = readMatrixAsTransformData(initialData);
    return {
      matrix: [
        [data.matrix[0][0], data.matrix[0][1]],
        [data.matrix[1][0], data.matrix[1][1]],
      ],
      points: gridPoints(data.values),
      lines: gridLines(data.values),
      extent: null,
      moved: null,
      origin: null,
      distance: null,
      straight: null,
      even: null,
      step: 'start',
    };
  },

  reduce(scene: MatrixAsTransformScene, event: FacetRuntimeEvent): MatrixAsTransformScene {
    const p = event.payload;
    const size = scene.points.length;
    switch (event.type) {
      case 'init': {
        const extent = num(field(p, 'extent', 'init.payload'), 'init.payload.extent');
        if (extent <= 0) bad('init.payload.extent', '0 보다 커야 한다');
        return { ...scene, extent, step: 'start' };
      }
      case 'move': {
        need(scene.extent, 'move ← init');
        const from = list(field(p, 'from', 'move.payload'), 'move.payload.from');
        const to = list(field(p, 'to', 'move.payload'), 'move.payload.to');
        if (from.length !== size || to.length !== size) bad('move.payload', `점 ${size} 과 길이가 어긋난다`);
        from.forEach((v, i) => {
          const f = vec(v, `move.payload.from[${i}]`);
          const b = scene.points[i];
          if (b === undefined || f[0] !== b[0] || f[1] !== b[1]) bad(`move.payload.from[${i}]`, '바탕의 점과 어긋난다');
        });
        const moved = to.map((v, i) => vec(v, `move.payload.to[${i}]`));
        const changed = num(field(p, 'changed', 'move.payload'), 'move.payload.changed');
        const total = num(field(p, 'total', 'move.payload'), 'move.payload.total');
        if (total !== size) bad('move.payload.total', '바탕의 점 수와 어긋난다');
        return { ...scene, moved: { to: moved, changed, total }, step: 'move' };
      }
      case 'origin': {
        const moved = need(scene.moved, 'origin ← move');
        const i = index(field(p, 'index', 'origin.payload'), size, 'origin.payload.index');
        const from = vec(field(p, 'from', 'origin.payload'), 'origin.payload.from');
        const b = scene.points[i];
        if (b === undefined || from[0] !== b[0] || from[1] !== b[1]) bad('origin.payload.from', '바탕의 점과 어긋난다');
        const to = vec(field(p, 'to', 'origin.payload'), 'origin.payload.to');
        const q = moved.to[i];
        if (q === undefined || to[0] !== q[0] || to[1] !== q[1]) bad('origin.payload.to', '옮긴 자리와 어긋난다');
        const dist = num(field(p, 'dist', 'origin.payload'), 'origin.payload.dist');
        return { ...scene, origin: { index: i, to, dist }, step: 'origin' };
      }
      case 'distance': {
        need(scene.origin, 'distance ← origin');
        const near = extreme(field(p, 'near', 'distance.payload'), size, 'distance.payload.near');
        const far = extreme(field(p, 'far', 'distance.payload'), size, 'distance.payload.far');
        const kinds = list(field(p, 'kinds', 'distance.payload'), 'distance.payload.kinds').map((v, i) =>
          num(v, `distance.payload.kinds[${i}]`),
        );
        if (kinds.length === 0) bad('distance.payload.kinds', '비었다');
        return { ...scene, distance: { near, far, kinds }, step: 'distance' };
      }
      case 'straight': {
        need(scene.distance, 'straight ← distance');
        return { ...scene, straight: lineCheck(p, scene.lines, 'straight.payload'), step: 'straight' };
      }
      case 'even': {
        need(scene.straight, 'even ← straight');
        return { ...scene, even: lineCheck(p, scene.lines, 'even.payload'), step: 'even' };
      }
      default:
        throw new Error(`matrixAsTransformScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
