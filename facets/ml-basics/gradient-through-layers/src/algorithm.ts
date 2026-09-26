/**
 * gradient-through-layers — 한 줄로 이어진 선형 층 넷을 기울기가 거슬러 건넌다.
 *
 * 망: h_0 = x, h_k = w_k · h_(k−1) (k = 1..4, 활성화 · 치우침 없음), ŷ = h_4, L = ½(ŷ − y)².
 * 앞으로 셈은 걸음 0 에 끝나 있다. 뒤로 셈은 ∂L/∂h_4 = ŷ − y 에서 나서
 * 층 k 를 건널 때마다 ∂L/∂h_(k−1) = ∂L/∂h_k · w_k, 그 층 무게의 기울기는
 * ∂L/∂w_k = ∂L/∂h_k · h_(k−1). 무게를 바꾸는 갱신은 하지 않는다.
 *
 * 이벤트
 *   init   (silent) 앞으로 셈의 결과와 막대 축척.
 *          payload { h: number[5], yHat: number, loss: number, gradMax: number }
 *          gradMax = 뒤로 셈의 모든 |∂L/∂h_k| 가운데 가장 큰 것 (막대 높이의 축척)
 *   output 출력의 기울기가 난다.
 *          payload { g: number }            g = ∂L/∂h_4 = ŷ − y
 *   cross  층 하나를 거슬러 건넌다.
 *          payload { layer: number, factor: number, from: number, to: number,
 *                    product: number, wgrad: number }
 *          layer   건넌 층 번호 k (4 → 1)
 *          factor  그 층의 곱하는 수 w_k
 *          from    ∂L/∂h_k (건너기 전)
 *          to      ∂L/∂h_(k−1) = from · factor (건넌 뒤)
 *          product 지금까지 곱한 w 의 곱
 *          wgrad   ∂L/∂w_k = from · h_(k−1)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 층의 수. 사양이 정한 사슬 길이다 — 무게 배열의 길이와 맞아야 한다. */
export const LAYER_COUNT = 4;

export type GradientThroughLayersFacetData = {
  type: 'gradient-through-layers';
  /** 입력 x (= h_0) */
  x: number;
  /** 목표 y */
  y: number;
  /** 층 무게 w_1 … w_4 (앞에서부터) */
  weights: number[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`gradient-through-layers: ${path} 는 유한한 수여야 한다 (받은 값 ${String(v)})`);
  }
  return v;
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowGradientThroughLayersData(raw: unknown): GradientThroughLayersFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('gradient-through-layers: initialData 가 객체가 아니다');
  }
  const o = raw as Record<string, unknown>;
  if (o.type !== 'gradient-through-layers') {
    throw new Error(`gradient-through-layers: initialData.type 이 'gradient-through-layers' 가 아니다 (받은 값 ${String(o.type)})`);
  }
  if (!Array.isArray(o.weights) || o.weights.length !== LAYER_COUNT) {
    throw new Error(`gradient-through-layers: initialData.weights 는 길이 ${LAYER_COUNT} 의 배열이어야 한다`);
  }
  const weights = o.weights.map((w, i) => finite(w, `initialData.weights[${i}]`));
  const stepMs = finite(o.stepMs, 'initialData.stepMs');
  if (stepMs <= 0) throw new Error('gradient-through-layers: initialData.stepMs 는 0 보다 커야 한다');
  return {
    type: 'gradient-through-layers',
    x: finite(o.x, 'initialData.x'),
    y: finite(o.y, 'initialData.y'),
    weights,
    stepMs,
  };
}

export type LayerCrossing = {
  layer: number;
  factor: number;
  from: number;
  to: number;
  product: number;
  wgrad: number;
};

export type ChainResult = {
  /** h_0 … h_4 */
  h: number[];
  yHat: number;
  loss: number;
  /** ∂L/∂h_4 = ŷ − y */
  outputGrad: number;
  /** 층 4 → 1 차례의 건넘 */
  crossings: LayerCrossing[];
  /** 모든 |∂L/∂h_k| 가운데 가장 큰 것 */
  gradMax: number;
};

/** 앞으로 셈과 뒤로 셈을 전 정밀도로 한 번에 셈한다. */
export function computeChain(data: GradientThroughLayersFacetData): ChainResult {
  const h: number[] = [data.x];
  for (let k = 1; k <= LAYER_COUNT; k += 1) {
    const w = data.weights[k - 1];
    const prev = h[k - 1];
    if (w === undefined || prev === undefined) throw new Error(`gradient-through-layers: 층 ${k} 의 무게나 입력이 없다`);
    h.push(w * prev);
  }
  const yHat = h[LAYER_COUNT];
  if (yHat === undefined) throw new Error('gradient-through-layers: ŷ 를 셈하지 못했다');
  const loss = 0.5 * (yHat - data.y) ** 2;
  const outputGrad = yHat - data.y;
  if (outputGrad === 0) throw new Error('gradient-through-layers: ŷ 가 y 와 같아 기울기가 0 이다 — 건널 것이 없다');

  const crossings: LayerCrossing[] = [];
  let g = outputGrad;
  let product = 1;
  let gradMax = Math.abs(outputGrad);
  for (let k = LAYER_COUNT; k >= 1; k -= 1) {
    const factor = data.weights[k - 1];
    const below = h[k - 1];
    if (factor === undefined || below === undefined) throw new Error(`gradient-through-layers: 층 ${k} 를 건널 값이 없다`);
    if (Math.abs(factor) === 1) throw new Error(`gradient-through-layers: 층 ${k} 의 곱하는 수가 크기를 바꾸지 않는다 (${factor})`);
    const to = g * factor;
    product *= factor;
    crossings.push({ layer: k, factor, from: g, to, product, wgrad: g * below });
    gradMax = Math.max(gradMax, Math.abs(to));
    g = to;
  }
  return { h, yHat, loss, outputGrad, crossings, gradMax };
}

export async function gradientThroughLayers(
  ctxBase: FacetContext<GradientThroughLayersFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<GradientThroughLayersFacetData>;
  const data = narrowGradientThroughLayersData(ctx.data);
  const chain = computeChain(data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 — 앞으로 셈이 끝난 망. 읽을 틈을 둔 뒤 뒤로 셈을 시작한다.
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { h: [...chain.h], yHat: chain.yHat, loss: chain.loss, gradMax: chain.gradMax },
  });
  if (!(await pause())) return;

  await ctx.emit({ type: 'output', payload: { g: chain.outputGrad } });

  for (const c of chain.crossings) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'cross',
      payload: {
        layer: c.layer,
        factor: c.factor,
        from: c.from,
        to: c.to,
        product: c.product,
        wgrad: c.wgrad,
      },
    });
  }
}
