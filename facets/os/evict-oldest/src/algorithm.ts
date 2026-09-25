/**
 * evict-oldest — FIFO 교체는 누구를 내보내는가.
 *
 * 값은 모두 예로 정한 것이다 (프레임 3, 참조 여섯). 실제 시스템에서 잰 것이 아니다.
 *
 * 규약 (사양 그대로):
 *   - 적중이면 아무것도 바뀌지 않는다. 들어온 차례도 그대로다
 *   - 폴트면 빈 프레임을 번호 낮은 것부터 쓴다
 *   - 빈 프레임이 없으면 들어온 차례의 맨 처음 것을 내보내고 **그 프레임에** 새 페이지를 둔다
 *   - 새 페이지는 들어온 차례의 끝에 붙는다
 *   - 참조 하나가 한 걸음. FIFO 에는 동률이 없다
 *
 * 이벤트
 *   ref  (silent 아님) — 참조 하나를 처리한 결과
 *     payload: {
 *       t: number            참조 차례 (1 부터)
 *       page: number         참조한 페이지
 *       result: 'hit' | 'fault'
 *       frame: number        그 페이지가 있는(적중) · 들어간(폴트) 프레임 번호
 *       victim: number|null  내보낸 페이지. 빈 프레임을 썼거나 적중이면 null
 *       order: number[]      처리 뒤 들어온 차례 (맨 처음 → 맨 끝)
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EvictOldestFacetData = {
  type: 'evict-oldest';
  /** 프레임 수 */
  frames: number;
  /** 참조하는 페이지 번호, 차례대로 */
  refs: number[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

function narrow(data: unknown): EvictOldestFacetData {
  if (typeof data !== 'object' || data === null) throw new Error('evict-oldest: 자료가 없다');
  const d = data as Record<string, unknown>;
  const { frames, refs, stepMs } = d;
  if (typeof frames !== 'number' || !Number.isInteger(frames) || frames < 1) {
    throw new Error('evict-oldest: frames 는 1 이상의 정수여야 한다');
  }
  if (!Array.isArray(refs) || refs.length === 0) throw new Error('evict-oldest: refs 가 비었다');
  const pages: number[] = [];
  for (const p of refs) {
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 0) {
      throw new Error(`evict-oldest: 페이지 번호가 아니다 — ${String(p)}`);
    }
    pages.push(p);
  }
  if (typeof stepMs !== 'number' || stepMs <= 0) throw new Error('evict-oldest: stepMs 가 없다');
  return { type: 'evict-oldest', frames, refs: pages, stepMs };
}

export async function evictOldest(ctx: FacetContext<EvictOldestFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<EvictOldestFacetData>;
  const { frames: nFrames, refs, stepMs } = narrow(ctx.data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  /** 프레임 번호 → 그 안의 페이지 (없으면 null) */
  const frames: (number | null)[] = Array.from({ length: nFrames }, () => null);
  /** 들어온 차례 — 맨 처음이 앞 */
  const order: number[] = [];

  for (let i = 0; i < refs.length; i += 1) {
    // 걸음 0(빈 프레임)도 읽을 틈을 준다 — 문이 첫 문장이라 진입 검사를 겸한다
    if (!(await pause())) return;
    const page = refs[i]!;
    const t = i + 1;
    const at = frames.indexOf(page);
    if (at >= 0) {
      await ctx.emit({
        type: 'ref',
        payload: { t, page, result: 'hit', frame: at, victim: null, order: [...order] },
      });
      continue;
    }
    let frame = frames.indexOf(null);
    let victim: number | null = null;
    if (frame < 0) {
      const first = order.shift();
      if (first === undefined) throw new Error('evict-oldest: 프레임이 찼는데 들어온 차례가 비었다');
      frame = frames.indexOf(first);
      if (frame < 0) throw new Error(`evict-oldest: 차례의 페이지 ${first} 가 어느 프레임에도 없다`);
      victim = first;
    }
    frames[frame] = page;
    order.push(page);
    await ctx.emit({
      type: 'ref',
      payload: { t, page, result: 'fault', frame, victim, order: [...order] },
    });
  }
}
