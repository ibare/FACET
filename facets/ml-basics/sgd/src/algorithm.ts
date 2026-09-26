/**
 * 확률적 경사 하강과 미니배치 — 묶음 크기 B 를 돌리면 같은 두 에폭 동안 갱신이 몇 번, 얼마나 비껴서 일어나는가.
 *
 * 모형 ŷ = w·x + b. 묶음 손실 = 묶음 안 평균 (ŷ − y)², 묶음 기울기 = 묶음 안 평균 (2r·x, 2r) (r = ŷ − y).
 * 전체 손실 · 전체 기울기 = 점 전체 평균. 기울기는 언제나 **갱신 전 자리**에서 셈한다. 갱신 w ← w − η·g.
 * 묶음 k 는 order[e·n + k·B … e·n + k·B + B − 1] (모든 B 가 같은 차례를 쓴다 — 난수 없음).
 *
 * 비낌 = −g_전체 에서 −g_묶음 으로 돈 각 = atan2(외적, 내적) (도).
 *   외적 = Gw·gb − Gb·gw · 내적 = Gw·gw + Gb·gb. 화면은 크기 |각| 을 쓴다.
 * 거꾸로 간 갱신 = 내적 < 0 (비낌이 90° 를 넘는다). IR 도 이 부호만 센다 (atan2 가 IR 에 없다).
 * 동률 · 경계: 이 데이터에서 비낌이 90° 에 1° 안으로 붙는 갱신은 없다 (내적 부호가 끝자리에 흔들리지 않는다).
 * B 16 의 각 원값은 3.5e−15 · 0 이다 (더하는 차례가 달라 끝자리만 다르다) — 표시 0.
 *
 * 셈의 길은 IR `sgdEpochs` 와 하나다 — 묶음 기울기 (차례대로 더한 뒤 B 로 나눔) → 전체 기울기 (번호 차례대로 더한 뒤 n 으로
 * 나눔) → 내적 부호 → 갱신. 점의 저장 차례를 섞고 order 를 따라 바꿔도 두 길이 같다 (facet 테스트가 잠근다).
 *
 * 걸음 (한 판 = 손잡이 값 하나):
 *   걸음 0 = 처음 모습 · 에폭마다 에폭 머리 걸음 하나 · 갱신마다 한 걸음 · 끝 걸음 하나.
 *   걸음 수 = 1 + 에폭 수 + 갱신 수 + 1 (B 1 · 2 · 4 · 8 · 16 → 36 · 20 · 12 · 8 · 6).
 *
 * 이벤트 (silent 가 아닌 것은 모두 걸음 하나):
 *   sgd-start  { stepMs: number, batch: number, n: number, epochs: number, perEpoch: number, totalUpdates: number,
 *                boundaries: number[] (한 에폭 띠 안의 묶음 칸막이 자리 0 · B · 2B … n),
 *                w: number, b: number, loss: number }                                         — 걸음 0
 *   sgd-epoch  { epoch: number (0 부터), order: number[] (이 에폭의 점 번호 n 개, 0 부터) }   — 에폭 머리
 *   sgd-step   { epoch: number, batchIndex: number (에폭 안 0 부터), start: number (띠 안 첫 칸),
 *                size: number, points: number[], angle: number (부호 있는 도), absAngle: number,
 *                backward: boolean, w: number, b: number, loss: number (갱신 뒤 전체 손실),
 *                updates: number, backwardCount: number }                                     — 갱신 한 번
 *   sgd-end    { epochs: number, updates: number, backwardCount: number, meanAbsAngle: number,
 *                w: number, b: number, loss: number }                                          — 끝 걸음
 *   phase      { phase } silent — 그 걸음의 발신 앞에
 *
 * phase 어휘 (irs.ts 와 같다):
 *   sgd-epoch  에폭 머리 · sgd-update  거꾸로 가지 않은 갱신 · sgd-back  거꾸로 간 갱신 · sgd-loss  끝 걸음
 *   걸음 0 은 phase 가 없다 (projector 가 코드 패널 강조를 끈다).
 *
 * 계기 (누적 채널 — 지금 값을 들고 차이만 보낸다, 판 머리에 0 으로):
 *   updates           이 판의 갱신 수 (= IR tally[0])
 *   backward-updates  이 판의 거꾸로 간 갱신 수 (= IR tally[1])
 *
 * 손잡이: action/name `batch` — payload.value 가 batchLadder 의 값이어야 한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SgdData = {
  type: 'sgd';
  stepMs: number;
  xs: number[];
  ys: number[];
  order: number[];
  batchLadder: number[];
  batch: number;
  eta: number;
  w0: number;
  b0: number;
};

function isNumList(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

/** 데이터 모양을 확인하고 좁힌다. 셈할 수 없는 모양이면 던진다. */
export function checkSgdData(raw: unknown): SgdData {
  if (typeof raw !== 'object' || raw === null) throw new Error('sgd: data 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  const { stepMs, xs, ys, order, batchLadder, batch, eta, w0, b0 } = d;
  if (d.type !== 'sgd') throw new Error('sgd: data.type 이 sgd 가 아니다');
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('sgd: stepMs 가 없다');
  if (!isNumList(xs) || !isNumList(ys) || xs.length === 0 || xs.length !== ys.length) {
    throw new Error('sgd: xs · ys 는 같은 길이의 수 목록이어야 한다');
  }
  const n = xs.length;
  if (!isNumList(order) || order.length === 0 || order.length % n !== 0) {
    throw new Error('sgd: order 길이가 점 수의 배수가 아니다');
  }
  for (let e = 0; e < order.length / n; e++) {
    const seen = new Set(order.slice(e * n, e * n + n));
    for (let i = 0; i < n; i++) {
      if (!seen.has(i)) throw new Error(`sgd: 에폭 ${e + 1} 의 차례가 0‥${n - 1} 의 섞음이 아니다`);
    }
  }
  if (!isNumList(batchLadder) || batchLadder.length === 0) throw new Error('sgd: batchLadder 가 없다');
  for (const B of batchLadder) {
    if (!Number.isInteger(B) || B < 1 || n % B !== 0) throw new Error(`sgd: 묶음 크기 ${B} 가 점 수를 나누지 못한다`);
  }
  if (typeof batch !== 'number' || !batchLadder.includes(batch)) throw new Error('sgd: batch 가 사다리에 없다');
  if (typeof eta !== 'number' || typeof w0 !== 'number' || typeof b0 !== 'number') {
    throw new Error('sgd: eta · w0 · b0 가 수가 아니다');
  }
  return { type: 'sgd', stepMs, xs, ys, order, batchLadder, batch, eta, w0, b0 };
}

/** 전체 손실 — 점 전체 평균 (ŷ − y)². IR `fullLoss` 와 같은 길. */
export function sgdFullLoss(xs: number[], ys: number[], w: number, b: number): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    const r = w * xs[i]! + b - ys[i]!;
    s = s + r * r;
  }
  return s / xs.length;
}

/** 묶음 기울기 — order[start … start + B − 1] 의 평균 (2r·x, 2r). */
export function sgdBatchGrad(
  xs: number[], ys: number[], order: number[], start: number, B: number, w: number, b: number,
): [number, number] {
  let gw = 0;
  let gb = 0;
  for (let j = 0; j < B; j++) {
    const i = order[start + j];
    if (i === undefined) throw new Error('sgd: 묶음이 차례 밖으로 나갔다');
    const r = w * xs[i]! + b - ys[i]!;
    gw = gw + 2 * r * xs[i]!;
    gb = gb + 2 * r;
  }
  return [gw / B, gb / B];
}

/** 전체 기울기 — 점 번호 차례대로 더한 평균 (2r·x, 2r). */
export function sgdFullGrad(xs: number[], ys: number[], w: number, b: number): [number, number] {
  let Gw = 0;
  let Gb = 0;
  for (let i = 0; i < xs.length; i++) {
    const r = w * xs[i]! + b - ys[i]!;
    Gw = Gw + 2 * r * xs[i]!;
    Gb = Gb + 2 * r;
  }
  return [Gw / xs.length, Gb / xs.length];
}

/** 비낌 — −g_전체 에서 −g_묶음 으로 돈 각 (도, 반시계 +). */
export function sgdSkewDegrees(Gw: number, Gb: number, gw: number, gb: number): number {
  const cross = Gw * gb - Gb * gw;
  const dot = Gw * gw + Gb * gb;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

/** 한 에폭 띠 안의 묶음 칸막이 자리 — 0 · B · 2B … n. */
export function sgdBoundaries(n: number, B: number): number[] {
  const out: number[] = [];
  for (let p = 0; p <= n; p += B) out.push(p);
  return out;
}

export type SgdUpdate = {
  epoch: number;
  batchIndex: number;
  start: number;
  points: number[];
  angle: number;
  backward: boolean;
  w: number;
  b: number;
  loss: number;
};

/**
 * 한 판의 셈 — 갱신 한 번마다 onUpdate 를 부른다 (알고리즘은 여기서 걸음을 발신한다).
 * 돌려주는 값: 끝 (w, b) · 갱신 수 · 거꾸로 수 · 끝 손실 · 평균 |비낌|.
 */
export function sgdPlan(data: SgdData, B: number): {
  updates: SgdUpdate[];
  w: number; b: number; count: number; backward: number; loss: number; meanAbsAngle: number;
} {
  const { xs, ys, order, eta } = data;
  const n = xs.length;
  if (!data.batchLadder.includes(B)) throw new Error(`sgd: 묶음 크기 ${B} 가 사다리에 없다`);
  const epochs = order.length / n;
  const wb = [data.w0, data.b0] as [number, number];
  const tally = [0, 0] as [number, number];
  const updates: SgdUpdate[] = [];
  let absSum = 0;
  for (let e = 0; e < epochs; e++) {
    for (let k = 0; k < n / B; k++) {
      const [gw, gb] = sgdBatchGrad(xs, ys, order, e * n + k * B, B, wb[0], wb[1]);
      const [Gw, Gb] = sgdFullGrad(xs, ys, wb[0], wb[1]);
      const backward = Gw * gw + Gb * gb < 0;
      if (backward) tally[1] = tally[1] + 1;
      const angle = sgdSkewDegrees(Gw, Gb, gw, gb);
      wb[0] = wb[0] - eta * gw;
      wb[1] = wb[1] - eta * gb;
      tally[0] = tally[0] + 1;
      absSum += Math.abs(angle);
      updates.push({
        epoch: e,
        batchIndex: k,
        start: k * B,
        points: order.slice(e * n + k * B, e * n + k * B + B),
        angle,
        backward,
        w: wb[0],
        b: wb[1],
        loss: sgdFullLoss(xs, ys, wb[0], wb[1]),
      });
    }
  }
  return {
    updates,
    w: wb[0],
    b: wb[1],
    count: tally[0],
    backward: tally[1],
    loss: sgdFullLoss(xs, ys, wb[0], wb[1]),
    meanAbsAngle: absSum / tally[0],
  };
}

export async function sgdAlgorithm(ctx: FacetContext<SgdData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SgdData>;
  const data = checkSgdData(ctx.data);
  const n = data.xs.length;
  const epochs = data.order.length / n;
  const pause = () => rctx.sleep(data.stepMs);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이 0 이어도 보낸다.
  let shownUpdates = 0;
  let shownBackward = 0;
  let sentOnce = false;
  const showCounts = (updates: number, backward: number) => {
    if (!sentOnce || updates !== shownUpdates) ctx.metric('updates', updates - shownUpdates);
    if (!sentOnce || backward !== shownBackward) ctx.metric('backward-updates', backward - shownBackward);
    shownUpdates = updates;
    shownBackward = backward;
    sentOnce = true;
  };

  const playRun = async (B: number): Promise<boolean> => {
    const plan = sgdPlan(data, B);
    const perEpoch = n / B;

    // 걸음 0 — 처음 모습
    showCounts(0, 0);
    await ctx.emit({
      type: 'sgd-start',
      payload: {
        stepMs: data.stepMs,
        batch: B,
        n,
        epochs,
        perEpoch,
        totalUpdates: plan.count,
        boundaries: sgdBoundaries(n, B),
        w: data.w0,
        b: data.b0,
        loss: sgdFullLoss(data.xs, data.ys, data.w0, data.b0),
      },
    });
    if (!(await pause())) return false;

    let u = 0;
    for (let e = 0; e < epochs; e++) {
      if (ctx.cancelled) return false;
      await phase('sgd-epoch');
      await ctx.emit({ type: 'sgd-epoch', payload: { epoch: e, order: data.order.slice(e * n, e * n + n) } });
      if (!(await pause())) return false;

      for (let k = 0; k < perEpoch; k++) {
        if (ctx.cancelled) return false;
        const up = plan.updates[u];
        if (up === undefined || up.epoch !== e || up.batchIndex !== k) throw new Error('sgd: 갱신 차례가 어긋났다');
        u += 1;
        const backwardSoFar = plan.updates.slice(0, u).filter((x) => x.backward).length;
        if (up.backward) await phase('sgd-back');
        else await phase('sgd-update');
        showCounts(u, backwardSoFar);
        await ctx.emit({
          type: 'sgd-step',
          payload: {
            epoch: e,
            batchIndex: k,
            start: up.start,
            size: B,
            points: up.points,
            angle: up.angle,
            absAngle: Math.abs(up.angle),
            backward: up.backward,
            w: up.w,
            b: up.b,
            loss: up.loss,
            updates: u,
            backwardCount: backwardSoFar,
          },
        });
        if (!(await pause())) return false;
      }
    }

    if (ctx.cancelled) return false;
    await phase('sgd-loss');
    await ctx.emit({
      type: 'sgd-end',
      payload: {
        epochs,
        updates: plan.count,
        backwardCount: plan.backward,
        meanAbsAngle: plan.meanAbsAngle,
        w: plan.w,
        b: plan.b,
        loss: plan.loss,
      },
    });
    return true;
  };

  let B = data.batch;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRun(B))) return;
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'batch') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) throw new Error('sgd: batch 입력에 payload 가 없다');
        const value = (p as { value?: unknown }).value;
        if (typeof value !== 'number' || !data.batchLadder.includes(value)) {
          throw new Error(`sgd: 묶음 크기 ${String(value)} 가 사다리에 없다`);
        }
        next = value;
      }
      B = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
