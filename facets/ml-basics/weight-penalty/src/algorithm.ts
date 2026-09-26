/**
 * weight-penalty — 같은 세기의 L1 · L2 벌점이 무게 여섯을 어떻게 다르게 줄이는가.
 *
 * 모형은 특징이 서로 겹치지 않는 선형 회귀로 줄였다 — 데이터 손실 ½·Σ(wᵢ − aᵢ)², a 는 벌점 없이 맞춘 무게이자
 * 시작 무게다. 벌점을 더해 경사 하강을 `updates` 번 한다.
 *
 *   L1 (λ·Σ|wᵢ|) — 두 마디: h = w − η·(w − a) ; h > ηλ 면 w ← h − ηλ, h < −ηλ 면 w ← h + ηλ, 아니면 w ← 0 (부호 없는 0)
 *   L2 ((λ/2)·Σwᵢ²) — 한 줄: w ← w − η·(w − a) − η·λ·w   (L2 몫은 갱신 앞 w, JS 차례 그대로)
 *
 * ηλ 는 `eta * lam` 로 한 번 셈한다. `sign()` 을 쓰지 않는다 (`sign(h)·0` 은 −0).
 * "0 인 무게" = 값이 정확히 0 인 무게 (L1 은 0 을 대입하므로 정확하다).
 *
 * 동률 — |h| 와 ηλ 의 차가 1e−9 이하이면 어느 갈래로 갈지 실수 오차가 정하므로 **던진다**. 이 데이터의 모든 조합 ·
 * 모든 갱신에서 차는 1e−9 보다 크다 (test 가 전수로 센다 — 걸리는 자리 0).
 *
 * 짜임 (reactive): 한 판을 끝까지 재생 → `waitForInput` → 받은 값으로 처음부터 다시 재생.
 * 손잡이 둘 — 알고리즘이 다른 손잡이의 지금 값을 스스로 쥐고, payload 에서는 제 action 의 `value` 만 믿는다.
 *
 * 이벤트 (한 판 = 걸음 12: 걸음 0 = start · 걸음 1 ~ 10 = update · 걸음 11 = count)
 *   init   silent — 맨 처음 한 번. { ids: string[]; start: number[]; extent: number; updates: number; total: number;
 *                   ratioSymbol: string }
 *                   extent = max|aᵢ| (무대의 가로 축 범위 — 무대가 셈하지 않는다)
 *   start  { penalty: 'L1' | 'L2'; lam: number; eta: number; etaLam: number; formula: string;
 *            weights: number[] (= a) ; zeroCount: 0 }
 *   update { index: number (1 부터); penalty; lam; etaLam;
 *            h: number[] | null (L1 의 데이터 걸음 값, L2 는 null);
 *            weights: number[] (이 갱신 뒤); ratios: number[] (wᵢ / aᵢ, 0 인 무게는 0);
 *            sameRatio: boolean (여섯 비가 1e−12 안으로 같은가);
 *            newlyZero: number[] (이 갱신에 새로 0 에 닿은 무게의 색인, 0 부터);
 *            pinnedAt: (number | null)[] (무게마다 0 에 닿은 갱신 번호, 안 닿았으면 null);
 *            zeroCount: number }
 *   count  { penalty; lam; zeroCount: number; total: number }
 *   phase  silent — { phase: 'l1-update' | 'l1-zero' | 'l2-update' | 'count' }
 *
 * phase 어휘 (irs.ts 와 정확히 같다)
 *   l1-update  L1 의 데이터 걸음 · 두 끌기 갈래 — 이 갱신에 새로 0 에 닿은 무게가 없을 때
 *   l1-zero    L1 의 w ← 0 갈래 — 이 갱신에 새로 0 에 닿은 무게가 있을 때
 *   l2-update  L2 한 줄
 *   count      0 인 무게 세기
 *   걸음 0 에는 phase 를 보내지 않는다 — projector 가 start 에서 코드 패널을 끈다 (`highlightPhase(null)`).
 *
 * 계기
 *   zero-weights — 지금 0 인 무게 수. 지금 값을 들고 차이만 보낸다 · 판 머리에서 0 으로 · 첫 판에 차이 0 이어도 싣는다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WeightPenaltyData = {
  type: 'weight-penalty';
  stepMs: number;
  /** 무게 식별자 — 화면에 그대로 뜨는 기호 (w1 ~ w6) */
  weightIds: string[];
  /** 벌점 없이 맞춘 무게 = 시작 무게 a */
  start: number[];
  eta: number;
  updates: number;
  /** 벌점 손잡이 사다리 — 색인 = segments[].value = IR 의 kind */
  penaltyLadder: string[];
  /** 벌점 세기 λ 손잡이 사다리 — segments[].value 와 같다 */
  strengthLadder: number[];
  defaultPenalty: number;
  defaultStrength: number;
  /** 갱신 식 — 벌점 사다리와 같은 차례. 번역하지 않는 자료 */
  formulas: string[];
  /** 비의 기호 (w / a) — 번역하지 않는 자료 */
  ratioSymbol: string;
};

export type PenaltyUpdate = {
  index: number;
  h: number[] | null;
  weights: number[];
  ratios: number[];
  sameRatio: boolean;
  newlyZero: number[];
  pinnedAt: (number | null)[];
  zeroCount: number;
};

/** |h| 와 ηλ 가 이만큼 가까우면 동률로 보고 던진다. */
const TIE_EPS = 1e-9;
/** L2 의 "같은 비율" 판정 폭 (sim 이 단언한 폭). */
const RATIO_EPS = 1e-12;

/** 벌점 식별자 → IR 의 kind (L1 = 0 · L2 = 1). 모르는 식별자는 던진다. */
export function penaltyCode(id: string): number {
  if (id === 'L1') return 0;
  if (id === 'L2') return 1;
  throw new Error(`weight-penalty: 모르는 벌점 '${id}'`);
}

/** 정확히 0 인 무게 수. */
export function countZeros(w: readonly number[]): number {
  let z = 0;
  for (let i = 0; i < w.length; i += 1) {
    if (w[i] === 0) z += 1;
  }
  return z;
}

/**
 * 갱신 `updates` 번의 자취. `kind` 는 IR 과 같은 수(0 = L1 · 1 = L2) — 그 밖은 던진다 (IR 은 −1).
 * 셈의 차례는 IR `penalize` 와 같다 — 끝 w 가 전 정밀도로 같다.
 */
export function penaltyTrace(
  start: readonly number[],
  kind: number,
  lam: number,
  eta: number,
  updates: number,
): PenaltyUpdate[] {
  if (kind !== 0 && kind !== 1) throw new Error(`weight-penalty: 모르는 벌점 종류 ${kind}`);
  const n = start.length;
  for (let i = 0; i < n; i += 1) {
    if (start[i] === 0) throw new Error('weight-penalty: 시작 무게에 0 이 있어 비 w/a 를 셀 수 없다');
  }
  const el = eta * lam;
  const w = start.slice();
  const pinnedAt: (number | null)[] = start.map(() => null);
  const out: PenaltyUpdate[] = [];
  for (let s = 1; s <= updates; s += 1) {
    const hs: number[] = [];
    const newlyZero: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = start[i];
      if (kind === 0) {
        const wasZero = w[i] === 0;
        const h = w[i] - eta * (w[i] - a);
        if (Math.abs(Math.abs(h) - el) <= TIE_EPS) {
          throw new Error(`weight-penalty: 동률 — 갱신 ${s} 의 w${i + 1} 에서 |h| 와 ηλ 가 같다`);
        }
        hs.push(h);
        if (h > el) w[i] = h - el;
        else if (h < -el) w[i] = h + el;
        else w[i] = 0;
        if (w[i] === 0 && !wasZero) {
          newlyZero.push(i);
          pinnedAt[i] = s;
        }
        if (w[i] !== 0 && wasZero) throw new Error(`weight-penalty: 0 에 닿은 w${i + 1} 이 갱신 ${s} 에서 떨어졌다`);
      } else {
        w[i] = w[i] - eta * (w[i] - a) - eta * lam * w[i];
      }
    }
    const ratios = w.map((v, i) => (v === 0 ? 0 : v / start[i]));
    let sameRatio = true;
    for (let i = 1; i < n; i += 1) {
      if (Math.abs(ratios[i] - ratios[0]) > RATIO_EPS) sameRatio = false;
    }
    out.push({
      index: s,
      h: kind === 0 ? hs : null,
      weights: w.slice(),
      ratios,
      sameRatio,
      newlyZero,
      pinnedAt: pinnedAt.slice(),
      zeroCount: countZeros(w),
    });
  }
  return out;
}

/** 무대의 가로 축 범위 — 시작 무게 가운데 가장 큰 크기. */
export function weightExtent(start: readonly number[]): number {
  let m = 0;
  for (const v of start) m = Math.max(m, Math.abs(v));
  if (m === 0) throw new Error('weight-penalty: 시작 무게가 모두 0 이다');
  return m;
}

function checkData(d: WeightPenaltyData): void {
  if (!Array.isArray(d.start) || d.start.length === 0) throw new Error('weight-penalty: start 가 비었다');
  if (!Array.isArray(d.weightIds) || d.weightIds.length !== d.start.length) {
    throw new Error('weight-penalty: weightIds 와 start 의 길이가 다르다');
  }
  if (typeof d.eta !== 'number' || typeof d.updates !== 'number' || typeof d.stepMs !== 'number') {
    throw new Error('weight-penalty: eta · updates · stepMs 가 수가 아니다');
  }
  if (d.penaltyLadder.length !== 2 || penaltyCode(d.penaltyLadder[0]) !== 0 || penaltyCode(d.penaltyLadder[1]) !== 1) {
    throw new Error('weight-penalty: penaltyLadder 는 [L1, L2] 여야 한다');
  }
  if (!Array.isArray(d.formulas) || d.formulas.length !== d.penaltyLadder.length) {
    throw new Error('weight-penalty: formulas 가 벌점 사다리와 길이가 다르다');
  }
  if (typeof d.ratioSymbol !== 'string') throw new Error('weight-penalty: ratioSymbol 이 없다');
  if (d.penaltyLadder[d.defaultPenalty] === undefined) throw new Error('weight-penalty: defaultPenalty 가 사다리 밖이다');
  if (!d.strengthLadder.includes(d.defaultStrength)) throw new Error('weight-penalty: defaultStrength 가 사다리 밖이다');
}

export async function weightPenaltyAlgorithm(base: FacetContext<WeightPenaltyData>): Promise<void> {
  const ctx = base as ReactiveContext<WeightPenaltyData>;
  const d = ctx.data;
  checkData(d);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let zeroShown = 0;
  const showZeros = (next: number) => {
    ctx.metric('zero-weights', next - zeroShown);
    zeroShown = next;
  };

  let penaltyIdx = d.defaultPenalty;
  let lam = d.defaultStrength;
  const total = d.start.length;

  try {
    await ctx.emit({
      type: 'init',
      payload: {
        ids: d.weightIds.slice(),
        start: d.start.slice(),
        extent: weightExtent(d.start),
        updates: d.updates,
        total,
        ratioSymbol: d.ratioSymbol,
      },
      silent: true,
    });

    for (;;) {
      if (ctx.cancelled) return;
      const penalty = d.penaltyLadder[penaltyIdx];
      const kind = penaltyCode(penalty);
      const etaLam = d.eta * lam;
      const trace = penaltyTrace(d.start, kind, lam, d.eta, d.updates);

      // 판 머리 — 계기를 0 으로 (첫 판은 차이 0 이어도 싣는다)
      showZeros(0);
      await ctx.emit({
        type: 'start',
        payload: { penalty, lam, eta: d.eta, etaLam, formula: d.formulas[kind], weights: d.start.slice(), zeroCount: 0 },
      });
      if (!(await ctx.sleep(d.stepMs))) return;

      for (const u of trace) {
        if (ctx.cancelled) return;
        if (kind === 0) {
          if (u.newlyZero.length > 0) await phase('l1-zero');
          else await phase('l1-update');
        } else {
          await phase('l2-update');
        }
        await ctx.emit({
          type: 'update',
          payload: {
            index: u.index,
            penalty,
            lam,
            etaLam,
            h: u.h,
            weights: u.weights,
            ratios: u.ratios,
            sameRatio: u.sameRatio,
            newlyZero: u.newlyZero,
            pinnedAt: u.pinnedAt,
            zeroCount: u.zeroCount,
          },
        });
        showZeros(u.zeroCount);
        if (!(await ctx.sleep(d.stepMs))) return;
      }

      const last = trace[trace.length - 1];
      if (last === undefined) throw new Error('weight-penalty: 갱신이 하나도 없다');
      await phase('count');
      await ctx.emit({ type: 'count', payload: { penalty, lam, zeroCount: countZeros(last.weights), total } });
      if (!(await ctx.sleep(d.stepMs))) return;

      // 입력 대기 — 우리 손잡이만 받는다
      let got = false;
      while (!got) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        // 우리 것이 아닌 입력만 흘린다. 제 손잡이인데 값이 어긋나면 던진다 (C6 · C9)
        if (input.type !== 'penalty' && input.type !== 'strength') continue;
        const p = input.payload as { value?: unknown } | undefined;
        const value = p?.value;
        if (typeof value !== 'number') throw new Error(`weight-penalty: ${input.type} 의 value 가 수가 아니다`);
        if (input.type === 'penalty') {
          if (!Number.isInteger(value) || d.penaltyLadder[value] === undefined) {
            throw new Error(`weight-penalty: penalty 값 ${value} 가 사다리 밖이다`);
          }
          penaltyIdx = value;
          got = true;
        } else {
          if (!d.strengthLadder.includes(value)) throw new Error(`weight-penalty: strength 값 ${value} 가 사다리 밖이다`);
          lam = value;
          got = true;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
