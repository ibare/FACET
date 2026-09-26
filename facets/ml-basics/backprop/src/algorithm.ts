/**
 * backprop — 역전파는 왜 그 길인가.
 *
 * 입력 둘 · 은닉 ReLU 단위 H · 출력 하나(활성화 · 치우침 없음)인 망에서 무게 3H 개 모두의
 * 기울기 ∂L/∂w 를 두 길로 얻는다.
 *   - 역전파: 앞먹임 한 번 + 뒤로 한 번 (곱셈 7H)
 *   - 밀어 보기(앞 차분): 기준 앞먹임 한 번 + 무게마다 ε 만큼 밀어 앞먹임 한 번 (곱셈 3H(1 + 3H))
 * 그리고 무게마다 두 값의 어긋남 |n − g| 의 가장 큰 값을 본다.
 *
 * 셈은 IR(`irs.ts`) 의 네 함수와 한 줄씩 같다 — `gradientGap` · `backpropGrads` · `nudgeGrads` · `lossAt`.
 * 알고리즘은 이 함수들을 TS 로 한 번 돌리며 갈고리로 걸음의 값을 모은 뒤 걸음마다 내보낸다.
 * IR 이 셈하지 않는 화면 값(단위의 z · h · 켜짐, 표지의 자리 n − g, 가장 큰 어긋남의 자리, 배,
 * 막대 눈금 · 어긋남 눈금)만 여기서 따로 셈한다.
 *
 * 규약
 *   z_j = wa_j·x1 + wb_j·x2 · h_j = z_j (z_j > 0), 0 · ŷ = Σ w2_j·h_j · L = ½(ŷ − y)²
 *   d = ŷ − y · 켜진 단위 g2_j = d·z_j, δ_j = w2_j·d · 꺼진 단위 g2_j = 0, δ_j = 0 (분기로 0 을 넣는다 —
 *   d·0 은 d < 0 이면 −0 이 된다) · ga_j = δ_j·x1 · gb_j = δ_j·x2
 *   밀어 보기: 무게를 old + ε 로 두고 (L − L0) / ε, 그리고 적어 둔 old 로 되돌린다. 차례는 w2 → wa → wb.
 *   곱셈은 밀집 셈의 자리로 센다 — 앞먹임 한 번 단위마다 3, 뒤로 단위마다 4, 꺼진 단위도 센다.
 *   가장 큰 어긋남의 자리: 단위 차례대로, 한 단위 안에서 w2 · wa · wb 차례로 보아 **더 클 때만** 바꾼다
 *   (IR 의 `if dd > gap` 과 같다 — 같으면 앞의 것). 이 데이터의 모든 손잡이 조합에서 가장 큰 값과
 *   정확히 같은 어긋남은 따로 없다 (test 가 센다).
 *
 * 이벤트 (silent 아닌 것이 걸음이다 — 판 하나 7 걸음):
 *   - `phase`          { phase: 'forward' | 'backward' | 'nudge' | 'compare' }            silent
 *   - `net-drawn`      #0 { width, nudge, weightCount, x1, x2, y, barMax, gapScale,
 *                           units: { id, wa, wb, w2 }[] }
 *   - `forward-done`   #1 { units: { z, h, on }[], yHat, loss, backpropMults }
 *   - `backward-done`  #2 { d, grads: { wa, wb, w2 }[], backpropMults }
 *   - `nudge-done`     #3 · #4 · #5 { weight: 'w2' | 'wa' | 'wb', offsets: number[] (n − g, 단위마다), nudgeMults }
 *   - `gaps-compared`  #6 { maxGap, gapDigits, maxUnit, maxWeight, ratio, backpropMults, nudgeMults }
 *
 * phase 어휘 (irs.ts 와 같다): `forward` · `backward` · `nudge` · `compare`.
 *   #0 없음 · #1 forward · #2 backward · #3 · #4 · #5 nudge · #6 compare — 걸음 발신 바로 앞에 보낸다.
 *
 * 계기 (지금까지의 곱셈 — 판 머리에 0 으로 되돌린다):
 *   - `backprop-mults` · `nudge-mults`
 *
 * 손잡이: `width` (은닉 폭 3 · 6 · 12 · 24) · `nudge` (밀어 볼 폭 ε 0.1 · 0.01 · 0.001) — 값 그대로.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BackpropData = {
  type: 'backprop';
  stepMs: number;
  /** 무대 운동 길이 (재생 속도 1 에서). 걸음 = 운동 + stepMs 로 센다 */
  motionMs: number;
  x1: number;
  x2: number;
  y: number;
  /** 은닉 단위 스물넷의 무게 — 폭 H 는 앞의 H */
  wa: number[];
  wb: number[];
  w2: number[];
  /** 손잡이 사다리 (segments[].value 와 같다) */
  widths: number[];
  nudges: number[];
  /** 기본값 */
  width: number;
  nudge: number;
};

export type WeightKind = 'w2' | 'wa' | 'wb';

/** 갈고리 — 셈은 바꾸지 않고 걸음의 값만 모은다 */
export type BackpropHooks = {
  unit?(j: number, z: number, h: number): void;
  forwardDone?(yHat: number, cnt: readonly number[]): void;
  nudgeDone?(kind: WeightKind, cnt: readonly number[]): void;
  baseLoss?(l0: number): void;
};

/** IR `lossAt` — 앞먹임 한 번의 손실. 곱셈을 cnt[which] 에 센다 */
export function lossAt(
  wa: number[], wb: number[], w2: number[], x1: number, x2: number, y: number,
  cnt: number[], which: number,
): number {
  let yh = 0.0;
  for (let j = 0; j < w2.length; j++) {
    const z = wa[j]! * x1 + wb[j]! * x2;
    let h = 0.0;
    if (z > 0) h = z;
    yh = yh + w2[j]! * h;
    cnt[which] = cnt[which]! + 3;
  }
  return 0.5 * (yh - y) * (yh - y);
}

/** IR `backpropGrads` — 앞먹임 한 번 · 뒤로 한 번. ŷ 를 돌려준다 */
export function backpropGrads(
  wa: number[], wb: number[], w2: number[], x1: number, x2: number, y: number,
  ga: number[], gb: number[], g2: number[], cnt: number[], hooks?: BackpropHooks,
): number {
  let yh = 0.0;
  for (let j = 0; j < w2.length; j++) {
    const z = wa[j]! * x1 + wb[j]! * x2;
    let h = 0.0;
    if (z > 0) h = z;
    yh = yh + w2[j]! * h;
    cnt[0] = cnt[0]! + 3;
    hooks?.unit?.(j, z, h);
  }
  hooks?.forwardDone?.(yh, cnt);
  const d = yh - y;
  for (let j = 0; j < w2.length; j++) {
    const z = wa[j]! * x1 + wb[j]! * x2;
    let delta = 0.0;
    if (z > 0) {
      g2[j] = d * z;
      delta = w2[j]! * d;
    } else {
      g2[j] = 0.0;
      delta = 0.0;
    }
    ga[j] = delta * x1;
    gb[j] = delta * x2;
    cnt[0] = cnt[0]! + 4;
  }
  return yh;
}

/** IR `nudgeGrads` — 기준 손실 한 번 · 무게마다 밀어 앞먹임 한 번 (앞 차분). L0 을 돌려준다 */
export function nudgeGrads(
  wa: number[], wb: number[], w2: number[], x1: number, x2: number, y: number, eps: number,
  na: number[], nb: number[], n2: number[], cnt: number[], hooks?: BackpropHooks,
): number {
  const l0 = lossAt(wa, wb, w2, x1, x2, y, cnt, 1);
  hooks?.baseLoss?.(l0);
  for (let j = 0; j < w2.length; j++) {
    const old = w2[j]!;
    w2[j] = old + eps;
    n2[j] = (lossAt(wa, wb, w2, x1, x2, y, cnt, 1) - l0) / eps;
    w2[j] = old;
  }
  hooks?.nudgeDone?.('w2', cnt);
  for (let j = 0; j < w2.length; j++) {
    const old = wa[j]!;
    wa[j] = old + eps;
    na[j] = (lossAt(wa, wb, w2, x1, x2, y, cnt, 1) - l0) / eps;
    wa[j] = old;
  }
  hooks?.nudgeDone?.('wa', cnt);
  for (let j = 0; j < w2.length; j++) {
    const old = wb[j]!;
    wb[j] = old + eps;
    nb[j] = (lossAt(wa, wb, w2, x1, x2, y, cnt, 1) - l0) / eps;
    wb[j] = old;
  }
  hooks?.nudgeDone?.('wb', cnt);
  return l0;
}

/** IR 진입 `gradientGap` — 두 길로 기울기를 얻고 가장 큰 어긋남을 돌려준다 */
export function gradientGap(
  wa: number[], wb: number[], w2: number[], x1: number, x2: number, y: number, eps: number,
  ga: number[], gb: number[], g2: number[], na: number[], nb: number[], n2: number[], cnt: number[],
  hooks?: BackpropHooks,
): number {
  cnt[0] = 0;
  cnt[1] = 0;
  backpropGrads(wa, wb, w2, x1, x2, y, ga, gb, g2, cnt, hooks);
  nudgeGrads(wa, wb, w2, x1, x2, y, eps, na, nb, n2, cnt, hooks);
  let gap = 0.0;
  for (let j = 0; j < w2.length; j++) {
    let dd = Math.abs(n2[j]! - g2[j]!);
    if (dd > gap) gap = dd;
    dd = Math.abs(na[j]! - ga[j]!);
    if (dd > gap) gap = dd;
    dd = Math.abs(nb[j]! - gb[j]!);
    if (dd > gap) gap = dd;
  }
  return gap;
}

// ── 한 판의 셈 ─────────────────────────────────────────────────────────────

export type RoundUnit = { id: string; wa: number; wb: number; w2: number };

export type BackpropRound = {
  width: number;
  nudge: number;
  units: RoundUnit[];
  z: number[];
  h: number[];
  on: boolean[];
  yHat: number;
  loss: number;
  d: number;
  /** 역전파 기울기 (단위마다) */
  ga: number[];
  gb: number[];
  g2: number[];
  /** 밀어 본 기울기 (단위마다) */
  na: number[];
  nb: number[];
  n2: number[];
  /** 걸음별 곱셈 수 */
  bpAfterForward: number;
  bpMults: number;
  nudgeAfter: Record<WeightKind, number>;
  nudgeMults: number;
  maxGap: number;
  maxUnit: number;
  maxWeight: WeightKind;
  /** 가장 큰 어긋남과 정확히 같은 어긋남이 몇 곳 더 있는가 (동률 세기) */
  maxTies: number;
  ratio: number;
  gapDigits: number;
};

export const WEIGHT_KINDS: readonly WeightKind[] = ['w2', 'wa', 'wb'];

/** 단위 식별자 — 1 부터 */
export function unitId(j: number): string {
  return `h${j + 1}`;
}

/** 가장 큰 어긋남의 표시 자리 — 유효 숫자 셋 (ε 0.1 → 넷째 · 0.01 → 다섯째 · 0.001 → 여섯째) */
export function gapDigitsFor(eps: number): number {
  if (!(eps > 0)) throw new Error(`backprop: ε 는 양수여야 한다 (${eps})`);
  return Math.round(-Math.log10(eps)) + 3;
}

/**
 * 폭 H · ε 로 한 판을 셈한다. `order` 는 단위 차례 (섞은 차례로 돌려 볼 때) — 없으면 0 … H−1.
 */
export function computeRound(data: BackpropData, width: number, eps: number, order?: number[]): BackpropRound {
  if (!data.widths.includes(width)) throw new Error(`backprop: 사다리 밖의 폭 ${width}`);
  if (!data.nudges.includes(eps)) throw new Error(`backprop: 사다리 밖의 ε ${eps}`);
  if (width > data.w2.length || data.wa.length !== data.w2.length || data.wb.length !== data.w2.length) {
    throw new Error('backprop: 단위 무게의 길이가 폭과 맞지 않는다');
  }
  const idx = order ?? Array.from({ length: width }, (_, j) => j);
  if (idx.length !== width) throw new Error('backprop: 차례의 길이가 폭과 다르다');
  const wa = idx.map((i) => data.wa[i]!);
  const wb = idx.map((i) => data.wb[i]!);
  const w2 = idx.map((i) => data.w2[i]!);
  const units: RoundUnit[] = idx.map((i, j) => ({ id: unitId(i), wa: wa[j]!, wb: wb[j]!, w2: w2[j]! }));
  const ga = new Array<number>(width).fill(0);
  const gb = new Array<number>(width).fill(0);
  const g2 = new Array<number>(width).fill(0);
  const na = new Array<number>(width).fill(0);
  const nb = new Array<number>(width).fill(0);
  const n2 = new Array<number>(width).fill(0);
  const cnt = [0, 0];

  const z = new Array<number>(width).fill(0);
  const h = new Array<number>(width).fill(0);
  let yHat = Number.NaN;
  let bpAfterForward = -1;
  let loss = Number.NaN;
  const nudgeAfter: Record<WeightKind, number> = { w2: -1, wa: -1, wb: -1 };

  const maxGap = gradientGap(wa, wb, w2, data.x1, data.x2, data.y, eps, ga, gb, g2, na, nb, n2, cnt, {
    unit(j, zj, hj) {
      z[j] = zj;
      h[j] = hj;
    },
    forwardDone(yh, c) {
      yHat = yh;
      bpAfterForward = c[0]!;
    },
    baseLoss(l0) {
      loss = l0;
    },
    nudgeDone(kind, c) {
      nudgeAfter[kind] = c[1]!;
    },
  });
  if (!Number.isFinite(yHat) || !Number.isFinite(loss) || bpAfterForward < 0 || nudgeAfter.wb < 0) {
    throw new Error('backprop: 갈고리가 걸음 값을 모으지 못했다');
  }
  for (let j = 0; j < width; j++) {
    if (wa[j] !== units[j]!.wa || wb[j] !== units[j]!.wb || w2[j] !== units[j]!.w2) {
      throw new Error('backprop: 밀어 본 뒤 무게가 제자리로 돌아오지 않았다');
    }
  }

  // 가장 큰 어긋남의 자리 — IR 과 같은 차례 · 같은 견줌 (더 클 때만 바꾼다)
  const grads: Record<WeightKind, [number[], number[]]> = { w2: [n2, g2], wa: [na, ga], wb: [nb, gb] };
  let best = 0.0;
  let maxUnit = -1;
  let maxWeight: WeightKind = 'w2';
  for (let j = 0; j < width; j++) {
    for (const k of WEIGHT_KINDS) {
      const [n, g] = grads[k];
      const dd = Math.abs(n[j]! - g[j]!);
      if (dd > best) {
        best = dd;
        maxUnit = j;
        maxWeight = k;
      }
    }
  }
  if (maxUnit < 0 || best !== maxGap) throw new Error('backprop: 가장 큰 어긋남의 자리를 찾지 못했다');
  let maxTies = 0;
  for (let j = 0; j < width; j++) {
    for (const k of WEIGHT_KINDS) {
      const [n, g] = grads[k];
      if ((j !== maxUnit || k !== maxWeight) && Math.abs(n[j]! - g[j]!) === best) maxTies++;
    }
  }

  return {
    width,
    nudge: eps,
    units,
    z,
    h,
    on: z.map((v) => v > 0),
    yHat,
    loss,
    d: yHat - data.y,
    ga, gb, g2, na, nb, n2,
    bpAfterForward,
    bpMults: cnt[0]!,
    nudgeAfter,
    nudgeMults: cnt[1]!,
    maxGap,
    maxUnit,
    maxWeight,
    maxTies,
    ratio: cnt[1]! / cnt[0]!,
    gapDigits: gapDigitsFor(eps),
  };
}

/** 사다리 전체로 고정한 눈금 — 막대 끝(가장 큰 곱셈 수)과 어긋남 눈금(가장 큰 어긋남을 한 자리로 올림) */
export function ladderScales(data: BackpropData): { barMax: number; gapScale: number } {
  let barMax = 0;
  let gapMax = 0;
  for (const w of data.widths) {
    for (const e of data.nudges) {
      const r = computeRound(data, w, e);
      barMax = Math.max(barMax, r.bpMults, r.nudgeMults);
      gapMax = Math.max(gapMax, r.maxGap);
    }
  }
  if (!(barMax > 0) || !(gapMax > 0)) throw new Error('backprop: 눈금을 셈할 수 없다');
  const unit = 10 ** Math.floor(Math.log10(gapMax));
  return { barMax, gapScale: Math.ceil(gapMax / unit) * unit };
}

// ── 알고리즘 ───────────────────────────────────────────────────────────────

export async function backpropAlgorithm(ctx: FacetContext<BackpropData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BackpropData>;
  const data = ctx.data;
  if (data.type !== 'backprop') throw new Error(`backprop: 모르는 자료 ${String(data.type)}`);
  const { barMax, gapScale } = ladderScales(data);
  let width = data.width;
  let nudge = data.nudge;

  const held = { 'backprop-mults': 0, 'nudge-mults': 0 };
  const meter = (name: 'backprop-mults' | 'nudge-mults', value: number): void => {
    ctx.metric(name, value - held[name]);
    held[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRound = async (): Promise<boolean> => {
    const r = computeRound(data, width, nudge);

    // #0 망
    meter('backprop-mults', 0);
    meter('nudge-mults', 0);
    await ctx.emit({
      type: 'net-drawn',
      payload: {
        width, nudge, weightCount: 3 * width,
        x1: data.x1, x2: data.x2, y: data.y,
        barMax, gapScale,
        units: r.units.map((u) => ({ ...u })),
      },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // #1 앞먹임
    await phase('forward');
    meter('backprop-mults', r.bpAfterForward);
    await ctx.emit({
      type: 'forward-done',
      payload: {
        units: r.z.map((z, j) => ({ z, h: r.h[j]!, on: r.on[j]! })),
        yHat: r.yHat, loss: r.loss, backpropMults: r.bpAfterForward,
      },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // #2 뒤로
    await phase('backward');
    meter('backprop-mults', r.bpMults);
    await ctx.emit({
      type: 'backward-done',
      payload: {
        d: r.d,
        grads: r.ga.map((a, j) => ({ wa: a, wb: r.gb[j]!, w2: r.g2[j]! })),
        backpropMults: r.bpMults,
      },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // #3 · #4 · #5 밀어 보기 — 표지의 자리 n − g 는 화면 값이다
    const pairs: Record<WeightKind, [number[], number[]]> = { w2: [r.n2, r.g2], wa: [r.na, r.ga], wb: [r.nb, r.gb] };
    for (const k of WEIGHT_KINDS) {
      if (ctx.cancelled) return false;
      const [n, g] = pairs[k];
      await phase('nudge');
      meter('nudge-mults', r.nudgeAfter[k]);
      await ctx.emit({
        type: 'nudge-done',
        payload: { weight: k, offsets: n.map((v, j) => v - g[j]!), nudgeMults: r.nudgeAfter[k] },
      });
      if (!(await rctx.sleep(data.stepMs))) return false;
    }

    // #6 견줌
    await phase('compare');
    await ctx.emit({
      type: 'gaps-compared',
      payload: {
        maxGap: r.maxGap, gapDigits: r.gapDigits, maxUnit: r.maxUnit, maxWeight: r.maxWeight,
        ratio: r.ratio, backpropMults: r.bpMults, nudgeMults: r.nudgeMults,
      },
    });
    return rctx.sleep(data.stepMs);
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null && 'value' in p ? (p as { value: unknown }).value : undefined;
        if (typeof value !== 'number') continue;
        if (input.type === 'width' && data.widths.includes(value)) {
          width = value;
          break;
        }
        if (input.type === 'nudge' && data.nudges.includes(value)) {
          nudge = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
