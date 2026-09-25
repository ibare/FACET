/**
 * page-table-lookup — 가상 주소가 페이지 번호와 오프셋으로 갈라지고, 앞쪽만 페이지 표를
 * 거쳐 프레임 번호로 바뀐 뒤 그대로 둔 오프셋과 다시 붙는다.
 *
 * 값은 모두 예로 정한 것이다 (페이지 표 · 주소 셋). 실제 시스템에서 잰 것이 아니다.
 *
 * 규약
 *   - 주소는 addressBits 비트, 페이지 크기는 pageSize (4 KiB = 0x1000).
 *     페이지 번호 = 주소 ÷ pageSize 의 몫, 오프셋 = 나머지.
 *     16비트 · 4 KiB 에서는 맨 앞 16진 한 자리가 페이지 번호, 뒤 세 자리가 오프셋이다.
 *   - 실제 주소 = 프레임 번호 × pageSize + 오프셋.
 *   - 표의 줄은 모두 메모리에 있다. 표에 없는 페이지는 셈할 수 없으니 던진다 (page-fault 의 일).
 *   - 주소 하나에 걸음 셋: 갈라짐(split) · 표 줄에서 바뀜(lookup) · 다시 붙음(join).
 *
 * 이벤트 (모두 silent 아님)
 *   split   payload { index: number; address: number; page: number; offset: number }
 *           — index 번째 주소가 페이지 번호와 오프셋으로 갈라진다
 *   lookup  payload { index: number; page: number; frame: number; offset: number }
 *           — 표의 page 줄에서 프레임 번호를 얻는다
 *   join    payload { index: number; page: number; frame: number; offset: number; physical: number }
 *           — 프레임 번호와 손대지 않은 오프셋이 붙어 실제 주소가 된다
 *
 * 걸음 0 은 장면의 initial() 이 initialData(표 · 주소)에서 세운다. 읽을 것이 있는 화면이라
 * 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PageTableRow = { page: number; frame: number };

export type PageTableLookupFacetData = {
  type: 'page-table-lookup';
  stepMs: number;
  /** 주소의 비트 수. 16진 자릿수로 나누어떨어져야 한다 */
  addressBits: number;
  /** 페이지 크기 (바이트). 16 의 거듭제곱이어야 한다 */
  pageSize: number;
  /** 한 프로세스의 페이지 표 — 페이지 번호 → 프레임 번호 */
  table: PageTableRow[];
  /** 번역할 가상 주소, 이 차례로 */
  addresses: number[];
};

/** 데이터가 셈할 수 있는 모양인지 본다. 아니면 던진다 (C6). */
export function checkPageTableData(data: PageTableLookupFacetData): void {
  const { addressBits, pageSize, table, addresses } = data;
  if (!Number.isInteger(addressBits) || addressBits <= 0 || addressBits % 4 !== 0) {
    throw new Error(`page-table-lookup: addressBits ${String(addressBits)} 는 4 의 배수가 아니다`);
  }
  const offsetDigits = Math.log(pageSize) / Math.log(16);
  if (!Number.isInteger(pageSize) || Math.abs(offsetDigits - Math.round(offsetDigits)) > 1e-9 || pageSize < 16) {
    throw new Error(`page-table-lookup: pageSize ${String(pageSize)} 는 16 의 거듭제곱이 아니다`);
  }
  const space = 2 ** addressBits;
  if (pageSize >= space) {
    throw new Error('page-table-lookup: pageSize 가 주소 공간보다 크다');
  }
  const pages = space / pageSize;
  const seen = new Set<number>();
  for (const row of table) {
    if (!Number.isInteger(row.page) || row.page < 0 || row.page >= pages) {
      throw new Error(`page-table-lookup: 페이지 ${String(row.page)} 가 범위 밖이다`);
    }
    if (!Number.isInteger(row.frame) || row.frame < 0 || row.frame >= pages) {
      throw new Error(`page-table-lookup: 프레임 ${String(row.frame)} 가 범위 밖이다`);
    }
    if (seen.has(row.page)) throw new Error(`page-table-lookup: 페이지 ${row.page} 가 표에 두 번 있다`);
    seen.add(row.page);
  }
  for (const a of addresses) {
    if (!Number.isInteger(a) || a < 0 || a >= space) {
      throw new Error(`page-table-lookup: 주소 ${String(a)} 가 주소 공간 밖이다`);
    }
  }
}

export async function pageTableLookup(
  ctx0: FacetContext<PageTableLookupFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<PageTableLookupFacetData>;
  const data = ctx.data;
  checkPageTableData(data);
  const { stepMs, pageSize, table, addresses } = data;
  const frameOf = new Map<number, number>(table.map((r) => [r.page, r.frame]));

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (const [index, address] of addresses.entries()) {
    if (!(await pause())) return;
    const page = Math.floor(address / pageSize);
    const offset = address % pageSize;
    await ctx.emit({ type: 'split', payload: { index, address, page, offset } });

    if (!(await pause())) return;
    const frame = frameOf.get(page);
    if (frame === undefined) {
      throw new Error(`page-table-lookup: 페이지 ${page} 가 표에 없다 (주소 ${address})`);
    }
    await ctx.emit({ type: 'lookup', payload: { index, page, frame, offset } });

    if (!(await pause())) return;
    const physical = frame * pageSize + offset;
    await ctx.emit({ type: 'join', payload: { index, page, frame, offset, physical } });
  }
}
