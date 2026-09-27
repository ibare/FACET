/**
 * 곱의 법칙 — 자리를 하나 고를 때마다 지금 있는 끝 하나하나에서 그 자리의 선택지 수만큼
 * 갈래가 돋는다. 모든 끝이 같은 수의 갈래를 받으므로 끝의 수가 선택지 수만큼 곱해진다.
 *
 * 이벤트 (발신 차례대로):
 *
 *   init   silent: true
 *     payload: { ends: Array<{ name: string; parent: number }> }
 *       아무것도 고르지 않은 처음의 끝 목록. 끝은 하나 — 빈 결과(`name: ''`, `parent: -1`).
 *
 *   branch (자리마다 한 번, 자리 차례대로)
 *     payload: {
 *       place: number;     // 고르는 자리 (0 부터)
 *       before: number;    // 고르기 전 끝의 수
 *       choices: number;   // 그 자리의 선택지 수
 *       after: number;     // 고른 뒤 끝의 수 (= before × choices)
 *       ends: Array<{ name: string; parent: number }>;
 *         // 새 끝 목록 (사전 차례). name = 부모 이름 + 고른 기호,
 *         // parent = 앞 끝 목록에서의 부모 자리
 *     }
 *
 * 자동 재생을 마치면 그냥 돌아온다. `ctx.metric` 은 부르지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ProductRuleTreeFacetData = {
  type: 'product-rule-tree';
  stepMs: number;
  /** 자리마다의 선택지 기호 (차례대로). 기호는 자료 — 번역하지 않는다 */
  places: string[][];
};

/** 끝 하나 = 결과 하나. parent 는 한 층 앞 끝 목록에서의 자리 (뿌리는 −1) */
export type ProductRuleTreeEnd = { name: string; parent: number };

/** `ctx.data` · `initialData` 좁히개. 모양이 어긋나면 필드 경로를 담아 던진다 */
export function narrowProductRuleTreeData(raw: unknown): ProductRuleTreeFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('product-rule-tree: data 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'product-rule-tree') {
    throw new Error(`product-rule-tree: data.type 이 'product-rule-tree' 가 아니다 (${String(r.type)})`);
  }
  const stepMs = r.stepMs;
  if (typeof stepMs !== 'number' || !Number.isInteger(stepMs) || stepMs < 800) {
    throw new Error('product-rule-tree: data.stepMs 는 800 이상의 정수여야 한다');
  }
  const places = r.places;
  if (!Array.isArray(places) || places.length === 0) {
    throw new Error('product-rule-tree: data.places 는 비지 않은 배열이어야 한다');
  }
  const copied: string[][] = places.map((p, i) => {
    if (!Array.isArray(p) || p.length === 0) {
      throw new Error(`product-rule-tree: data.places[${i}] 는 비지 않은 배열이어야 한다`);
    }
    return p.map((s, j) => {
      if (typeof s !== 'string' || s.length === 0) {
        throw new Error(`product-rule-tree: data.places[${i}][${j}] 는 비지 않은 문자열이어야 한다`);
      }
      return s;
    });
  });
  return { type: 'product-rule-tree', stepMs, places: copied };
}

/**
 * 깊이 depth 의 끝 하나가 맨 끝 층에서 거느리게 될 끝의 수 — 그 뒤 자리들의 선택지 수의 곱.
 * 바탕(자리 목록)에서 정해지는 셈이라 그림이 자리를 잡을 때 부른다.
 */
export function spanBelow(places: readonly (readonly string[])[], depth: number): number {
  if (!Number.isInteger(depth) || depth < 0 || depth > places.length) {
    throw new Error(`product-rule-tree: 깊이 ${depth} 가 자리 범위 밖이다`);
  }
  let span = 1;
  for (let i = depth; i < places.length; i += 1) span *= places[i]!.length;
  return span;
}

export async function productRuleTree(
  ctx: FacetContext<ProductRuleTreeFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<ProductRuleTreeFacetData>;
  const data = narrowProductRuleTreeData(rctx.data);
  const { stepMs, places } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let ends: ProductRuleTreeEnd[] = [{ name: '', parent: -1 }];
  await rctx.emit({ type: 'init', silent: true, payload: { ends } });

  for (let place = 0; place < places.length; place += 1) {
    // 걸음 0 도 읽을 것이 있는 화면이라 첫 고르기 앞에도 머문다
    if (!(await pause())) return;
    const symbols = places[place]!;
    const next: ProductRuleTreeEnd[] = [];
    ends.forEach((end, parent) => {
      for (const sym of symbols) next.push({ name: end.name + sym, parent });
    });
    await rctx.emit({
      type: 'branch',
      payload: {
        place,
        before: ends.length,
        choices: symbols.length,
        after: next.length,
        ends: next,
      },
    });
    ends = next;
  }
}
