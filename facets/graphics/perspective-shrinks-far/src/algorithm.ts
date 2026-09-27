/**
 * perspective-shrinks-far — 멀수록 작아진다.
 *
 * 카메라 공간(눈이 원점, −z 를 본다)에 높이가 같은 기둥들이 서 있다. 가까운 것부터 하나씩
 * 눈에서 거리 f 인 화면에 비춘다. 화면 좌표는 x' = f·x / d, y' = f·y / d (d = −z).
 * d ≤ 0 인 점은 투영하지 않고 던진다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나):
 *
 *   project  기둥 하나를 화면에 비춘다 (가까운 것부터)
 *     payload: {
 *       index: number        // initialData.posts 안의 자리
 *       d: number            // 눈에서의 거리 (= −z)
 *       x: number            // 화면 x'
 *       yBottom: number      // 화면 y' (밑)
 *       yTop: number         // 화면 y' (꼭대기)
 *       height: number       // 화면 높이 = yTop − yBottom
 *       product: number      // 화면 높이 × 거리
 *       ratio: number | null // 바로 앞에 비춘 기둥의 화면 높이 ÷ 이 기둥의 화면 높이 (첫 기둥은 null)
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (기둥이 선 자리 · 빈 화면).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ShrinkPost = {
  /** 식별자 */
  id: string;
  x: number;
  yBottom: number;
  yTop: number;
  /** 카메라 공간 z. 눈 앞이면 음수 */
  z: number;
};

export type PerspectiveShrinksFarFacetData = {
  type: 'perspective-shrinks-far';
  stepMs: number;
  /** 눈에서 화면까지 거리 */
  focal: number;
  posts: ShrinkPost[];
};

export type ShrinkProjection = {
  index: number;
  d: number;
  x: number;
  yBottom: number;
  yTop: number;
  height: number;
  product: number;
  ratio: number | null;
};

function finiteAt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`perspective-shrinks-far: ${path} 는 유한한 수여야 한다`);
  }
  return value;
}

/** initialData 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 값을 베껴 돌려준다. */
export function readShrinkData(raw: unknown): PerspectiveShrinksFarFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('perspective-shrinks-far: initialData 가 객체가 아니다');
  }
  const rec = raw as Record<string, unknown>;
  if (rec.type !== 'perspective-shrinks-far') {
    throw new Error('perspective-shrinks-far: initialData.type 이 다르다');
  }
  const stepMs = finiteAt(rec.stepMs, 'initialData.stepMs');
  if (stepMs <= 0) throw new Error('perspective-shrinks-far: initialData.stepMs 는 양수여야 한다');
  const focal = finiteAt(rec.focal, 'initialData.focal');
  if (focal <= 0) throw new Error('perspective-shrinks-far: initialData.focal 은 양수여야 한다');
  if (!Array.isArray(rec.posts) || rec.posts.length === 0) {
    throw new Error('perspective-shrinks-far: initialData.posts 가 비었거나 배열이 아니다');
  }
  const seen = new Set<string>();
  const posts = rec.posts.map((item: unknown, i: number): ShrinkPost => {
    const path = `initialData.posts[${i}]`;
    if (typeof item !== 'object' || item === null) {
      throw new Error(`perspective-shrinks-far: ${path} 가 객체가 아니다`);
    }
    const p = item as Record<string, unknown>;
    if (typeof p.id !== 'string' || p.id === '') {
      throw new Error(`perspective-shrinks-far: ${path}.id 가 문자열이 아니다`);
    }
    if (seen.has(p.id)) throw new Error(`perspective-shrinks-far: ${path}.id 가 겹친다`);
    seen.add(p.id);
    const yBottom = finiteAt(p.yBottom, `${path}.yBottom`);
    const yTop = finiteAt(p.yTop, `${path}.yTop`);
    if (!(yTop > yBottom)) {
      throw new Error(`perspective-shrinks-far: ${path}.yTop 이 yBottom 보다 커야 한다`);
    }
    return { id: p.id, x: finiteAt(p.x, `${path}.x`), yBottom, yTop, z: finiteAt(p.z, `${path}.z`) };
  });
  // 이 조각의 전제 — 기둥의 높이가 모두 같다
  const first = posts[0];
  if (!first) throw new Error('perspective-shrinks-far: initialData.posts 가 비었다');
  const tall = first.yTop - first.yBottom;
  posts.forEach((p, i) => {
    if (p.yTop - p.yBottom !== tall) {
      throw new Error(`perspective-shrinks-far: initialData.posts[${i}] 의 높이가 첫 기둥과 다르다`);
    }
  });
  return { type: 'perspective-shrinks-far', stepMs, focal, posts };
}

/** 눈에서의 거리 d = −z. 눈 위나 눈 뒤(d ≤ 0)는 투영할 수 없어 던진다. */
export function depthOf(z: number): number {
  const d = -z;
  if (!(d > 0)) {
    throw new Error(`perspective-shrinks-far: z ${z} 는 눈 앞이 아니다 (d ≤ 0)`);
  }
  return d;
}

/** 기둥 하나를 화면에 비춘다. 나눗셈은 한 번 — 좌표에 f 를 곱한 뒤 d 로 나눈다. */
export function projectPost(post: ShrinkPost, focal: number): Omit<ShrinkProjection, 'index' | 'ratio'> {
  const d = depthOf(post.z);
  const x = (focal * post.x) / d;
  const yBottom = (focal * post.yBottom) / d;
  const yTop = (focal * post.yTop) / d;
  const height = yTop - yBottom;
  return { d, x, yBottom, yTop, height, product: height * d };
}

export async function perspectiveShrinksFar(
  rawCtx: FacetContext<PerspectiveShrinksFarFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<PerspectiveShrinksFarFacetData>;
  const data = readShrinkData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 가까운 것부터 — 거리를 먼저 셈해 두고(여기서 d ≤ 0 이면 던진다) 그 차례로 비춘다
  const order = data.posts
    .map((post, index) => ({ index, d: depthOf(post.z) }))
    .sort((a, b) => a.d - b.d);

  // 걸음 0(기둥이 선 자리 · 빈 화면)을 읽을 틈
  if (!(await pause())) return;

  let prevHeight: number | null = null;
  for (const { index } of order) {
    if (ctx.cancelled) return;
    const post = data.posts[index];
    if (!post) throw new Error(`perspective-shrinks-far: posts[${index}] 가 없다`);
    const shot = projectPost(post, data.focal);
    if (!(shot.height > 0)) {
      throw new Error(`perspective-shrinks-far: posts[${index}] 의 화면 높이가 0 이하다`);
    }
    const ratio: number | null = prevHeight === null ? null : prevHeight / shot.height;
    await ctx.emit({ type: 'project', target: `node:${post.id}`, payload: { index, ...shot, ratio } });
    prevHeight = shot.height;
    if (!(await pause())) return;
  }
}
