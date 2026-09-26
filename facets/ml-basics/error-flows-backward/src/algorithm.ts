/**
 * error-flows-backward — 출력의 틀림이 가지를 따라 뒤로 갈라져 흐른다.
 *
 * 입력 둘 → 은닉 셋(ReLU) → 출력 하나(활성화 없음), 손실 L = ½(ŷ − y)², 치우침 없음.
 * 앞으로 셈은 걸음 0 에 이미 끝나 있다. 한 걸음 = 틀림이 층 한 칸을 건넘. 무게는 바꾸지 않는다.
 *
 * 이벤트 (발신 순서대로)
 *   forward  silent  { z: number[], h: number[], yhat: number, loss: number }
 *            — 앞으로 셈의 결과. 걸음 0 을 갈아 끼운다
 *   error            { deltaOut: number }
 *            — 걸음 1. δ_out = ∂L/∂ŷ = ŷ − y
 *   toHidden         { deltaHidden: number[], gradW2: number[], flipped: number[] }
 *            — 걸음 2. δ_h_j = w2_j · δ_out · ReLU′(z_j), ∂L/∂w2_j = δ_out · h_j,
 *              flipped = 부호가 δ_out 과 반대가 된 은닉의 자리(0 부터)
 *   toInputs         { gradW1: number[][] }
 *            — 걸음 3. ∂L/∂W1[j][i] = δ_h_j · x_i
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ErrorFlowsBackwardFacetData = {
  type: 'error-flows-backward';
  stepMs: number;
  /** 입력 x_i */
  x: number[];
  /** 입력 → 은닉 무게 W1[j][i] (은닉 j, 입력 i) */
  W1: number[][];
  /** 은닉 → 출력 무게 w2_j */
  w2: number[];
  /** 목표 y */
  y: number;
};

function finiteArray(v: unknown, path: string): number[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${path} 는 비지 않은 수 배열이어야 한다`);
  return v.map((q, k) => {
    if (typeof q !== 'number' || !Number.isFinite(q)) throw new Error(`${path}[${k}] 가 수가 아니다`);
    return q;
  });
}

/** `initialData` 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function readErrorFlowsData(raw: unknown): ErrorFlowsBackwardFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('initialData 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'error-flows-backward') throw new Error('initialData.type 은 error-flows-backward 여야 한다');
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('initialData.stepMs 가 양수가 아니다');
  if (typeof r.y !== 'number' || !Number.isFinite(r.y)) throw new Error('initialData.y 가 수가 아니다');
  const x = finiteArray(r.x, 'initialData.x');
  const w2 = finiteArray(r.w2, 'initialData.w2');
  if (!Array.isArray(r.W1)) throw new Error('initialData.W1 이 배열이 아니다');
  const W1 = r.W1.map((row, j) => finiteArray(row, `initialData.W1[${j}]`));
  if (W1.length !== w2.length) throw new Error('initialData.W1 의 줄 수가 w2 의 길이와 다르다');
  W1.forEach((row, j) => {
    if (row.length !== x.length) throw new Error(`initialData.W1[${j}] 의 길이가 x 의 길이와 다르다`);
  });
  return { type: 'error-flows-backward', stepMs: r.stepMs, x, W1, w2, y: r.y };
}

/** ReLU′ — 0 에서의 규약은 이 조각이 정하지 않았다. 닿으면 던진다. */
function reluSlope(z: number, j: number): number {
  if (z === 0) throw new Error(`은닉 ${j + 1} 의 z 가 0 이다 — ReLU′ 규약이 없다`);
  return z > 0 ? 1 : 0;
}

export async function errorFlowsBackward(
  context: FacetContext<ErrorFlowsBackwardFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ErrorFlowsBackwardFacetData>;
  const { stepMs, x, W1, w2, y } = readErrorFlowsData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 앞으로 셈 — 걸음 0 의 바탕
  const z = W1.map((row) => row.reduce((s, w, i) => s + w * x[i]!, 0));
  const h = z.map((v) => Math.max(0, v));
  const yhat = h.reduce((s, v, j) => s + w2[j]! * v, 0);
  const loss = 0.5 * (yhat - y) ** 2;
  await ctx.emit({ type: 'forward', payload: { z, h, yhat, loss }, silent: true });

  // 걸음 0 은 앞으로 셈이 끝난 망 — 읽을 틈을 둔다
  if (!(await pause())) return;

  // 걸음 1 — 출력에 틀림이 생긴다
  const deltaOut = yhat - y;
  await ctx.emit({ type: 'error', payload: { deltaOut } });
  if (!(await pause())) return;

  // 걸음 2 — 은닉으로: 가지 무게에 비례한 몫, 음수 가지는 부호가 뒤집힌다
  const deltaHidden = w2.map((w, j) => w * deltaOut * reluSlope(z[j]!, j));
  const gradW2 = h.map((v) => deltaOut * v);
  const flipped: number[] = [];
  deltaHidden.forEach((d, j) => {
    if (d !== 0 && Math.sign(d) !== Math.sign(deltaOut)) flipped.push(j);
  });
  await ctx.emit({ type: 'toHidden', payload: { deltaHidden, gradW2, flipped } });
  if (!(await pause())) return;

  // 걸음 3 — 입력 가지로: 은닉의 몫이 입력 값만큼씩 앞쪽 무게에 닿는다
  const gradW1 = deltaHidden.map((d) => x.map((xi) => d * xi));
  await ctx.emit({ type: 'toInputs', payload: { gradW1 } });
}
