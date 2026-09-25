/**
 * paging — 주소 번역과 TLB.
 *
 * 참조 열여섯을 차례로 번역한다. 주소를 페이지(주소 // pageBytes)와 오프셋(주소 % pageBytes)으로
 * 가르고, TLB 를 먼저 본다. 있으면 적중, 없으면 페이지 표를 찾아가 프레임을 읽고 TLB 에 적는다.
 * 실제 주소 = 프레임 × pageBytes + 오프셋. 한 판을 끝까지 재생한 뒤 손잡이(TLB 칸 수)를 기다리고,
 * 받은 칸 수로 처음부터 다시 돈다.
 *
 * 규약
 *   - TLB 적중이면 그 칸의 마지막 쓴 때를 지금(참조 색인 i, 0 부터)으로 둔다
 *   - 표를 찾아가면 칸이 있을 때 TLB 에 적는다. 빈 칸은 번호 낮은 것부터, 빈 칸이 없으면 마지막 쓴 때가
 *     가장 이른 칸(LRU)을 내보내고 그 칸에 적는다
 *   - 동률 규칙: 마지막 쓴 때가 같으면 번호 낮은 칸. 쓴 때는 참조 색인이라 채워진 칸끼리 서로 달라
 *     이 데이터에서 동률은 걸리지 않는다 (걸리면 `tieCount` 가 센다 — 테스트가 0 을 단언한다)
 *   - 표의 줄은 모두 메모리에 있다 (폴트 없음). 표에 없는 페이지는 던진다
 *   - 메모리 읽기: 적중 1, 표 찾아감 2 (표 한 번 + 데이터)
 *   - 적중률은 반올림 백분율 — (hits * 100 + n // 2) // n, n 은 지금까지 번역한 참조 수
 *
 * 이벤트
 *   - `run-start` { slots: number }                       판 시작. 걸음 #0 (non-silent)
 *   - `phase`     { phase: 'tlb-hit' | 'table-walk' }     silent — 코드 패널 줄
 *   - `translate` { index: number (0 부터), address: number, page: number, offset: number,
 *                   route: 'hit' | 'walk', slot: number (적중 칸 또는 적은 칸, 칸 0 개면 -1),
 *                   frame: number, evicted: number (내보낸 페이지, 없으면 -1),
 *                   physical: number, hits: number, walks: number, reads: number,
 *                   hitRate: number (반올림 백분율) }        참조 하나 = 걸음 하나 (non-silent)
 *
 * phase 어휘 (irs.ts 와 같다): `tlb-hit` · `table-walk`
 *
 * 계기: `tlb-hits` · `table-walks` · `memory-reads` — 판이 시작할 때 0 으로 되돌린다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PagingData = {
  type: 'paging';
  stepMs: number;
  /** 페이지 크기 (바이트). 4096 = 4 KiB — 주소의 16진 맨 앞 한 자리가 페이지 번호가 된다 */
  pageBytes: number;
  /** 페이지 번호 → 프레임 번호 */
  pageTable: number[];
  /** 참조할 가상 주소, 이 차례로 */
  addresses: number[];
  /** TLB 칸 수 사다리 — 손잡이의 segments[].value 와 같다 */
  tlbLadder: number[];
  /** 첫 판의 TLB 칸 수 */
  tlbSlots: number;
};

export type Translation = {
  index: number;
  address: number;
  page: number;
  offset: number;
  route: 'hit' | 'walk';
  slot: number;
  frame: number;
  evicted: number;
  physical: number;
};

export type PagingRun = {
  steps: Translation[];
  hits: number;
  walks: number;
  reads: number;
  /** 끝 TLB — 칸 차례의 페이지 (빈 칸 -1) */
  finalPages: number[];
  /** LRU 에서 마지막 쓴 때가 같은 칸끼리 견준 횟수 */
  tieCount: number;
};

/** 판 하나를 셈한다. IR `countWalks` 와 한 줄씩 같은 셈이다. */
export function translateAll(data: PagingData, slots: number): PagingRun {
  const { pageBytes, pageTable, addresses } = data;
  if (!Number.isInteger(slots) || slots < 0) throw new Error(`paging: TLB 칸 수가 옳지 않다 — ${slots}`);
  const slotPage: number[] = [];
  const slotFrame: number[] = [];
  const slotUsed: number[] = [];
  for (let s = 0; s < slots; s++) {
    slotPage.push(-1);
    slotFrame.push(-1);
    slotUsed.push(0);
  }
  const steps: Translation[] = [];
  let hits = 0;
  let walks = 0;
  let tieCount = 0;
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    if (address === undefined || !Number.isInteger(address) || address < 0) {
      throw new Error(`paging: 참조 #${i + 1} 의 주소가 옳지 않다 — ${String(address)}`);
    }
    const page = Math.floor(address / pageBytes);
    const offset = address % pageBytes;
    let at = -1;
    for (let s = 0; s < slots; s++) if (slotPage[s] === page) at = s;
    if (at >= 0) {
      slotUsed[at] = i;
      const frame = slotFrame[at]!;
      hits += 1;
      steps.push({ index: i, address, page, offset, route: 'hit', slot: at, frame, evicted: -1, physical: frame * pageBytes + offset });
      continue;
    }
    walks += 1;
    const frame = pageTable[page];
    if (frame === undefined) throw new Error(`paging: 페이지 표에 페이지 ${page} 가 없다 (참조 #${i + 1})`);
    let victim = -1;
    let evicted = -1;
    if (slots > 0) {
      for (let s = 0; s < slots; s++) if (victim === -1 && slotPage[s] === -1) victim = s;
      if (victim === -1) {
        victim = 0;
        for (let s = 1; s < slots; s++) {
          if (slotUsed[s] === slotUsed[victim]) tieCount += 1;
          if (slotUsed[s]! < slotUsed[victim]!) victim = s;
        }
        evicted = slotPage[victim]!;
      }
      slotPage[victim] = page;
      slotFrame[victim] = frame;
      slotUsed[victim] = i;
    }
    steps.push({ index: i, address, page, offset, route: 'walk', slot: victim, frame, evicted, physical: frame * pageBytes + offset });
  }
  return { steps, hits, walks, reads: hits + 2 * walks, finalPages: slotPage, tieCount };
}

function checkData(data: PagingData): void {
  if (data.type !== 'paging') throw new Error(`paging: 데이터 종류가 다르다 — ${String(data.type)}`);
  if (!Number.isInteger(data.pageBytes) || data.pageBytes <= 0) throw new Error('paging: pageBytes 가 옳지 않다');
  if (!Array.isArray(data.addresses) || data.addresses.length === 0) throw new Error('paging: 참조 열이 비었다');
  if (!Array.isArray(data.pageTable) || data.pageTable.length === 0) throw new Error('paging: 페이지 표가 비었다');
  if (!Array.isArray(data.tlbLadder) || !data.tlbLadder.includes(data.tlbSlots)) {
    throw new Error(`paging: 첫 판의 칸 수 ${data.tlbSlots} 가 사다리에 없다`);
  }
}

export async function pagingAlgorithm(ctx: FacetContext<PagingData>): Promise<void> {
  const rctx = ctx as ReactiveContext<PagingData>;
  const data = ctx.data;
  checkData(data);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이 0 이어도 보낸다.
  const shown = { hits: 0, walks: 0, reads: 0 };
  let sentOnce = false;
  const showMetrics = (hits: number, walks: number, reads: number): void => {
    if (!sentOnce || hits !== shown.hits) ctx.metric('tlb-hits', hits - shown.hits);
    if (!sentOnce || walks !== shown.walks) ctx.metric('table-walks', walks - shown.walks);
    if (!sentOnce || reads !== shown.reads) ctx.metric('memory-reads', reads - shown.reads);
    shown.hits = hits;
    shown.walks = walks;
    shown.reads = reads;
    sentOnce = true;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let slots = data.tlbSlots;
  for (;;) {
    if (ctx.cancelled) return;
    const run = translateAll(data, slots);

    showMetrics(0, 0, 0);
    await ctx.emit({ type: 'run-start', payload: { slots } });
    if (!(await rctx.sleep(data.stepMs))) return;

    let hits = 0;
    let walks = 0;
    for (const step of run.steps) {
      if (ctx.cancelled) return;
      if (step.route === 'hit') {
        hits += 1;
        await phase('tlb-hit');
      } else {
        walks += 1;
        await phase('table-walk');
      }
      const n = step.index + 1;
      const reads = hits + 2 * walks;
      showMetrics(hits, walks, reads);
      await ctx.emit({
        type: 'translate',
        payload: { ...step, hits, walks, reads, hitRate: Math.floor((hits * 100 + Math.floor(n / 2)) / n) },
      });
      if (!(await rctx.sleep(data.stepMs))) return;
    }

    // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘리고, 사다리 밖의 값은 받지 않는다.
    let chosen: number | null = null;
    while (chosen === null) {
      if (ctx.cancelled) return;
      const input = await rctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type !== 'tlbSlots') continue;
      const payload = input.payload;
      if (typeof payload !== 'object' || payload === null) continue;
      const value = (payload as { value?: unknown }).value;
      if (typeof value !== 'number' || !data.tlbLadder.includes(value)) continue;
      chosen = value;
    }
    slots = chosen;
  }
}
