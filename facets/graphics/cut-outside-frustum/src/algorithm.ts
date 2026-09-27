/**
 * 절두체 클리핑 — 보이는 틀의 면 하나씩 삼각형을 자른다 (Sutherland–Hodgman).
 *
 * 동차 클립 공간의 삼각형을 면 여섯(left · right · bottom · top · near · far)에 차례로 건다.
 * 면마다 d(면에서 안쪽으로 잰 값)가 양수면 안이다. 면 밖의 꼭짓점은 버려지고, 그 꼭짓점으로
 * 가던 모서리가 면과 만나는 자리에 새 꼭짓점이 선다. 교점은 w 로 나누기 전에(클립 공간에서) 셈한다.
 * 버릴 꼭짓점이 없는 면은 걸음을 두지 않는다. 마지막에 남은 다각형을 꼭짓점 0 에서 부채꼴로 나눈다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *
 *   cut — 면 하나로 자른 걸음
 *     payload: {
 *       plane: PlaneId;                                   // 자른 면
 *       distances: Array<{ id: string; d: number }>;      // 자르기 전 다각형 꼭짓점 + 새 꼭짓점의 d
 *       dropped: string[];                                // 버린 꼭짓점 id
 *       added: Array<{
 *         id: string;                                     // 새 꼭짓점 id (P, Q, R …)
 *         from: string; to: string;                       // 모서리 S → E (t 는 S 에서 잰다)
 *         param: number;                                  // t = d_S / (d_S − d_E)
 *         clip: [number, number, number, number];         // 교점 (x, y, z, w)
 *       }>;
 *       polygon: string[];                                // 자른 뒤 다각형 차례
 *     }
 *
 *   fan — 남은 다각형을 꼭짓점 0 에서 삼각형으로 나눈 걸음
 *     payload: {
 *       triangles: Array<[number, number, number]>;       // 다각형 차례의 자리 (0, i, i+1)
 *       areaBefore: number;                               // 처음 삼각형의 NDC 넓이
 *       areaAfter: number;                                // 남은 다각형의 NDC 넓이
 *       frameArea: number;                                // 틀의 NDC 넓이
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 의 삼각형으로 세운다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec4 = readonly [number, number, number, number];

export type ClipVertex = { id: string; clip: Vec4 };

export type CutOutsideFrustumFacetData = {
  type: 'cut-outside-frustum';
  stepMs: number;
  vertices: ClipVertex[];
};

export const PLANES = ['left', 'right', 'bottom', 'top', 'near', 'far'] as const;
export type PlaneId = (typeof PLANES)[number];

/** 새 꼭짓점에 붙이는 식별자 차례. 다 쓰면 던진다. */
const NEW_IDS = ['P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'] as const;

const ON_PLANE_EPS = 1e-12;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function narrowVec4(v: unknown, path: string): Vec4 {
  if (!Array.isArray(v) || v.length !== 4) throw new Error(`${path}: (x, y, z, w) 네 수가 아니다`);
  const [x, y, z, w] = v as unknown[];
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z) || !isFiniteNumber(w)) {
    throw new Error(`${path}: 수가 아닌 성분이 있다`);
  }
  if (w <= 0) throw new Error(`${path}: w ≤ 0 — 셈할 수 없다`);
  return [x, y, z, w];
}

/** initialData 좁히개 — 알고리즘 · 장면 · 그림이 함께 쓴다. 어긋나면 던진다. */
export function narrowCutOutsideFrustumData(data: unknown): CutOutsideFrustumFacetData {
  if (typeof data !== 'object' || data === null) throw new Error('cut-outside-frustum: 자료가 객체가 아니다');
  const d = data as Record<string, unknown>;
  if (d.type !== 'cut-outside-frustum') throw new Error(`cut-outside-frustum: type 이 다르다 (${String(d.type)})`);
  if (!isFiniteNumber(d.stepMs) || d.stepMs < 0) throw new Error('cut-outside-frustum: stepMs 가 없다');
  if (!Array.isArray(d.vertices) || d.vertices.length !== 3) {
    throw new Error('cut-outside-frustum: vertices 는 삼각형의 꼭짓점 셋이어야 한다');
  }
  const seen = new Set<string>();
  const vertices = d.vertices.map((raw: unknown, i: number): ClipVertex => {
    if (typeof raw !== 'object' || raw === null) throw new Error(`vertices[${i}]: 객체가 아니다`);
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id === '') throw new Error(`vertices[${i}].id: 없다`);
    if (seen.has(r.id)) throw new Error(`vertices[${i}].id: ${r.id} 가 겹친다`);
    if ((NEW_IDS as readonly string[]).includes(r.id)) {
      throw new Error(`vertices[${i}].id: ${r.id} 는 새 꼭짓점 이름과 겹친다`);
    }
    seen.add(r.id);
    return { id: r.id, clip: narrowVec4(r.clip, `vertices[${i}].clip`) };
  });
  return { type: 'cut-outside-frustum', stepMs: d.stepMs, vertices };
}

/** 면에서 안쪽으로 잰 값 d. 양수면 안이다. */
export function planeDistance(plane: PlaneId, v: Vec4): number {
  const [x, y, z, w] = v;
  switch (plane) {
    case 'left':
      return w + x;
    case 'right':
      return w - x;
    case 'bottom':
      return w + y;
    case 'top':
      return w - y;
    case 'near':
      return w + z;
    case 'far':
      return w - z;
    default:
      throw new Error(`모르는 면: ${String(plane)}`);
  }
}

/** 그리기 위한 나눗셈 — (x/w, y/w). */
export function toNdc(v: Vec4): readonly [number, number] {
  if (!(v[3] > 0)) throw new Error(`w ≤ 0 — NDC 로 나눌 수 없다 (${v.join(', ')})`);
  return [v[0] / v[3], v[1] / v[3]];
}

/** NDC 다각형 넓이 (신발끈). */
export function ndcArea(poly: readonly Vec4[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = toNdc(poly[(i + poly.length - 1) % poly.length]!);
    const b = toNdc(poly[i]!);
    s += a[0] * b[1] - a[1] * b[0];
  }
  return Math.abs(s / 2);
}

function lerp4(a: Vec4, b: Vec4, k: number): Vec4 {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
}

type Added = { id: string; from: string; to: string; param: number; clip: Vec4 };

/** 면 하나로 다각형을 자른다 — 모서리를 S = P[i−1] → E = P[i] 로 돈다. */
function clipByPlane(
  plane: PlaneId,
  poly: readonly ClipVertex[],
  nextId: () => string,
): { polygon: ClipVertex[]; added: Added[]; dropped: string[] } {
  const out: ClipVertex[] = [];
  const added: Added[] = [];
  const dropped: string[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const S = poly[(i + n - 1) % n]!;
    const E = poly[i]!;
    const dS = planeDistance(plane, S.clip);
    const dE = planeDistance(plane, E.clip);
    if (Math.abs(dS) < ON_PLANE_EPS || Math.abs(dE) < ON_PLANE_EPS) {
      throw new Error(`면 ${plane}: 꼭짓점 ${Math.abs(dS) < ON_PLANE_EPS ? S.id : E.id} 가 면 위에 있다`);
    }
    const cross = (): void => {
      const param = dS / (dS - dE);
      const v: ClipVertex = { id: nextId(), clip: lerp4(S.clip, E.clip, param) };
      out.push(v);
      added.push({ id: v.id, from: S.id, to: E.id, param, clip: v.clip });
    };
    if (dE > 0) {
      if (dS < 0) cross();
      out.push(E);
    } else {
      dropped.push(E.id);
      if (dS > 0) cross();
    }
  }
  return { polygon: out, added, dropped };
}

export async function cutOutsideFrustum(context: FacetContext<CutOutsideFrustumFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<CutOutsideFrustumFacetData>;
  const data = narrowCutOutsideFrustumData(ctx.data);
  const { stepMs } = data;

  // 걸음 0(삼각형과 틀)이 이미 읽을 화면이라 첫 발신 앞에도 문을 둔다.
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let idCursor = 0;
  const nextId = (): string => {
    const id = NEW_IDS[idCursor];
    if (id === undefined) throw new Error('새 꼭짓점 이름이 다 떨어졌다');
    idCursor += 1;
    return id;
  };

  const original = data.vertices.map((v) => ({ id: v.id, clip: v.clip }));
  let poly: ClipVertex[] = original;

  for (const plane of PLANES) {
    if (ctx.cancelled) return;
    const hasOutside = poly.some((v) => planeDistance(plane, v.clip) < 0);
    if (!hasOutside) {
      // 버릴 꼭짓점이 없는 면 — 셈은 하되 걸음은 두지 않는다. 면 위의 꼭짓점은 여기서도 던진다.
      const { added } = clipByPlane(plane, poly, () => {
        throw new Error(`면 ${plane}: 버릴 꼭짓점이 없는데 교점이 생겼다`);
      });
      if (added.length !== 0) throw new Error(`면 ${plane}: 교점이 생겼다`);
      continue;
    }
    const before = poly;
    const { polygon, added, dropped } = clipByPlane(plane, before, nextId);
    const distances = [...before, ...added].map((v) => ({ id: v.id, d: planeDistance(plane, v.clip) }));
    if (!(await pause())) return;
    await ctx.emit({
      type: 'cut',
      payload: {
        plane,
        distances,
        dropped,
        added: added.map((a) => ({ id: a.id, from: a.from, to: a.to, param: a.param, clip: [...a.clip] })),
        polygon: polygon.map((v) => v.id),
      },
    });
    poly = polygon;
  }

  if (poly.length < 3) throw new Error(`남은 다각형의 꼭짓점이 ${poly.length} — 삼각형으로 나눌 수 없다`);
  const triangles: Array<[number, number, number]> = [];
  for (let i = 1; i < poly.length - 1; i += 1) {
    if (ctx.cancelled) return;
    triangles.push([0, i, i + 1]);
  }
  const areaBefore = ndcArea(original.map((v) => v.clip));
  const areaAfter = ndcArea(poly.map((v) => v.clip));
  const frameArea = 2 * 2;
  if (!(await pause())) return;
  await ctx.emit({ type: 'fan', payload: { triangles, areaBefore, areaAfter, frameArea } });
}
