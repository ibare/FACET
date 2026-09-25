/**
 * transfer-without-cpu — 장치의 낱말이 CPU 를 거치지 않고 메모리로 옮겨지는 동안 CPU 는 제 일을 한다.
 *
 * 한 걸음 = 한 틱. 옮기는 걸음마다 제어기와 CPU 가 **함께** 한 칸씩 나아간다 — 한쪽을
 * 먼저 다 돌리고 다른 쪽을 돌리지 않는다.
 *
 * 이벤트 (차례대로)
 *   init       silent: true  { words: number[]; slots: number[]; job: number[] }
 *              — 장치 버퍼의 낱말, 받을 메모리 주소(첫 주소부터 낱말 수만큼), CPU 가 더해 갈 수들.
 *                걸음 0 을 갈아 끼운다
 *   program    { addr: number; count: number; direction: 'deviceToMemory' }
 *              — CPU 가 제어기에 세 값을 적는다. CPU 가 옮기기에 쓰는 유일한 걸음
 *   move       { index: number; slot: number; to: number; word: number;
 *                addr: number; count: number; add: number; sum: number }
 *              — 제어기가 장치의 index 번째 낱말을 메모리 주소 to(slot 번째 칸)에 넣고
 *                주소를 addr 로 올리고 개수를 count 로 줄인다. 같은 틱에 CPU 는 add 를 더해 합이 sum
 *   interrupt  { calls: number } — 개수가 0 이 되어 제어기가 CPU 를 부른다. calls 는 지금까지 부른 수
 *   ack        { moved: number; calls: number }
 *              — CPU 가 끝났음을 받아 적는다. moved 는 제어기가 옮긴 낱말 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TransferDirection = 'deviceToMemory';

export type TransferWithoutCpuFacetData = {
  type: 'transfer-without-cpu';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 장치 버퍼의 낱말, 차례대로 */
  words: number[];
  /** 받을 메모리 첫 주소 */
  destStart: number;
  /** CPU 가 그동안 차례로 더해 가는 수 */
  job: number[];
  /** 제어기에 적는 방향 */
  direction: TransferDirection;
};

function isIntList(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));
}

/** 자료를 좁힌다. 셈할 수 없는 모양이면 던진다 (C6). */
export function readTransferData(raw: unknown): TransferWithoutCpuFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('transfer-without-cpu: 자료가 없다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'transfer-without-cpu') throw new Error(`transfer-without-cpu: type 이 다르다 — ${String(d.type)}`);
  if (typeof d.stepMs !== 'number' || !(d.stepMs >= 0)) throw new Error('transfer-without-cpu: stepMs 가 수가 아니다');
  if (!isIntList(d.words) || d.words.length === 0) throw new Error('transfer-without-cpu: words 는 정수 낱말 하나 이상');
  if (typeof d.destStart !== 'number' || !Number.isInteger(d.destStart) || d.destStart < 0) {
    throw new Error('transfer-without-cpu: destStart 는 0 이상의 정수');
  }
  if (!isIntList(d.job)) throw new Error('transfer-without-cpu: job 은 정수 목록');
  if (d.job.length !== d.words.length) {
    throw new Error(
      `transfer-without-cpu: CPU 의 수(${d.job.length})와 옮길 낱말(${d.words.length})의 개수가 달라 나란히 끝나지 않는다`,
    );
  }
  if (d.direction !== 'deviceToMemory') {
    throw new Error(`transfer-without-cpu: 모르는 방향 — ${String(d.direction)}`);
  }
  return {
    type: 'transfer-without-cpu',
    stepMs: d.stepMs,
    words: [...d.words],
    destStart: d.destStart,
    job: [...d.job],
    direction: d.direction,
  };
}

export async function transferWithoutCpu(
  context: FacetContext<TransferWithoutCpuFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<TransferWithoutCpuFacetData>;
  const data = readTransferData(ctx.data);
  const { words, destStart, job, direction, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const slots = words.map((_, i) => destStart + i);
  await ctx.emit({ type: 'init', silent: true, payload: { words: [...words], slots, job: [...job] } });
  // 걸음 0 은 이미 읽을 것(장치 낱말 · 빈 메모리 · CPU 합)이 있는 화면이라 한 번 머문다
  if (!(await pause())) return;

  // 걸음 1 — CPU 가 제어기에 세 값을 적는다
  let addr = destStart;
  let count = words.length;
  await ctx.emit({ type: 'program', payload: { addr, count, direction } });

  // 옮기는 걸음 — 제어기와 CPU 가 한 틱에 한 칸씩
  let src = 0;
  let sum = 0;
  let calls = 0;
  while (count > 0) {
    if (!(await pause())) return;
    const word = words[src];
    const add = job[src];
    if (word === undefined || add === undefined) {
      throw new Error(`transfer-without-cpu: ${src} 번째 낱말 또는 CPU 의 수가 없다`);
    }
    const to = addr;
    const slot = to - destStart;
    addr += 1;
    count -= 1;
    sum += add;
    await ctx.emit({
      type: 'move',
      payload: { index: src, slot, to, word, addr, count, add, sum },
    });
    src += 1;
  }

  // 개수가 0 이 된 다음 걸음 — 제어기가 CPU 를 부른다
  if (!(await pause())) return;
  calls += 1;
  await ctx.emit({ type: 'interrupt', payload: { calls } });

  // 그다음 걸음 — CPU 가 받아 적는다
  if (!(await pause())) return;
  await ctx.emit({ type: 'ack', payload: { moved: src, calls } });
}
