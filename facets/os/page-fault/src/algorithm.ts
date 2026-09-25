/**
 * 페이지 폴트 — 메모리에 없는 페이지를 건드리면 실행이 멈추고, 디스크에서 올라온 뒤,
 * 같은 접근이 처음부터 다시 돈다.
 *
 * 값은 모두 예로 정한 것이다 (실제 시스템에서 잰 것이 아니다). 페이지 넷의 표 · 빈 프레임 ·
 * 접근 차례가 1차 데이터이고, 어느 빈 프레임에 올릴지와 폴트 수는 여기서 셈한다.
 *
 * 규약 (사양의 규약 줄 그대로)
 *   - 표에 프레임이 있는 페이지의 접근 = 한 걸음 (`access`)
 *   - 표가 "없음" 인 페이지의 접근 = 네 걸음: 없음을 만나 멈춤(`fault`) · 디스크에서 빈 프레임으로
 *     올림(`load`) · 표 고침(`map`) · 같은 접근 다시, 이번엔 지나감(`retry`)
 *   - 빈 프레임은 번호가 낮은 것부터 쓴다
 *   - 내보내기는 없다. 빈 프레임이 필요한데 없으면 셈할 수 없으므로 던진다
 *   - TLB 는 없다고 본다
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음)
 *   access { index: number; page: number; frame: number }  표에 있는 페이지. 곧바로 지나간다
 *   fault  { index: number; page: number }                  표가 없음. 실행이 멈춘다
 *   load   { index: number; page: number; frame: number }   디스크에서 빈 프레임으로 올라온다
 *   map    { index: number; page: number; frame: number }   표의 그 줄이 프레임을 가리키게 고쳐진다
 *   retry  { index: number; page: number; frame: number }   멈췄던 같은 접근이 다시 돌아 지나간다
 *
 * index 는 접근 차례(0 부터), page · frame 은 번호.
 * 걸음 0 은 장면의 initial() 이 initialData 에서 채운다 (표 · 프레임 · 디스크).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PageFaultRow = { page: number; frame: number | null };

export type PageFaultFacetData = {
  type: 'page-fault';
  stepMs: number;
  /** 프로세스의 페이지 표. frame 이 null 이면 그 페이지는 디스크에만 있다 */
  pages: PageFaultRow[];
  /** 처음에 비어 있는 프레임 번호 */
  freeFrames: number[];
  /** 접근할 페이지 번호, 이 차례로 */
  accesses: number[];
};

export async function pageFault(ctx: FacetContext<PageFaultFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<PageFaultFacetData>;
  const { stepMs, pages, freeFrames, accesses } = ctx.data;

  const table = new Map<number, number | null>();
  for (const row of pages) {
    if (table.has(row.page)) throw new Error(`page-fault: 페이지 ${row.page} 가 표에 두 번 있다`);
    table.set(row.page, row.frame);
  }
  const free = [...freeFrames].sort((a, b) => a - b);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let index = 0; index < accesses.length; index += 1) {
    // 걸음 0 이 이미 표와 디스크를 보여 주므로 첫 접근 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    const page = accesses[index];
    if (page === undefined) throw new Error(`page-fault: 접근 ${index} 가 비었다`);
    if (!table.has(page)) throw new Error(`page-fault: 접근 ${index} 의 페이지 ${page} 가 표에 없다`);
    const mapped = table.get(page);

    if (mapped !== null && mapped !== undefined) {
      await ctx.emit({ type: 'access', payload: { index, page, frame: mapped } });
      continue;
    }

    await ctx.emit({ type: 'fault', payload: { index, page } });
    if (!(await pause())) return;

    const frame = free.shift();
    if (frame === undefined) {
      throw new Error(`page-fault: 접근 ${index} 의 페이지 ${page} 를 올릴 빈 프레임이 없다`);
    }
    await ctx.emit({ type: 'load', payload: { index, page, frame } });
    if (!(await pause())) return;

    table.set(page, frame);
    await ctx.emit({ type: 'map', payload: { index, page, frame } });
    if (!(await pause())) return;

    await ctx.emit({ type: 'retry', payload: { index, page, frame } });
  }
}
