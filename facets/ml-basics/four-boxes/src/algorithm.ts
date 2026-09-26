/**
 * four-boxes — 항목이 두 물음을 거쳐 네 칸 가운데 하나로 떨어진다.
 *
 * 항목마다 참 부류(1=양성, 0=음성)와 이미 매겨진 예측 부류가 있다. 점수도 문턱도 없다.
 * 한 걸음에 항목 하나가 실제 부류로 한 번, 예측 부류로 또 한 번 갈라져 제 칸에 쌓인다.
 * 칸 = (참, 예측): TP (1,1) · FN (1,0) · FP (0,1) · TN (0,0).
 *
 * 이벤트
 * - `init` (silent: true) — 걸음 0 의 네 칸을 연다.
 *     payload: { counts: { TP: number; FN: number; FP: number; TN: number } }  (모두 0)
 * - `drop` (silent 아님) — 항목 하나가 제 칸에 떨어졌다. 한 걸음 = 항목 하나.
 *     payload: {
 *       index: number;          // 데이터 차례 (0 부터)
 *       id: string;
 *       actual: 0 | 1;
 *       predicted: 0 | 1;
 *       box: 'TP' | 'FN' | 'FP' | 'TN';
 *       was: number;            // 떨어지기 전 그 칸의 수 — 쌓이는 자리(0 부터)이기도 하다
 *       counts: { TP; FN; FP; TN };   // 떨어진 뒤 네 칸의 수
 *       summary: null | {       // 마지막 항목에서만 채운다
 *         right: number;        // TP + TN
 *         wrong: number;        // FP + FN
 *         fp: number;
 *         fn: number;
 *         accuracy: number;     // right / 항목 수 (전 정밀도)
 *       };
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BoxKey = 'TP' | 'FN' | 'FP' | 'TN';
export const BOX_KEYS: readonly BoxKey[] = ['TP', 'FN', 'FP', 'TN'];

export type BinaryClass = 0 | 1;

export type FourBoxesItem = {
  id: string;
  actual: BinaryClass;
  predicted: BinaryClass;
};

export type FourBoxesFacetData = {
  type: 'four-boxes';
  stepMs: number;
  items: FourBoxesItem[];
};

export type BoxCounts = Record<BoxKey, number>;

export type FourBoxesSummary = {
  right: number;
  wrong: number;
  fp: number;
  fn: number;
  accuracy: number;
};

function asClass(value: unknown, path: string): BinaryClass {
  if (value === 0 || value === 1) return value;
  throw new Error(`four-boxes: ${path} 는 0 또는 1 이어야 한다 (받은 값: ${String(value)})`);
}

/** `ctx.data` · `initialData` 의 좁히개. 어긋나면 필드 경로를 담아 던진다. */
export function narrowFourBoxesData(raw: unknown): FourBoxesFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('four-boxes: 자료가 객체가 아니다');
  }
  const rec = raw as Record<string, unknown>;
  if (rec.type !== 'four-boxes') {
    throw new Error(`four-boxes: type 이 'four-boxes' 가 아니다 (받은 값: ${String(rec.type)})`);
  }
  const stepMs = rec.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error('four-boxes: stepMs 는 양의 수여야 한다');
  }
  const rawItems = rec.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('four-boxes: items 는 비지 않은 배열이어야 한다');
  }
  const seen = new Set<string>();
  const items = rawItems.map((entry: unknown, i): FourBoxesItem => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`four-boxes: items[${i}] 가 객체가 아니다`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || e.id === '') {
      throw new Error(`four-boxes: items[${i}].id 가 비었다`);
    }
    if (seen.has(e.id)) throw new Error(`four-boxes: items[${i}].id '${e.id}' 가 겹친다`);
    seen.add(e.id);
    return {
      id: e.id,
      actual: asClass(e.actual, `items[${i}].actual`),
      predicted: asClass(e.predicted, `items[${i}].predicted`),
    };
  });
  return { type: 'four-boxes', stepMs, items };
}

/** 칸 = (참, 예측). 바탕에서 정해지는 작은 셈이라 장면이 대조에 함께 쓴다. */
export function boxOf(actual: BinaryClass, predicted: BinaryClass): BoxKey {
  if (actual === 1) return predicted === 1 ? 'TP' : 'FN';
  return predicted === 1 ? 'FP' : 'TN';
}

/** 실제 부류가 틀림을 만든 칸인가 — 헛짚음 · 놓침. */
export function isWrongBox(box: BoxKey): boolean {
  return box === 'FP' || box === 'FN';
}

export async function fourBoxes(context: FacetContext<FourBoxesFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<FourBoxesFacetData>;
  const data = narrowFourBoxesData(ctx.data);
  const { stepMs, items } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const counts: BoxCounts = { TP: 0, FN: 0, FP: 0, TN: 0 };
  await ctx.emit({ type: 'init', payload: { counts: { ...counts } }, silent: true });

  for (const [index, item] of items.entries()) {
    // 걸음 0 이 이미 읽을 것(기다리는 항목 · 네 칸)이 있는 화면이라 첫 발신 앞에도 머문다
    if (!(await pause())) return;
    const box = boxOf(item.actual, item.predicted);
    const was = counts[box];
    counts[box] = was + 1;
    const last = index === items.length - 1;
    const summary: FourBoxesSummary | null = last
      ? {
          right: counts.TP + counts.TN,
          wrong: counts.FP + counts.FN,
          fp: counts.FP,
          fn: counts.FN,
          accuracy: (counts.TP + counts.TN) / items.length,
        }
      : null;
    await ctx.emit({
      type: 'drop',
      payload: {
        index,
        id: item.id,
        actual: item.actual,
        predicted: item.predicted,
        box,
        was,
        counts: { ...counts },
        summary,
      },
    });
  }
}
