/**
 * tlb-caches-translation — 한 번 찾은 번역을 곁(TLB)에 적어 두고 다시 쓴다.
 *
 * 값은 모두 예로 정한 것이다 (실제 시스템에서 잰 것이 아니다). 주소는 16비트, 페이지는 4 KiB —
 * 16진 네 자리 가운데 맨 앞 한 자리가 페이지 번호, 뒤 세 자리가 오프셋이다.
 *
 * 규약 (사양의 규약 줄을 옮긴다)
 *   - 주소 가르기: 앞 16진 한 자리 = 페이지, 뒤 세 자리 = 오프셋
 *   - TLB 를 먼저 본다. 있으면 적중 — 한 걸음 (`tlbHit`)
 *   - 없으면 두 걸음: 표를 찾아감 (`tableWalk`) · TLB 에 적고 실제 주소를 냄 (`tlbFill`)
 *   - TLB 는 적힌 차례로, 번호 낮은 빈 칸부터 채운다. 내보내기는 두지 않는다 — 칸이 모자라면 던진다
 *   - 센다: 표를 찾아간 횟수 · TLB 적중 횟수 (둘 다 접근 단위). 세는 일은 장면이 이벤트를 이어 한다
 *   - 표에 없는 페이지 · 16비트를 벗어난 주소 · 칸 수가 1 보다 작은 TLB 는 던진다
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 채운다 (빈 TLB · 페이지 표 · 기다리는 주소).
 * 첫 발신 앞에 stepMs 를 두어 그 화면을 읽을 틈을 준다.
 *
 * 이벤트 (전부 silent 아님)
 *   tableWalk  { index: number, address: number, page: number, offset: number, frame: number }
 *              — TLB 에 page 가 없어 페이지 표를 찾아갔고, 표의 줄 page → frame 을 찾았다
 *   tlbFill    { index: number, address: number, page: number, offset: number, frame: number,
 *                slot: number, physical: number }
 *              — 찾아낸 줄을 TLB 의 slot 칸에 적고 실제 주소 physical 을 냈다
 *   tlbHit     { index: number, address: number, page: number, offset: number, frame: number,
 *                slot: number, physical: number }
 *              — TLB 의 slot 칸에 page 가 있어 표까지 가지 않고 실제 주소 physical 을 냈다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export const PAGE_SIZE = 0x1000;
export const ADDRESS_LIMIT = 0x10000;

export interface PageTableRow {
  page: number;
  frame: number;
}

export interface TlbCachesTranslationFacetData {
  type: 'tlb-caches-translation';
  stepMs: number;
  /** 페이지 표 — 페이지 번호 → 프레임 번호 */
  pageTable: PageTableRow[];
  /** TLB 칸 수 */
  tlbSlots: number;
  /** 접근할 가상 주소, 이 차례로 */
  addresses: number[];
}

export async function tlbCachesTranslation(
  context: FacetContext<TlbCachesTranslationFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<TlbCachesTranslationFacetData>;
  const { pageTable, tlbSlots, addresses, stepMs } = ctx.data;

  if (!Number.isInteger(tlbSlots) || tlbSlots < 1) {
    throw new Error(`tlb-caches-translation: TLB 칸 수가 1 보다 작다 (${String(tlbSlots)})`);
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // TLB — 적힌 차례. 칸 번호 = 배열 자리
  const tlb: PageTableRow[] = [];

  for (let index = 0; index < addresses.length; index += 1) {
    // 첫 바퀴의 문은 걸음 0(빈 TLB · 표 · 기다리는 주소)을 읽을 틈이다
    if (!(await pause())) return;

    const address = addresses[index];
    if (address === undefined || !Number.isInteger(address) || address < 0 || address >= ADDRESS_LIMIT) {
      throw new Error(`tlb-caches-translation: 접근 ${index} 의 주소가 16비트를 벗어난다 (${String(address)})`);
    }
    const page = Math.floor(address / PAGE_SIZE);
    const offset = address % PAGE_SIZE;

    const slot = tlb.findIndex((row) => row.page === page);
    if (slot >= 0) {
      const frame = tlb[slot]!.frame;
      await ctx.emit({
        type: 'tlbHit',
        payload: { index, address, page, offset, frame, slot, physical: frame * PAGE_SIZE + offset },
      });
      continue;
    }

    const row = pageTable.find((r) => r.page === page);
    if (!row) {
      throw new Error(`tlb-caches-translation: 페이지 ${page.toString(16)} 가 페이지 표에 없다 (접근 ${index})`);
    }
    const frame = row.frame;
    await ctx.emit({ type: 'tableWalk', payload: { index, address, page, offset, frame } });

    if (!(await pause())) return;

    if (tlb.length >= tlbSlots) {
      throw new Error(`tlb-caches-translation: TLB 가 찼다 — 이 조각은 내보내기를 두지 않는다 (접근 ${index})`);
    }
    tlb.push({ page, frame });
    await ctx.emit({
      type: 'tlbFill',
      payload: {
        index,
        address,
        page,
        offset,
        frame,
        slot: tlb.length - 1,
        physical: frame * PAGE_SIZE + offset,
      },
    });
  }
}
