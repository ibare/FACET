/**
 * threshold-slides — 점수 문턱이 한 칸씩 내려오며 두 비율을 함께 밀어 올린다.
 *
 * 항목마다 점수와 참 부류가 있다. 문턱 후보는 서로 다른 점수를 큰 것부터 늘어놓은 것이고,
 * 점수 ≥ 문턱인 항목을 양성이라 부른다. 문턱이 한 칸 내려올 때마다 그 점수의 항목(동률이면
 * 여럿)이 한꺼번에 넘는다. 넘은 항목이 참 양성이면 TP 가, 참 음성이면 FP 가 는다.
 *
 * 이벤트
 *   init   (silent) { pos: number, neg: number, tp: number, fp: number, tpr: number, fpr: number }
 *            참 양성 수 P · 참 음성 수 N (비율의 분모) 과 문턱이 모든 점수 위일 때의 셈 (아무도 넘지 않음)
 *   cross  { threshold: number, ids: string[],
 *            fromThreshold: number | null, fromTp: number, fromFp: number,
 *            tp: number, fp: number, tpr: number, fpr: number, last: boolean }
 *            문턱이 한 칸 내려와 ids 가 넘었다. fromThreshold 가 null 이면 앞 문턱이
 *            모든 점수 위였다. tpr = tp / pos · fpr = fp / neg. last 는 가장 낮은 점수의 문턱
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ScoredItem = { id: string; score: number; label: 0 | 1 };

export type ThresholdSlidesFacetData = {
  type: 'threshold-slides';
  stepMs: number;
  items: ScoredItem[];
};

/** initialData 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 장면 · 무대도 이것을 부른다 */
export function narrowThresholdSlides(raw: unknown): ThresholdSlidesFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('threshold-slides: initialData 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'threshold-slides') throw new Error(`threshold-slides: initialData.type 이 다르다 (${String(r.type)})`);
  const stepMs = r.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error('threshold-slides: initialData.stepMs 가 양수가 아니다');
  }
  if (!Array.isArray(r.items) || r.items.length === 0) throw new Error('threshold-slides: initialData.items 가 비었다');
  const seen = new Set<string>();
  const items: ScoredItem[] = r.items.map((v: unknown, i: number) => {
    if (typeof v !== 'object' || v === null) throw new Error(`threshold-slides: items[${i}] 가 객체가 아니다`);
    const o = v as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id === '') throw new Error(`threshold-slides: items[${i}].id 가 없다`);
    if (seen.has(o.id)) throw new Error(`threshold-slides: items[${i}].id 가 겹친다 (${o.id})`);
    seen.add(o.id);
    if (typeof o.score !== 'number' || !(o.score >= 0 && o.score <= 1)) {
      throw new Error(`threshold-slides: items[${i}].score 가 0 과 1 사이가 아니다`);
    }
    if (o.label !== 0 && o.label !== 1) throw new Error(`threshold-slides: items[${i}].label 이 0 · 1 이 아니다`);
    return { id: o.id, score: o.score, label: o.label };
  });
  if (!items.some((it) => it.label === 1)) throw new Error('threshold-slides: 참 양성이 하나도 없다 — TPR 의 분모가 0');
  if (!items.some((it) => it.label === 0)) throw new Error('threshold-slides: 참 음성이 하나도 없다 — FPR 의 분모가 0');
  return { type: 'threshold-slides', stepMs, items };
}

/** 문턱 후보 — 서로 다른 점수를 큰 것부터 */
export function thresholdCandidates(items: readonly ScoredItem[]): number[] {
  return [...new Set(items.map((it) => it.score))].sort((a, b) => b - a);
}

export async function thresholdSlides(context: FacetContext<ThresholdSlidesFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ThresholdSlidesFacetData>;
  const { stepMs, items } = narrowThresholdSlides(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const pos = items.filter((it) => it.label === 1).length;
  const neg = items.length - pos;
  const taus = thresholdCandidates(items);
  let fromThreshold: number | null = null;
  // 문턱이 모든 점수 위 — 양성이라 부른 항목이 없다
  let tp = 0;
  let fp = 0;
  await ctx.emit({ type: 'init', payload: { pos, neg, tp, fp, tpr: tp / pos, fpr: fp / neg }, silent: true });

  for (const [k, threshold] of taus.entries()) {
    // 걸음 0(모든 점수 위)도 읽을 틈을 둔다 — 첫 문이 그 자리다
    if (!(await pause())) return;
    const called = items.filter((it) => it.score >= threshold);
    const nextTp = called.filter((it) => it.label === 1).length;
    const nextFp = called.length - nextTp;
    const ids = items.filter((it) => it.score === threshold).map((it) => it.id);
    await ctx.emit({
      type: 'cross',
      payload: {
        threshold,
        ids,
        fromThreshold,
        fromTp: tp,
        fromFp: fp,
        tp: nextTp,
        fp: nextFp,
        tpr: nextTp / pos,
        fpr: nextFp / neg,
        last: k === taus.length - 1,
      },
    });
    fromThreshold = threshold;
    tp = nextTp;
    fp = nextFp;
  }
}
