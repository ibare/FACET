/**
 * 최근 사용 갱신 — LRU 는 쓸 때마다 줄의 순서를 고쳐, 맨 뒤가 늘 다음 차례다.
 *
 * 값은 모두 예로 정한 것이다 (실제 시스템에서 잰 것이 아니다). 프레임은 처음부터 다 차
 * 있고, 줄은 가장 최근에 쓴 페이지에서 가장 오래 안 쓴 페이지 차례로 선다.
 *
 * 규약 (사양 그대로)
 *   - 적중(참조한 페이지가 줄에 있다) — 그 페이지를 줄에서 빼 맨 앞에 넣는다. 그 앞에 있던
 *     것들은 순서를 지킨 채 한 칸씩 뒤로 밀린다
 *   - 폴트(줄에 없다) — 맨 뒤를 찾지 않고 바로 내보내고, 새 페이지를 맨 앞에 넣는다
 *   - 참조 하나가 한 걸음. 줄 안의 페이지는 서로 다르므로 동률이 없다
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩)
 *   - `hit`   { page: number; from: number; order: number[] }
 *       page  참조한 페이지
 *       from  당기기 전 줄에서의 자리 (0 이 맨 앞). 뒤로 밀린 것의 수와 같다
 *       order 당긴 뒤의 줄 (맨 앞 → 맨 뒤)
 *   - `fault` { page: number; out: number; order: number[] }
 *       page  참조한 새 페이지
 *       out   맨 뒤에서 내보낸 페이지
 *       order 넣은 뒤의 줄 (맨 앞 → 맨 뒤)
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 의 처음 줄로 채운다. 그 화면에 읽을 것이 있어
 * 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RecencyReorderFacetData = {
  type: 'recency-reorder';
  stepMs: number;
  /** 프레임 수. 처음 줄의 길이와 같아야 한다 (이미 차 있다) */
  frames: number;
  /** 처음 줄 — 가장 최근 → 가장 오래 */
  order: number[];
  /** 참조, 이 차례로 */
  refs: number[];
};

/** 자료를 확인한다. 셈할 수 없는 모양이면 던진다. */
export function checkRecencyData(data: RecencyReorderFacetData): void {
  if (!Number.isInteger(data.frames) || data.frames < 1) {
    throw new Error(`recency-reorder: 프레임 수가 양의 정수가 아니다 (${String(data.frames)})`);
  }
  if (data.order.length !== data.frames) {
    throw new Error(
      `recency-reorder: 처음 줄의 길이 ${data.order.length} 가 프레임 수 ${data.frames} 와 다르다`,
    );
  }
  const seen = new Set<number>();
  for (const p of data.order) {
    if (!Number.isInteger(p)) throw new Error(`recency-reorder: 페이지 번호가 정수가 아니다 (${String(p)})`);
    if (seen.has(p)) throw new Error(`recency-reorder: 처음 줄에 페이지 ${p} 가 두 번 있다`);
    seen.add(p);
  }
  for (const p of data.refs) {
    if (!Number.isInteger(p)) throw new Error(`recency-reorder: 참조가 정수가 아니다 (${String(p)})`);
  }
}

export async function recencyReorder(
  context: FacetContext<RecencyReorderFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<RecencyReorderFacetData>;
  const data = ctx.data;
  checkRecencyData(data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let order = [...data.order];

  for (const page of data.refs) {
    if (!(await pause())) return;
    const from = order.indexOf(page);
    if (from >= 0) {
      order = [page, ...order.slice(0, from), ...order.slice(from + 1)];
      await ctx.emit({ type: 'hit', payload: { page, from, order: [...order] } });
    } else {
      const out = order[order.length - 1];
      if (out === undefined) throw new Error('recency-reorder: 줄이 비어 내보낼 페이지가 없다');
      order = [page, ...order.slice(0, order.length - 1)];
      await ctx.emit({ type: 'fault', payload: { page, out, order: [...order] } });
    }
  }
}
