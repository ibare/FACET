/**
 * layer-promotion — 같은 만큼 옮긴 두 배지 중 페이지 장에 함께 칠해진 쪽만 다시 칠한다.
 *
 * 모형: 페이지 장 안의 요소가 옮겨지면 옛 자리와 새 자리가 더러워지고, 그 자리에 겹친
 * 페이지 장의 요소를 다시 칠한다. 옛 자리에는 옮긴 것 자신이 없고, 새 자리에는 옮긴 것
 * 자신도 칠한다. 제 장의 요소가 옮겨지면 그 장의 놓는 자리만 바뀐다 — 어느 장도 다시
 * 칠하지 않는다. 다시 칠하기의 단위는 겹친 요소이고, 수는 서로 다른 요소의 수다.
 *
 * 이벤트 (차례대로, 모두 silent 아님):
 *
 * - `change`    payload `{ ids: string[] }`
 *     옮기는 요소 전부의 transform 이 한 번 바뀐다. ids 는 데이터의 moves 차례.
 * - `repaint`   payload `{ id: string; spot: 'before' | 'after'; items: string[]; total: string[] }`
 *     페이지 장 안의 요소 id 가 떠난 자리(before) 또는 들어간 자리(after)를 다시 칠한다.
 *     items 는 이 자리에서 칠한 요소(차례대로), total 은 id 로 지금까지 다시 칠한
 *     서로 다른 요소(처음 칠한 차례). 페이지 장 요소 하나마다 before · after 두 번.
 * - `composite` payload `{ slid: { id: string; repainted: string[] }[] }`
 *     페이지 장과 제 장들을 합친다. slid 는 놓는 자리만 옮긴 제 장의 요소와, 그 옮김으로
 *     다시 칠한 요소(규약상 빈 목록).
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (init 이벤트 없음).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LayerMove = {
  /** 옮기는 요소 식별자 */
  id: string;
  /** 옮기기 전 자리가 겹치는 페이지 장의 요소 */
  before: string[];
  /** 옮긴 뒤 자리가 겹치는 페이지 장의 요소 */
  after: string[];
};

export type PromotedSheet = {
  /** 제 장에 떼어 둔 요소 */
  id: string;
  /** 떼어 두게 한 CSS 선언 (자료 — 번역하지 않는다) */
  decl: string;
};

export type LayerPromotionFacetData = {
  type: 'layer-promotion';
  stepMs: number;
  /** 페이지 장에 함께 칠해진 요소 (칠하는 차례) */
  page: string[];
  /** 제 장에 떼어 둔 요소 */
  promoted: PromotedSheet[];
  /** 두 요소에 한 번 일어나는 바뀜 (CSS 선언 — 자료) */
  change: string;
  /** 옮기는 요소와 그 겹침 */
  moves: LayerMove[];
};

/** 데이터를 확인한다. 셈할 수 없는 모양이면 던진다 (C6). */
export function checkLayerData(data: LayerPromotionFacetData): void {
  const page = new Set<string>();
  for (const id of data.page) {
    if (page.has(id)) throw new Error(`layer-promotion: 페이지 장에 같은 요소가 두 번 있다 — ${id}`);
    page.add(id);
  }
  const own = new Set<string>();
  for (const sheet of data.promoted) {
    if (page.has(sheet.id) || own.has(sheet.id)) {
      throw new Error(`layer-promotion: 요소가 두 장에 있다 — ${sheet.id}`);
    }
    own.add(sheet.id);
  }
  const seen = new Set<string>();
  for (const m of data.moves) {
    if (!page.has(m.id) && !own.has(m.id)) {
      throw new Error(`layer-promotion: 옮기는 요소가 어느 장에도 없다 — ${m.id}`);
    }
    if (seen.has(m.id)) throw new Error(`layer-promotion: 같은 요소를 두 번 옮긴다 — ${m.id}`);
    seen.add(m.id);
    for (const spot of [m.before, m.after]) {
      if (spot.length === 0) throw new Error(`layer-promotion: ${m.id} 의 자리가 아무것과도 겹치지 않는다`);
      const inSpot = new Set<string>();
      for (const x of spot) {
        if (!page.has(x)) throw new Error(`layer-promotion: 겹침 대상이 페이지 장에 없다 — ${x}`);
        if (x === m.id) throw new Error(`layer-promotion: ${m.id} 가 제 자신과 겹친다고 적혔다`);
        if (inSpot.has(x)) throw new Error(`layer-promotion: ${m.id} 의 겹침에 ${x} 가 두 번 있다`);
        inSpot.add(x);
      }
    }
  }
  if (data.moves.length === 0) throw new Error('layer-promotion: 옮기는 요소가 없다');
}

export async function layerPromotion(
  rawCtx: FacetContext<LayerPromotionFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<LayerPromotionFacetData>;
  const data = ctx.data;
  checkLayerData(data);
  const stepMs = data.stepMs;
  const pageSet = new Set(data.page);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 (두 장과 두 배지) 은 이미 읽을 것이 있는 화면이다 — 읽을 틈을 둔다
  if (!(await pause())) return;
  await ctx.emit({ type: 'change', payload: { ids: data.moves.map((m) => m.id) } });

  const slid: { id: string; repainted: string[] }[] = [];
  for (const m of data.moves) {
    if (ctx.cancelled) return;
    if (!pageSet.has(m.id)) {
      // 제 장의 요소 — 장의 놓는 자리만 바뀐다. 어느 장도 다시 칠하지 않는다
      slid.push({ id: m.id, repainted: [] });
      continue;
    }
    const total: string[] = [];
    // 옛 자리: 가려졌던 것이 드러난다 — 옮긴 것 자신은 그 자리에 없다
    const beforeItems = [...m.before];
    for (const x of beforeItems) {
      if (!total.includes(x)) total.push(x);
    }
    if (!(await pause())) return;
    await ctx.emit({
      type: 'repaint',
      payload: { id: m.id, spot: 'before', items: beforeItems, total: [...total] },
    });
    // 새 자리: 겹친 것 위에 옮긴 것 자신도 칠한다
    const afterItems = [...m.after, m.id];
    for (const x of afterItems) {
      if (!total.includes(x)) total.push(x);
    }
    if (!(await pause())) return;
    await ctx.emit({
      type: 'repaint',
      payload: { id: m.id, spot: 'after', items: afterItems, total: [...total] },
    });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'composite', payload: { slid } });
}
