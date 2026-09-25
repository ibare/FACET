/**
 * evictLeastRecent — 자리가 없을 때 LRU 는 누구를 내보내는가.
 *
 * 프레임 몇 칸에 참조가 차례로 온다. 값(프레임 수 · 참조 차례)은 예로 정한 것이며
 * 실제 시스템에서 잰 것이 아니다.
 *
 * 규약 (사양 그대로):
 *   - 적중 = 참조한 페이지가 이미 프레임에 있음 → 그 페이지의 마지막 쓴 때만 지금으로 갱신
 *   - 폴트면 빈 프레임에 넣는다 (번호 낮은 것부터)
 *   - 빈 프레임이 없으면 마지막 쓴 때가 가장 이른 페이지를 내보내고 **그 프레임에** 새 페이지
 *     (동률이면 번호 낮은 프레임 — 이 데이터에서는 일어나지 않는다)
 *   - 새 페이지의 마지막 쓴 때 = 지금. 참조 하나가 한 걸음
 *
 * 이벤트 (모두 silent 아님 — 참조 하나가 한 걸음):
 *   fill   { t: number; page: number; frame: number }
 *            폴트, 빈 프레임 `frame` 에 넣음
 *   hit    { t: number; page: number; frame: number; was: number }
 *            적중. `was` = 갱신 전의 마지막 쓴 때
 *   evict  { t: number; page: number; frame: number; victim: number;
 *            reach: number[]; stays: { page: number; loadedAt: number; used: number } | null }
 *            폴트, 빈 프레임 없음. `reach[i]` = 그 순간 프레임 i 페이지의 마지막 쓴 때.
 *            `victim` 을 내보내고 그 프레임 `frame` 에 `page`.
 *            `stays` = 들어온 차례로는 가장 먼저지만 남는 페이지 (내보낸 것과 같으면 null)
 *
 * 걸음 0 (빈 프레임과 참조 줄) 은 initialData 에서 장면이 세운다 — 읽을 것이 있는
 * 화면이라 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EvictLeastRecentFacetData = {
  type: 'evict-least-recent';
  /** 프레임 수 */
  frames: number;
  /** 참조 차례 (페이지 번호). t1 부터 */
  refs: number[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

type Resident = { page: number; loadedAt: number; lastUsed: number };

export async function evictLeastRecent(
  context: FacetContext<EvictLeastRecentFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<EvictLeastRecentFacetData>;
  const { frames: nFrames, refs, stepMs } = ctx.data;
  if (!Number.isInteger(nFrames) || nFrames < 1) {
    throw new Error(`evictLeastRecent: 프레임 수가 1 이상의 정수가 아니다 (${String(nFrames)})`);
  }
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new Error('evictLeastRecent: 참조가 비었다');
  }
  for (const [i, p] of refs.entries()) {
    if (!Number.isInteger(p) || p < 0) {
      throw new Error(`evictLeastRecent: 참조 t${i + 1} 가 페이지 번호가 아니다 (${String(p)})`);
    }
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const slots: (Resident | null)[] = Array.from({ length: nFrames }, () => null);

  for (const [i, page] of refs.entries()) {
    if (!(await pause())) return;
    const t = i + 1;

    const at = slots.findIndex((s) => s !== null && s.page === page);
    if (at >= 0) {
      const cur = slots[at];
      if (!cur) throw new Error(`evictLeastRecent: t${t} 적중한 프레임 ${at} 이 비었다`);
      const was = cur.lastUsed;
      slots[at] = { ...cur, lastUsed: t };
      await ctx.emit({ type: 'hit', payload: { t, page, frame: at, was } });
      continue;
    }

    const empty = slots.findIndex((s) => s === null);
    if (empty >= 0) {
      slots[empty] = { page, loadedAt: t, lastUsed: t };
      await ctx.emit({ type: 'fill', payload: { t, page, frame: empty } });
      continue;
    }

    // 빈 프레임이 없다 — 프레임마다 마지막 쓴 때를 되짚어 가장 이른 것을 고른다
    const residents: Resident[] = slots.map((s, k) => {
      if (!s) throw new Error(`evictLeastRecent: t${t} 프레임 ${k} 이 비었는데 빈 칸 찾기가 놓쳤다`);
      return s;
    });
    let victimAt = 0;
    for (const [k, s] of residents.entries()) {
      if (ctx.cancelled) return;
      const best = residents[victimAt];
      if (!best) throw new Error(`evictLeastRecent: t${t} 프레임 ${victimAt} 이 없다`);
      if (s.lastUsed < best.lastUsed) victimAt = k;
    }
    let firstAt = 0;
    for (const [k, s] of residents.entries()) {
      if (ctx.cancelled) return;
      const best = residents[firstAt];
      if (!best) throw new Error(`evictLeastRecent: t${t} 프레임 ${firstAt} 이 없다`);
      if (s.loadedAt < best.loadedAt) firstAt = k;
    }
    const victim = residents[victimAt];
    const first = residents[firstAt];
    if (!victim || !first) throw new Error(`evictLeastRecent: t${t} 고른 프레임이 없다`);
    const reach = residents.map((s) => s.lastUsed);
    const stays =
      firstAt === victimAt
        ? null
        : { page: first.page, loadedAt: first.loadedAt, used: first.lastUsed };

    slots[victimAt] = { page, loadedAt: t, lastUsed: t };
    await ctx.emit({
      type: 'evict',
      payload: { t, page, frame: victimAt, victim: victim.page, reach, stays },
    });
  }
}
