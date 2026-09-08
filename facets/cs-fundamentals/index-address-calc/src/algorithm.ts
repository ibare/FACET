/**
 * indexAddressCalc — 번호가 곱셈을 거쳐 주소가 된다 (조각, S-piece).
 *
 * ── 이 조각이 답하는 질문
 * "번호로 자리를 어떻게 셈하는가."
 * 칸을 하나씩 훑어서 찾는 것이 아니라, 곱셈 한 번과 덧셈 한 번으로 자리에 닿는다.
 * 어느 번호를 넣어도 셈의 횟수는 같다 — 그래서 두 번째 번호를 한 번 더 넣어 보인다.
 *
 * ── 식별자
 * target 식별자를 쓰지 않는다. 좌표는 stage 가 전부 쥐고 있고, 이벤트가 건네는
 * 것은 셈의 재료 (번호 · 원소 크기 · 기준 주소) 와 그 결과뿐이다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장. silent 는 없다 — 모두 걸음의 경계다)
 *   memory-laid     { base: number; unit: number;
 *                     cells: { index: number; addr: number; value: number }[] }
 *                   기준 주소부터 원소 크기만큼 띄워 칸을 놓는다.
 *   index-asked     { index: number }
 *                   번호가 계산 레일 왼쪽 끝에 선다.
 *   offset-scaled   { index: number; unit: number; offset: number }
 *                   번호가 곱셈 관문을 지나 오프셋이 된다.
 *   address-formed  { base: number; offset: number; addr: number }
 *                   오프셋이 덧셈 관문을 지나 주소가 된다.
 *   cell-reached    { index: number; addr: number; value: number }
 *                   주소가 레일을 떠나 제 자리에 곧장 닿는다.
 *   rewind          payload 없음. 한 걸음 모드가 처음으로 되돌아간다.
 *   done            payload 없음. 자동 재생이 할 말을 마쳤다.
 *
 * ── 메커니즘
 * reactive. mount 즉시 스스로 재생하고, 마친 뒤에는 waitForInput 으로 'advance' 를
 * 받아 같은 걸음을 하나씩 되짚는다 (S-piece).
 *
 * ── 메트릭
 * 없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece / C5).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type IndexAddressCalcData = {
  type: string;
  /** 배열이 시작하는 기준 주소. */
  base: number;
  /** 원소 하나의 크기 (바이트). 자료형이 정한다 — int32 이므로 4. */
  unit: number;
  /** 칸에 놓인 값. 길이가 곧 칸의 수다. */
  values: number[];
  /** 자동 재생이 먼저 짚는 번호. */
  probeA: number;
  /** 두 번째로 짚는 번호. 셈이 번호에 따라 길어지지 않음을 보이기 위한 것. */
  probeB: number;
  /** 걸음 사이에 두는 읽을 시간 (ms). 저작 결정이므로 선언에 둔다. */
  stepMs: number;
};

type Cell = { index: number; addr: number; value: number };

/** addr(i) = base + i × unit — 이 조각이 말하려는 식 그 자체. */
function layOutCells(data: IndexAddressCalcData): Cell[] {
  return data.values.map((value, index) => ({
    index,
    addr: data.base + index * data.unit,
    value,
  }));
}

function clampIndex(raw: number, count: number): number {
  return Math.min(Math.max(0, Math.trunc(raw)), Math.max(0, count - 1));
}

/** 한 걸음 모드가 되짚는 걸음 수 — 번호 둘 × (선다 · 곱한다 · 더한다 · 닿는다). */
const MANUAL_STEPS = 8;

export async function indexAddressCalc(ctx: FacetContext<IndexAddressCalcData>): Promise<void> {
  const rc = ctx as ReactiveContext<IndexAddressCalcData>;
  const data = rc.data;
  const cells = layOutCells(data);
  if (cells.length === 0) return;

  const a = clampIndex(data.probeA, cells.length);
  const b = clampIndex(data.probeB, cells.length);
  const cellA = cells[a];
  const cellB = cells[b];
  const offsetA = a * data.unit;
  const offsetB = b * data.unit;

  /** 취소 검사와 읽을 시간을 한 줄로 묶는다 (S-piece). */
  const pause = async (): Promise<boolean> => (await rc.sleep(data.stepMs)) && !rc.cancelled;

  // ── 자동 재생. 걸음을 배열로 돌리지 않고 한 줄씩 편다 (C2: type 은 리터럴).

  await rc.emit({ type: 'memory-laid', payload: { base: data.base, unit: data.unit, cells } });
  if (!(await pause())) return;

  // 첫 번째 번호.
  await rc.emit({ type: 'index-asked', payload: { index: a } });
  if (!(await pause())) return;

  await rc.emit({ type: 'offset-scaled', payload: { index: a, unit: data.unit, offset: offsetA } });
  if (!(await pause())) return;

  await rc.emit({ type: 'address-formed', payload: { base: data.base, offset: offsetA, addr: cellA.addr } });
  if (!(await pause())) return;

  await rc.emit({ type: 'cell-reached', payload: { index: a, addr: cellA.addr, value: cellA.value } });
  if (!(await pause())) return;

  // 두 번째 번호. 같은 레일, 같은 두 번의 셈 — 멀다고 길어지지 않는다.
  await rc.emit({ type: 'index-asked', payload: { index: b } });
  if (!(await pause())) return;

  await rc.emit({ type: 'offset-scaled', payload: { index: b, unit: data.unit, offset: offsetB } });
  if (!(await pause())) return;

  await rc.emit({ type: 'address-formed', payload: { base: data.base, offset: offsetB, addr: cellB.addr } });
  if (!(await pause())) return;

  await rc.emit({ type: 'cell-reached', payload: { index: b, addr: cellB.addr, value: cellB.value } });
  if (!(await pause())) return;

  await rc.emit({ type: 'done' });

  // ── 한 걸음 모드. 자동 재생을 놓쳤거나 곱씹고 싶은 사람을 위한 것이라
  //    누르지 않아도 화면은 이미 할 말을 마쳤다 (S-piece).

  let cursor = 0;
  for (;;) {
    let signal: { type: string };
    try {
      signal = await rc.waitForInput();
    } catch {
      return; // reset / destroy 로 취소됨.
    }
    if (rc.cancelled) return;
    if (signal.type !== 'advance') continue;

    switch (cursor) {
      case 0:
        await rc.emit({ type: 'rewind' });
        await rc.emit({ type: 'index-asked', payload: { index: a } });
        break;
      case 1:
        await rc.emit({ type: 'offset-scaled', payload: { index: a, unit: data.unit, offset: offsetA } });
        break;
      case 2:
        await rc.emit({ type: 'address-formed', payload: { base: data.base, offset: offsetA, addr: cellA.addr } });
        break;
      case 3:
        await rc.emit({ type: 'cell-reached', payload: { index: a, addr: cellA.addr, value: cellA.value } });
        break;
      case 4:
        await rc.emit({ type: 'index-asked', payload: { index: b } });
        break;
      case 5:
        await rc.emit({ type: 'offset-scaled', payload: { index: b, unit: data.unit, offset: offsetB } });
        break;
      case 6:
        await rc.emit({ type: 'address-formed', payload: { base: data.base, offset: offsetB, addr: cellB.addr } });
        break;
      case 7:
        await rc.emit({ type: 'cell-reached', payload: { index: b, addr: cellB.addr, value: cellB.value } });
        break;
      default:
        break;
    }
    cursor = (cursor + 1) % MANUAL_STEPS;
  }
}
