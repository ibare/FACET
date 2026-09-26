/**
 * roc-imbalance — 음성을 몇 배로 겹쳐도 ROC 는 제자리이고 정밀도는 무너진다.
 *
 * 양성 점수 열 10 개와 음성 점수 열 10 개가 1차 데이터다. 음성 더미는 음성 열을 배수(×1 · ×4 · ×10)만큼
 * 겹친 것이다 — 겹 c = 0 … m − 1 마다 열 차례로. 분포는 그대로이고 수만 는다.
 *
 * 규약 (공통 안내문 · 사양)
 *   - 양성이라 부름 = 점수 ≥ 문턱. 칸 = (참, 부름): TP · FN · FP · TN
 *   - TPR = TP / P · FPR = FP / N (N 은 배수를 반영한 음성 수) · 정밀도 = TP / (TP + FP) · 정확도 = (TP + TN) / (P + N)
 *   - 백분율은 반올림 정수 `(x * 100 + n // 2) // n` — IR 과 같은 식
 *   - TP + FP = 0 이면 정밀도를 셈할 수 없다 — 던진다 (IR 은 −1). 이 사다리에서는 일어나지 않는다
 *   - AUC = 짝 셈: 양성 × 음성 더미의 짝마다 양성 점수가 크면 2 · 같으면 1 · 작으면 0, AUC% = pct(합, 2·P·N).
 *     합의 차례는 양성 i → 겹 c → 음성 q (IR 과 같다)
 *   - 곡선(화면용)은 문턱을 모든 점수 위에서 서로 다른 점수마다 내려 (FP, TP) 개수 열로 싣는다
 *
 * 동률 규칙 — 점수와 문턱이 같으면 양성이라 부른다(≥). 양성 · 음성 점수가 같은 짝은 1 을 센다.
 * 이 데이터에서는 어느 쪽도 걸리지 않는다: 점수와 문턱의 가장 가까운 거리는 0.01 (0.69 · 0.71 대 0.7,
 * 0.51 대 0.5, 0.29 · 0.31 없음 — 0.29 대 0.3), 양성 · 음성 점수 사이에 같은 값이 없다.
 *
 * 이벤트 (걸음 이벤트는 silent 가 아니다 — 한 판 = 6 걸음)
 *   items      걸음 0. { round: number, multiplier: number, threshold: number, p: number, n: number,
 *                        positives: { id: string, score: number }[],
 *                        negatives: { id: string, score: number, layer: number }[] }
 *   call       걸음 1. { threshold: number, tp, fn, fp, tn: number,
 *                        placements: { id: string, cell: 'tp' | 'fn' | 'fp' | 'tn', slot: number }[] }
 *   rates      걸음 2. { tp, fp, p, n: number, tprPercent: number, fprPercent: number, tpr: number, fpr: number,
 *                        curve: { fp: number, tp: number, fpr: number, tpr: number }[] }
 *   auc        걸음 3. { aucPercent: number, curve: 위와 같음 }
 *   precision  걸음 4. { tp: number, called: number, precisionPercent: number }
 *   accuracy   걸음 5. { correct: number, total: number, accuracyPercent: number }
 *   phase      silent. { phase: 'call' | 'rates' | 'auc' | 'precision' | 'accuracy' } — 걸음 1 … 5 의 발신 바로 앞
 *
 * phase 어휘 (irs.ts 와 같다): call · rates · auc · precision · accuracy. 걸음 0 은 코드 패널을 끈다 (projector).
 *
 * 계기 — 걸음마다 그 걸음에서 셈한 것을 지금 값으로, 판 머리(걸음 0)에서 0 으로
 *   false-positives   걸음 1 의 FP
 *   auc-percent       걸음 3
 *   precision-percent 걸음 4
 *   accuracy-percent  걸음 5
 *
 * 손잡이 — `negatives` (1 · 4 · 10) · `threshold` (0.7 · 0.5 · 0.3). 짜임은 한 판 재생 → waitForInput → 다시 재생.
 * payload 에서는 제 action 의 `value` 만 믿고, 다른 손잡이의 지금 값은 알고리즘이 쥔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RocImbalanceData = {
  type: 'roc-imbalance';
  stepMs: number;
  positiveScores: number[];
  negativeScores: number[];
  negativesLadder: number[];
  thresholdLadder: number[];
  startNegatives: number;
  startThreshold: number;
};

export type CellName = 'tp' | 'fn' | 'fp' | 'tn';

export type Confusion = {
  TP: number;
  FN: number;
  FP: number;
  TN: number;
  P: number;
  N: number;
  tprPercent: number;
  fprPercent: number;
  precisionPercent: number;
  accuracyPercent: number;
};

export type CurvePoint = { fp: number; tp: number; fpr: number; tpr: number };

/** 반올림 정수 백분율. x · n 은 음이 아닌 정수, n > 0. */
export function pct(x: number, n: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(n) || n <= 0 || x < 0) {
    throw new Error(`pct: 음이 아닌 정수 x 와 양의 정수 n 이 필요하다 (${x}, ${n})`);
  }
  return Math.floor((x * 100 + Math.floor(n / 2)) / n);
}

/** 혼동 행렬과 비율 넷. 음성은 겹 c 마다 열 차례로 센다 (배열을 만들지 않는다 — IR 과 같은 차례). */
export function rocConfusion(pos: readonly number[], neg: readonly number[], mult: number, th: number): Confusion {
  let TP = 0;
  for (const s of pos) {
    if (s >= th) TP += 1;
  }
  let FP = 0;
  for (let c = 0; c < mult; c += 1) {
    for (const s of neg) {
      if (s >= th) FP += 1;
    }
  }
  const P = pos.length;
  const N = neg.length * mult;
  if (P === 0 || N === 0) throw new Error('양성 · 음성이 하나씩은 있어야 비율을 셈한다');
  const FN = P - TP;
  const TN = N - FP;
  if (TP + FP === 0) throw new Error('양성이라 부른 것이 없다 — 정밀도를 셈할 수 없다');
  return {
    TP,
    FN,
    FP,
    TN,
    P,
    N,
    tprPercent: pct(TP, P),
    fprPercent: pct(FP, N),
    precisionPercent: pct(TP, TP + FP),
    accuracyPercent: pct(TP + TN, P + N),
  };
}

/** AUC% — 짝 셈. 차례는 양성 i → 겹 c → 음성 q. */
export function rocAucPercent(pos: readonly number[], neg: readonly number[], mult: number): number {
  let wins = 0;
  for (const p of pos) {
    for (let c = 0; c < mult; c += 1) {
      for (const q of neg) {
        if (p > q) wins += 2;
        else if (p === q) wins += 1;
      }
    }
  }
  return pct(wins, 2 * pos.length * neg.length * mult);
}

/** 곡선 — 문턱을 모든 점수 위에서 서로 다른 점수마다 내린 (FP, TP) 개수 열과 그 비율. */
export function rocCurve(pos: readonly number[], neg: readonly number[], mult: number): CurvePoint[] {
  const P = pos.length;
  const N = neg.length * mult;
  const ths = [...new Set([...pos, ...neg])].sort((a, b) => b - a);
  const out: CurvePoint[] = [{ fp: 0, tp: 0, fpr: 0, tpr: 0 }];
  for (const th of ths) {
    const tp = pos.filter((s) => s >= th).length;
    const fp = neg.filter((s) => s >= th).length * mult;
    out.push({ fp, tp, fpr: fp / N, tpr: tp / P });
  }
  return out;
}

function inLadder(v: unknown, ladder: readonly number[]): v is number {
  return typeof v === 'number' && ladder.includes(v);
}

export async function rocImbalanceAlgorithm(base: FacetContext<RocImbalanceData>): Promise<void> {
  const ctx = base as ReactiveContext<RocImbalanceData>;
  const d = ctx.data;
  const pos = d.positiveScores;
  const neg = d.negativeScores;
  if (pos.length === 0 || neg.length === 0) throw new Error('점수 열이 비었다');
  if (!inLadder(d.startNegatives, d.negativesLadder)) throw new Error('startNegatives 가 사다리 밖이다');
  if (!inLadder(d.startThreshold, d.thresholdLadder)) throw new Error('startThreshold 가 사다리 밖이다');

  let mult = d.startNegatives;
  let th = d.startThreshold;
  let round = 0;

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = { 'false-positives': 0, 'precision-percent': 0, 'accuracy-percent': 0, 'auc-percent': 0 };
  const sent = new Set<string>();
  const show = (name: keyof typeof shown, v: number): void => {
    const delta = v - shown[name];
    if (delta !== 0 || !sent.has(name)) ctx.metric(name, delta);
    shown[name] = v;
    sent.add(name);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRound = async (): Promise<boolean> => {
    round += 1;
    const c = rocConfusion(pos, neg, mult, th);
    const auc = rocAucPercent(pos, neg, mult);
    const curve = rocCurve(pos, neg, mult);

    // 걸음 0 — 항목
    show('false-positives', 0);
    show('auc-percent', 0);
    show('precision-percent', 0);
    show('accuracy-percent', 0);
    const negatives: { id: string; score: number; layer: number }[] = [];
    for (let layer = 0; layer < mult; layer += 1) {
      neg.forEach((score, q) => negatives.push({ id: `n${layer}.${q}`, score, layer }));
    }
    await ctx.emit({
      type: 'items',
      payload: {
        round,
        multiplier: mult,
        threshold: th,
        p: c.P,
        n: c.N,
        positives: pos.map((score, i) => ({ id: `p${i}`, score })),
        negatives,
      },
    });
    if (!(await ctx.sleep(d.stepMs))) return false;

    // 걸음 1 — 부름: 점수 ≥ 문턱이면 양성이라 부르고 네 칸에 떨어뜨린다
    const slots: Record<CellName, number> = { tp: 0, fn: 0, fp: 0, tn: 0 };
    const placements: { id: string; cell: CellName; slot: number }[] = [];
    const place = (id: string, cell: CellName) => {
      placements.push({ id, cell, slot: slots[cell] });
      slots[cell] += 1;
    };
    pos.forEach((score, i) => place(`p${i}`, score >= th ? 'tp' : 'fn'));
    for (const item of negatives) place(item.id, item.score >= th ? 'fp' : 'tn');
    if (slots.tp !== c.TP || slots.fn !== c.FN || slots.fp !== c.FP || slots.tn !== c.TN) {
      throw new Error('칸에 떨어진 수가 혼동 행렬과 다르다');
    }
    await phase('call');
    show('false-positives', c.FP);
    await ctx.emit({
      type: 'call',
      payload: { threshold: th, tp: c.TP, fn: c.FN, fp: c.FP, tn: c.TN, placements },
    });
    if (!(await ctx.sleep(d.stepMs))) return false;

    // 걸음 2 — 비율
    await phase('rates');
    await ctx.emit({
      type: 'rates',
      payload: {
        tp: c.TP,
        fp: c.FP,
        p: c.P,
        n: c.N,
        tprPercent: c.tprPercent,
        fprPercent: c.fprPercent,
        tpr: c.TP / c.P,
        fpr: c.FP / c.N,
        curve,
      },
    });
    if (!(await ctx.sleep(d.stepMs))) return false;

    // 걸음 3 — AUC
    await phase('auc');
    show('auc-percent', auc);
    await ctx.emit({ type: 'auc', payload: { aucPercent: auc, curve } });
    if (!(await ctx.sleep(d.stepMs))) return false;

    // 걸음 4 — 정밀도
    await phase('precision');
    show('precision-percent', c.precisionPercent);
    await ctx.emit({
      type: 'precision',
      payload: { tp: c.TP, called: c.TP + c.FP, precisionPercent: c.precisionPercent },
    });
    if (!(await ctx.sleep(d.stepMs))) return false;

    // 걸음 5 — 정확도
    await phase('accuracy');
    show('accuracy-percent', c.accuracyPercent);
    await ctx.emit({
      type: 'accuracy',
      payload: { correct: c.TP + c.TN, total: c.P + c.N, accuracyPercent: c.accuracyPercent },
    });
    return ctx.sleep(d.stepMs);
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      // 우리 손잡이의 입력이 올 때까지 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (input.type !== 'negatives' && input.type !== 'threshold') continue; // 우리 것이 아닌 입력만 흘린다
        if (input.type === 'negatives') {
          if (!inLadder(value, d.negativesLadder)) throw new Error(`negatives: 사다리 밖의 값 ${String(value)}`);
          mult = value;
        } else {
          if (!inLadder(value, d.thresholdLadder)) throw new Error(`threshold: 사다리 밖의 값 ${String(value)}`);
          th = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
