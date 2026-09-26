/**
 * learning-rate-too-big — 학습률이 너무 크면 경사 하강은 바닥에 닿는가.
 *
 * 무게 하나 w, 손실 L(w) = w², 기울기 g(w) = 2w. 갱신 w ← w − η·g(w) 를 정해진
 * 횟수만큼 한다. g 는 갱신 **전** 자리에서 셈한다. 한 걸음 = 갱신 한 번.
 *
 * 이벤트
 *   init    (silent) 바탕 — 축 범위와 곡선 표본, 처음 자리
 *           payload: {
 *             wLim: number        가로축 반폭 (−wLim … wLim)
 *             lLim: number        세로축 위끝 (= L(wLim))
 *             curve: number[][]   [w, L] 표본 쌍
 *             w0: number          처음 무게
 *             loss0: number       L(w0)
 *             dist0: number       |w0 − 0| (바닥에서 떨어진 거리)
 *           }
 *   update  갱신 한 번
 *           payload: {
 *             k: number           몇 번째 갱신인가 (1 부터)
 *             g: number           갱신 전 자리의 기울기
 *             move: number        η·g
 *             from: number        갱신 전 w
 *             to: number          갱신 뒤 w
 *             lossFrom: number    L(from)
 *             lossTo: number      L(to)
 *             distFrom: number    |from|
 *             distTo: number      |to|
 *           }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LearningRateTooBigFacetData = {
  type: 'learning-rate-too-big';
  /** 학습률 η */
  eta: number;
  /** 처음 무게 */
  w0: number;
  /** 갱신 횟수 */
  updates: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** 곡선 표본 수 (양끝 포함). */
const CURVE_SAMPLES = 97;
/** 가장 먼 자리 너머로 축을 늘리는 배율. */
const AXIS_MARGIN = 1.06;

function num(raw: Record<string, unknown>, key: string): number {
  const v = raw[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`learning-rate-too-big: initialData.${key} 가 유한한 수가 아니다 (${String(v)})`);
  }
  return v;
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 쓴다. */
export function narrowLearningRateTooBigData(raw: unknown): LearningRateTooBigFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('learning-rate-too-big: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'learning-rate-too-big') {
    throw new Error(`learning-rate-too-big: initialData.type 이 어긋났다 (${String(r.type)})`);
  }
  const eta = num(r, 'eta');
  const w0 = num(r, 'w0');
  const updates = num(r, 'updates');
  const stepMs = num(r, 'stepMs');
  if (eta <= 0) throw new Error(`learning-rate-too-big: initialData.eta 는 양수여야 한다 (${eta})`);
  if (!Number.isInteger(updates) || updates < 1) {
    throw new Error(`learning-rate-too-big: initialData.updates 는 1 이상의 정수여야 한다 (${updates})`);
  }
  if (stepMs <= 0) throw new Error(`learning-rate-too-big: initialData.stepMs 는 양수여야 한다 (${stepMs})`);
  return { type: 'learning-rate-too-big', eta, w0, updates, stepMs };
}

/** 손실 L(w) = w². */
export function lossAt(w: number): number {
  return w * w;
}

/** 기울기 g(w) = 2w. */
export function gradAt(w: number): number {
  return 2 * w;
}

/** 자리 열에서 i 번째를 꺼낸다. 없으면 던진다. */
function pick(path: readonly number[], i: number): number {
  const w = path[i];
  if (w === undefined) throw new Error(`learning-rate-too-big: 자리 열에 ${i} 번째가 없다`);
  return w;
}

export async function learningRateTooBig(
  context: FacetContext<LearningRateTooBigFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<LearningRateTooBigFacetData>;
  const { eta, w0, updates, stepMs } = narrowLearningRateTooBigData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 축 범위를 정하려고 자리 열을 먼저 셈한다 — 같은 열을 아래에서 걸음으로 흘린다.
  const path: number[] = [w0];
  for (let k = 1; k <= updates; k += 1) {
    if (ctx.cancelled) return;
    const w = pick(path, k - 1);
    path.push(w - eta * gradAt(w));
  }
  let far = 0;
  for (const w of path) {
    if (ctx.cancelled) return;
    if (!Number.isFinite(w)) throw new Error(`learning-rate-too-big: 자리가 유한하지 않다 (${w})`);
    far = Math.max(far, Math.abs(w));
  }
  if (far === 0) throw new Error('learning-rate-too-big: 모든 자리가 바닥이라 축을 정할 수 없다');
  const wLim = far * AXIS_MARGIN;
  const curve: number[][] = [];
  for (let i = 0; i < CURVE_SAMPLES; i += 1) {
    if (ctx.cancelled) return;
    const w = -wLim + (2 * wLim * i) / (CURVE_SAMPLES - 1);
    curve.push([w, lossAt(w)]);
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      wLim,
      lLim: lossAt(wLim),
      curve,
      w0,
      loss0: lossAt(w0),
      dist0: Math.abs(w0),
    },
  });

  // 걸음 0 은 이미 곡선과 처음 자리가 있는 화면이라 읽을 틈을 둔다.
  for (let k = 1; k <= updates; k += 1) {
    if (!(await pause())) return;
    const from = pick(path, k - 1);
    const to = pick(path, k);
    const g = gradAt(from);
    await ctx.emit({
      type: 'update',
      payload: {
        k,
        g,
        move: eta * g,
        from,
        to,
        lossFrom: lossAt(from),
        lossTo: lossAt(to),
        distFrom: Math.abs(from),
        distTo: Math.abs(to),
      },
    });
  }
}
