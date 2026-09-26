/**
 * hidden-layer-features — 가운데 층 단위 둘의 값이 입력 네 점의 새 자리가 된다.
 *
 * 망은 앞으로 셈만 한다. 무게는 initialData 로 주어지고 그대로다(학습을 재생하지 않는다).
 * 단위 j 의 값 hⱼ = σ(wⱼ₁·x1 + wⱼ₂·x2 + bⱼ), σ(z) = 1 / (1 + e^−z).
 * 걸음마다 한 자리(단위 1 → 가로, 단위 2 → 세로)를 그 단위의 값으로 바꾼다.
 *
 * 이벤트
 *   init     (silent) { lo: number; hi: number; zero: number; one: number }
 *            lo · hi — 모든 걸음의 자리가 드는 축 범위. zero · one — 처음 자리에서
 *            답 0 짝 · 답 1 짝의 거리(유클리드)
 *   replace  { unit: number; axis: 'x' | 'y'; values: number[]; zero: number; one: number }
 *            unit — 단위 번호(1 부터). axis — 바뀌는 자리. values — 점마다 그 단위의 값
 *            (inputs 차례). zero · one — 바꾼 뒤 답 0 짝 · 답 1 짝의 거리
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HiddenInput = { x1: number; x2: number; y: 0 | 1 };
export type HiddenUnit = { w: [number, number]; b: number };

export type HiddenLayerFeaturesFacetData = {
  type: 'hidden-layer-features';
  stepMs: number;
  inputs: HiddenInput[];
  units: HiddenUnit[];
};

/** 자리의 차례 — 단위 j(0 부터)가 바꾸는 자리. 평면이 둘이라 단위도 둘이다. */
export const AXES = ['x', 'y'] as const;
export type Axis = (typeof AXES)[number];

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`hidden-layer-features: ${path} 가 유한한 수가 아니다`);
  }
  return v;
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowHiddenLayerFeaturesData(raw: unknown): HiddenLayerFeaturesFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('hidden-layer-features: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'hidden-layer-features') {
    throw new Error('hidden-layer-features: initialData.type 이 다르다');
  }
  const stepMs = finite(d.stepMs, 'initialData.stepMs');
  if (!Array.isArray(d.inputs)) throw new Error('hidden-layer-features: initialData.inputs 가 배열이 아니다');
  if (!Array.isArray(d.units)) throw new Error('hidden-layer-features: initialData.units 가 배열이 아니다');
  const inputs: HiddenInput[] = d.inputs.map((p: unknown, i: number) => {
    if (typeof p !== 'object' || p === null) {
      throw new Error(`hidden-layer-features: initialData.inputs[${i}] 가 객체가 아니다`);
    }
    const q = p as Record<string, unknown>;
    const y = q.y;
    if (y !== 0 && y !== 1) throw new Error(`hidden-layer-features: initialData.inputs[${i}].y 가 0 · 1 이 아니다`);
    return { x1: finite(q.x1, `initialData.inputs[${i}].x1`), x2: finite(q.x2, `initialData.inputs[${i}].x2`), y };
  });
  const units: HiddenUnit[] = d.units.map((u: unknown, j: number) => {
    if (typeof u !== 'object' || u === null) {
      throw new Error(`hidden-layer-features: initialData.units[${j}] 가 객체가 아니다`);
    }
    const q = u as Record<string, unknown>;
    if (!Array.isArray(q.w) || q.w.length !== 2) {
      throw new Error(`hidden-layer-features: initialData.units[${j}].w 가 수 둘이 아니다`);
    }
    return {
      w: [finite(q.w[0], `initialData.units[${j}].w[0]`), finite(q.w[1], `initialData.units[${j}].w[1]`)],
      b: finite(q.b, `initialData.units[${j}].b`),
    };
  });
  if (units.length !== AXES.length) {
    throw new Error(`hidden-layer-features: initialData.units 는 자리 수(${AXES.length})만큼이어야 한다`);
  }
  for (const y of [0, 1] as const) {
    if (inputs.filter((p) => p.y === y).length !== 2) {
      throw new Error(`hidden-layer-features: initialData.inputs 에 답 ${y} 인 점이 둘이 아니다`);
    }
  }
  return { type: 'hidden-layer-features', stepMs, inputs, units };
}

/** 답이 y 인 두 점의 차례 — 바탕에서 정해지는 작은 셈이라 장면 · 그림도 부른다. */
export function pairOf(inputs: readonly HiddenInput[], y: 0 | 1): [number, number] {
  const idx: number[] = [];
  inputs.forEach((p, i) => {
    if (p.y === y) idx.push(i);
  });
  const [a, b] = idx;
  if (idx.length !== 2 || a === undefined || b === undefined) {
    throw new Error(`hidden-layer-features: 답 ${y} 인 점이 둘이 아니다`);
  }
  return [a, b];
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

type P = [number, number];

function pairDistance(pos: readonly P[], pair: [number, number]): number {
  const a = pos[pair[0]];
  const b = pos[pair[1]];
  if (!a || !b) throw new Error('hidden-layer-features: 짝의 자리가 없다');
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export async function hiddenLayerFeatures(
  ctx: FacetContext<HiddenLayerFeaturesFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<HiddenLayerFeaturesFacetData>;
  const data = narrowHiddenLayerFeaturesData(rctx.data);
  const { inputs, units, stepMs } = data;
  const zeroPair = pairOf(inputs, 0);
  const onePair = pairOf(inputs, 1);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 단위마다 네 점의 값 — 셈은 전 정밀도
  const values: number[][] = units.map((u) => inputs.map((p) => sigmoid(u.w[0] * p.x1 + u.w[1] * p.x2 + u.b)));

  // 걸음마다의 자리 — 축 범위와 거리를 셈하려고 미리 짓는다
  const stages: P[][] = [inputs.map((p): P => [p.x1, p.x2])];
  for (let j = 0; j < units.length; j += 1) {
    if (rctx.cancelled) return;
    const prev = stages[stages.length - 1];
    const hs = values[j];
    if (!prev || !hs) throw new Error('hidden-layer-features: 자리를 지을 수 없다');
    stages.push(
      prev.map((p, i): P => {
        const h = hs[i];
        if (h === undefined) throw new Error(`hidden-layer-features: 단위 ${j + 1} 의 값[${i}] 이 없다`);
        return j === 0 ? [h, p[1]] : [p[0], h];
      }),
    );
  }
  const coords = stages.flat(2);
  const lo = Math.min(...coords);
  const hi = Math.max(...coords);

  const first = stages[0];
  if (!first) throw new Error('hidden-layer-features: 처음 자리가 없다');
  await rctx.emit({
    type: 'init',
    silent: true,
    payload: { lo, hi, zero: pairDistance(first, zeroPair), one: pairDistance(first, onePair) },
  });

  // 걸음 0 은 이미 읽을 것이 있는 화면이다 — 첫 바꿈 앞에 머문다
  for (let j = 0; j < units.length; j += 1) {
    if (!(await pause())) return;
    const pos = stages[j + 1];
    const hs = values[j];
    const axis = AXES[j];
    if (!pos || !hs || !axis) throw new Error(`hidden-layer-features: 단위 ${j + 1} 의 걸음을 지을 수 없다`);
    await rctx.emit({
      type: 'replace',
      payload: {
        unit: j + 1,
        axis,
        values: hs,
        zero: pairDistance(pos, zeroPair),
        one: pairDistance(pos, onePair),
      },
    });
  }
}
