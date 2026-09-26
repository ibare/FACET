/**
 * mlp-activation — 다층 퍼셉트론과 활성화. 같은 첫 무게에서 은닉 한 층 망을 전체 묶음 경사 하강으로
 * 600 에폭 학습하고, 스냅샷 여덟(에폭 0 · 10 · 25 · 50 · 100 · 200 · 400 · 600)마다 입력 평면의 경계를 보인다.
 * 손잡이 둘 — 활성화(없음 · ReLU · 시그모이드)와 은닉 폭(1 · 2 · 4).
 *
 * 셈 (sim `mlp_core` 와 한 줄씩 같다 — IR `mlpTrain` 도 같은 셈):
 *   z_j = wa_j·x1 + wb_j·x2 + b_j · h_j = act(z_j) · o = c + Σ v_j·h_j · p = σ(o) · 맞힘 = (o > 0 이면 1) 이 y 와 같음
 *   한 에폭 = (1) 점마다 d_i = p_i − y_i 를 ds 에 (2) 단위마다 기울기를 점 차례로 모아 그 단위를 갱신 (3) c 갱신.
 *   기울기는 모두 갱신 전 무게로. 손실 = 평균 교차 엔트로피(자연로그).
 *   동률: 맞힘 판정은 o > 0 (o = 0 이면 0 으로 친다). 이 데이터에서 o 는 0 에 닿지 않는다 (가장 작은 |o| 4.6e−4, sim).
 *   ReLU 는 z > 0 에서만 켜진다 — z 도 0 에 닿지 않는다 (가장 작은 |z| 1.9e−6, sim).
 *
 * 무게 버퍼는 제자리에서 고쳐지므로 스냅샷 사이 에폭 수(10 · 15 · 25 · 50 · 100 · 200 · 200)로 mlpTrain 을
 * 이어 부른다 — 한 번에 600 을 돈 것과 같다. 폭 H 는 첫 무게 단위 넷의 앞 H 를 쓴다.
 *
 * 이벤트 (emit):
 *   init      silent. { plane: [lo, hi], planeTicks: number[], gridSteps: number, snapshots: number[],
 *               lossTicks: number[], lossTop: number, curveRange: [lo, hi], curveSamples: number,
 *               points: { id: string; x1: number; x2: number; y: number }[], maxWidth: number }
 *             — 판과 무관한 자리(평면 · 눈금 · 점의 자리). 손실 눈금은 아홉 칸 전부의 손실로 고정한다.
 *   phase     silent. { phase: 'count' | 'train' } — 걸음 발신 바로 앞.
 *   snapshot  걸음. { step: number (0..7), epoch: number, kind: number, width: number,
 *               grid: number[] ((gridSteps+1)² — o 값, x2 가 바깥 · x1 이 안쪽 차례, 둘 다 lo → hi),
 *               correct: boolean[] (점 차례), right: number, total: number, loss: number,
 *               losses: number[] (이 판의 걸음 0..step 손실), units: ([x1a, x2a, x1b, x2b] | null)[] (z_j = 0 선을 평면에 자른 두 끝, 폭 H 개),
 *               curve: number[] (curveSamples 개 — act(z), z 는 curveRange 를 고르게) }
 *             step 0 이 새 판의 머리다 (첫 무게 그대로).
 *
 * phase 어휘 (irs.ts 와 같다): count (맞힌 수와 손실을 세는 끝 반복) · train (에폭 반복 안).
 *   걸음 #0 은 count, #1 … #7 은 train.
 *
 * 계기 (누적 채널 — 지금 값을 들고 차이만 보낸다):
 *   epochs   지금 스냅샷 에폭
 *   correct  지금 맞힌 수
 *
 * 입력: { type: 'activation' | 'width', payload: { value: number } } — 사다리 밖의 값은 받지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MlpActivationPoint = { id: string; x1: number; x2: number; y: number };
export type MlpActivationUnit = { wa: number; wb: number; b: number; v: number };

export type MlpActivationData = {
  type: 'mlp-activation';
  stepMs: number;
  /** 활성화 종류 — 손잡이 값 0 · 1 · 2 가 이 차례 */
  kinds: string[];
  /** 은닉 폭 사다리 */
  widths: number[];
  defaultKind: number;
  defaultWidth: number;
  points: MlpActivationPoint[];
  /** 첫 무게 — 단위 1 … 4 */
  units: MlpActivationUnit[];
  /** 출력 치우침 첫 값 */
  c0: number;
  lr: number;
  snapshots: number[];
  /** 평면 [lo, hi] — 두 축 같다 */
  plane: number[];
  /** 경계 격자의 칸 수 (한 변) */
  gridSteps: number;
  /** 활성화 곡선의 z 범위 */
  curveRange: number[];
  curveSamples: number;
};

// ── 활성화 — IR activate · slope 와 같다 ─────────────────────────────────────────

/** act(z). kind 0 없음 · 1 ReLU · 2 시그모이드. 모르는 종류는 던진다. */
export function activate(kind: number, z: number): number {
  if (kind === 0) return z;
  if (kind === 1) {
    if (z > 0) return z;
    return 0.0;
  }
  if (kind === 2) return 1.0 / (1.0 + Math.exp(-z));
  throw new Error(`[mlp-activation] 모르는 활성화 종류: ${kind}`);
}

/** act′(z). ReLU′(0) 은 0. */
export function slope(kind: number, z: number): number {
  if (kind === 0) return 1.0;
  if (kind === 1) {
    if (z > 0) return 1.0;
    return 0.0;
  }
  if (kind === 2) {
    const s = 1.0 / (1.0 + Math.exp(-z));
    return s * (1.0 - s);
  }
  throw new Error(`[mlp-activation] 모르는 활성화 종류: ${kind}`);
}

function checkKind(kind: number): void {
  if (kind !== 0 && kind !== 1 && kind !== 2) throw new Error(`[mlp-activation] 모르는 활성화 종류: ${kind}`);
}

/**
 * IR `mlpTrain` 과 한 줄씩 같은 셈. 버퍼(wa · wb · bs · vs · cs · ds · stats)를 제자리에서 고친다.
 * epochs 번 에폭을 돈 뒤 맞힌 수를 돌려주고 stats[0] 에 평균 교차 엔트로피를 둔다.
 * IR 은 모르는 종류에 −1 을 돌려주고, 이쪽은 던진다.
 */
export function mlpTrain(
  kind: number,
  xs1: number[],
  xs2: number[],
  ys: number[],
  wa: number[],
  wb: number[],
  bs: number[],
  vs: number[],
  cs: number[],
  ds: number[],
  stats: number[],
  epochs: number,
  lr: number,
): number {
  checkKind(kind);
  const n = ys.length;
  const hN = vs.length;
  const nn = n;
  for (let ep = 0; ep < epochs; ep += 1) {
    // (1) 앞먹임 — 점마다 d = σ(o) − y
    for (let i = 0; i < n; i += 1) {
      let o = cs[0];
      for (let j = 0; j < hN; j += 1) {
        const z = wa[j] * xs1[i] + wb[j] * xs2[i] + bs[j];
        o = o + vs[j] * activate(kind, z);
      }
      const p = 1.0 / (1.0 + Math.exp(-o));
      ds[i] = p - ys[i];
    }
    // (2) 단위마다 기울기를 모아 그 단위를 갱신
    for (let j = 0; j < hN; j += 1) {
      let ga = 0.0;
      let gb = 0.0;
      let gbias = 0.0;
      let gv = 0.0;
      for (let i = 0; i < n; i += 1) {
        const z = wa[j] * xs1[i] + wb[j] * xs2[i] + bs[j];
        const h = activate(kind, z);
        const dh = slope(kind, z);
        gv = gv + ds[i] * h;
        const dz = ds[i] * vs[j] * dh;
        ga = ga + dz * xs1[i];
        gb = gb + dz * xs2[i];
        gbias = gbias + dz;
      }
      wa[j] = wa[j] - (lr * ga) / nn;
      wb[j] = wb[j] - (lr * gb) / nn;
      bs[j] = bs[j] - (lr * gbias) / nn;
      vs[j] = vs[j] - (lr * gv) / nn;
    }
    // (3) 출력 치우침
    let gc = 0.0;
    for (let i = 0; i < n; i += 1) gc = gc + ds[i];
    cs[0] = cs[0] - (lr * gc) / nn;
  }
  // 맞힌 수와 손실
  let right = 0;
  let loss = 0.0;
  for (let i = 0; i < n; i += 1) {
    let o = cs[0];
    for (let j = 0; j < hN; j += 1) {
      const z = wa[j] * xs1[i] + wb[j] * xs2[i] + bs[j];
      o = o + vs[j] * activate(kind, z);
    }
    const p = 1.0 / (1.0 + Math.exp(-o));
    if (ys[i] === 1) loss = loss - Math.log(p);
    else loss = loss - Math.log(1.0 - p);
    let guess = 0;
    if (o > 0) guess = 1;
    if (guess === ys[i]) right += 1;
  }
  stats[0] = loss / nn;
  return right;
}

// ── 화면 값 — IR 이 셈하지 않는 것 (격자 · 단위 선 · 곡선 · 눈금) ────────────────

/** 망의 출력 o — mlpTrain 의 앞먹임과 같은 차례. */
export function outputAt(kind: number, wa: number[], wb: number[], bs: number[], vs: number[], c: number, x1: number, x2: number): number {
  let o = c;
  for (let j = 0; j < vs.length; j += 1) {
    const z = wa[j] * x1 + wb[j] * x2 + bs[j];
    o = o + vs[j] * activate(kind, z);
  }
  return o;
}

/** 경계 격자 — (steps+1)² 개의 o. x2 가 바깥 · x1 이 안쪽, 둘 다 lo → hi. */
export function boundaryGrid(
  kind: number, wa: number[], wb: number[], bs: number[], vs: number[], c: number, lo: number, hi: number, steps: number,
): number[] {
  const out: number[] = [];
  for (let gy = 0; gy <= steps; gy += 1) {
    const x2 = lo + ((hi - lo) * gy) / steps;
    for (let gx = 0; gx <= steps; gx += 1) {
      const x1 = lo + ((hi - lo) * gx) / steps;
      out.push(outputAt(kind, wa, wb, bs, vs, c, x1, x2));
    }
  }
  return out;
}

/** 점마다 맞았는가 — mlpTrain 의 맞힘 판정과 같은 규칙 (o > 0 이면 1). */
export function correctness(kind: number, wa: number[], wb: number[], bs: number[], vs: number[], c: number, points: MlpActivationPoint[]): boolean[] {
  return points.map((q) => (outputAt(kind, wa, wb, bs, vs, c, q.x1, q.x2) > 0 ? 1 : 0) === q.y);
}

/** 직선 a·x1 + b·x2 + c = 0 을 정사각 [lo, hi]² 로 자른 두 끝. 평면을 지나지 않으면 null. */
export function clipLine(a: number, b: number, c: number, lo: number, hi: number): number[] | null {
  const pts: number[][] = [];
  const add = (x1: number, x2: number): void => {
    if (x1 < lo - 1e-9 || x1 > hi + 1e-9 || x2 < lo - 1e-9 || x2 > hi + 1e-9) return;
    for (const p of pts) if (Math.abs(p[0] - x1) < 1e-9 && Math.abs(p[1] - x2) < 1e-9) return;
    pts.push([x1, x2]);
  };
  if (Math.abs(b) > 1e-12) {
    add(lo, -(a * lo + c) / b);
    add(hi, -(a * hi + c) / b);
  }
  if (Math.abs(a) > 1e-12) {
    add(-(b * lo + c) / a, lo);
    add(-(b * hi + c) / a, hi);
  }
  if (pts.length < 2) return null;
  return [pts[0][0], pts[0][1], pts[1][0], pts[1][1]];
}

/** 활성화 곡선 표본 — z 는 [lo, hi] 를 고르게 n 개. */
export function curveSamples(kind: number, lo: number, hi: number, n: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k += 1) out.push(activate(kind, lo + ((hi - lo) * k) / (n - 1)));
  return out;
}

/** 평면 눈금 — lo … hi 의 정수. */
export function planeTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(lo); v <= Math.floor(hi); v += 1) out.push(v);
  return out;
}

/** init 이벤트의 payload — 판과 무관한 자리 */
export type MlpActivationLayout = {
  plane: number[];
  planeTicks: number[];
  gridSteps: number;
  snapshots: number[];
  lossTicks: number[];
  lossTop: number;
  curveRange: number[];
  curveSamples: number;
  points: MlpActivationPoint[];
  maxWidth: number;
};

/** snapshot 이벤트의 payload — 한 걸음 */
export type MlpActivationFrame = {
  step: number;
  epoch: number;
  kind: number;
  width: number;
  grid: number[];
  correct: boolean[];
  right: number;
  total: number;
  loss: number;
  losses: number[];
  units: (number[] | null)[];
  curve: number[];
};

export type MlpRoundSnapshot = {
  epoch: number;
  right: number;
  loss: number;
  grid: number[];
  correct: boolean[];
  units: (number[] | null)[];
};

/** 판 하나 — 스냅샷마다 mlpTrain 을 이어 부른다. 알고리즘 · 눈금 · 테스트가 함께 쓴다. */
export function runRound(data: MlpActivationData, kind: number, width: number): MlpRoundSnapshot[] {
  checkKind(kind);
  if (!data.widths.includes(width) || width > data.units.length) throw new Error(`[mlp-activation] 사다리 밖의 폭: ${width}`);
  const pts = data.points;
  const xs1 = pts.map((q) => q.x1);
  const xs2 = pts.map((q) => q.x2);
  const ys = pts.map((q) => q.y);
  const first = data.units.slice(0, width);
  const wa = first.map((u) => u.wa);
  const wb = first.map((u) => u.wb);
  const bs = first.map((u) => u.b);
  const vs = first.map((u) => u.v);
  const cs = [data.c0];
  const ds = pts.map(() => 0.0);
  const stats = [0.0];
  const [lo, hi] = data.plane;
  const out: MlpRoundSnapshot[] = [];
  let prev = 0;
  for (const e of data.snapshots) {
    const right = mlpTrain(kind, xs1, xs2, ys, wa, wb, bs, vs, cs, ds, stats, e - prev, data.lr);
    prev = e;
    out.push({
      epoch: e,
      right,
      loss: stats[0],
      grid: boundaryGrid(kind, wa, wb, bs, vs, cs[0], lo, hi, data.gridSteps),
      correct: correctness(kind, wa, wb, bs, vs, cs[0], pts),
      units: first.map((_, j) => clipLine(wa[j], wb[j], bs[j], lo, hi)),
    });
  }
  return out;
}

/** 손실 축 — 아홉 칸 · 스냅샷 전부의 가장 큰 손실을 덮는 0.3 간격 눈금. 판 사이에 축이 바뀌지 않게 사다리 전체로 고정한다. */
export function lossTicks(data: MlpActivationData): number[] {
  let top = 0;
  for (let k = 0; k < data.kinds.length; k += 1) {
    for (const w of data.widths) {
      for (const s of runRound(data, k, w)) if (s.loss > top) top = s.loss;
    }
  }
  const ticks: number[] = [0];
  let m = 0;
  while (ticks[ticks.length - 1] < top) {
    m += 1;
    ticks.push((m * 3) / 10);
  }
  return ticks;
}

// ── 알고리즘 ───────────────────────────────────────────────────────────────────

export async function mlpActivationAlgorithm(context: FacetContext<MlpActivationData>): Promise<void> {
  const ctx = context as ReactiveContext<MlpActivationData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  const shown = { epochs: 0, correct: 0 };
  const metricTo = (name: 'epochs' | 'correct', value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };

  let kind = data.defaultKind;
  let width = data.defaultWidth;
  if (kind < 0 || kind >= data.kinds.length) throw new Error(`[mlp-activation] 기본 활성화가 사다리 밖이다: ${kind}`);
  if (!data.widths.includes(width)) throw new Error(`[mlp-activation] 기본 폭이 사다리 밖이다: ${width}`);
  const [lo, hi] = data.plane;
  const [clo, chi] = data.curveRange;
  const ticks = lossTicks(data);

  const playRound = async (): Promise<boolean> => {
    const snaps = runRound(data, kind, width);
    const curve = curveSamples(kind, clo, chi, data.curveSamples);
    const losses: number[] = [];
    for (let k = 0; k < snaps.length; k += 1) {
      if (ctx.cancelled) return false;
      const s = snaps[k];
      if (k === 0) await phase('count');
      else await phase('train');
      losses.push(s.loss);
      metricTo('epochs', s.epoch);
      metricTo('correct', s.right);
      const frame: MlpActivationFrame = {
          step: k,
          epoch: s.epoch,
          kind,
          width,
          grid: s.grid,
          correct: s.correct,
          right: s.right,
          total: data.points.length,
          loss: s.loss,
          losses: [...losses],
          units: s.units,
          curve,
      };
      await ctx.emit({ type: 'snapshot', payload: frame });
      if (!(await ctx.sleep(data.stepMs))) return false;
    }
    return true;
  };

  try {
    const layout: MlpActivationLayout = {
        plane: [lo, hi],
        planeTicks: planeTicks(lo, hi),
        gridSteps: data.gridSteps,
        snapshots: [...data.snapshots],
        lossTicks: ticks,
        lossTop: ticks[ticks.length - 1],
        curveRange: [clo, chi],
        curveSamples: data.curveSamples,
        points: data.points.map((q) => ({ id: q.id, x1: q.x1, x2: q.x2, y: q.y })),
        maxWidth: Math.max(...data.widths),
    };
    await ctx.emit({ type: 'init', payload: layout, silent: true });
    while (!ctx.cancelled) {
      if (!(await playRound())) return;
      let taken = false;
      while (!taken) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload as { value?: unknown } | undefined;
        const value = p?.value;
        if (typeof value !== 'number') continue;
        if (input.type === 'activation') {
          if (!Number.isInteger(value) || value < 0 || value >= data.kinds.length) continue;
          kind = value;
          taken = true;
        } else if (input.type === 'width') {
          if (!data.widths.includes(value)) continue;
          width = value;
          taken = true;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
