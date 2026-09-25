/**
 * 엘리베이터(LOOK) — 온 차례로 서 있던 디스크 요청을 팔이 가는 방향의 자리 차례로 받는다.
 *
 * 규약
 * - 가던 방향 쪽에 남은 요청 가운데 팔에서 가장 가까운 것을 받는다
 * - 가던 쪽에 남은 요청이 없으면 돌아선다. 끝 실린더까지 가지 않는다
 * - 앞/뒤 판정 = (요청 − 팔) × 방향 > 0 이면 앞
 * - 새 요청은 시각이 아니라 **받은 요청의 수**(`after`)로 온다
 * - 팔 자리와 같은 요청 · 같은 실린더 두 요청 · 범위 밖 실린더는 던진다
 *
 * 걸음 0 은 `initialData` 에서 장면이 직접 세운다 (팔 · 방향 · 온 차례 줄). init 발신은 없다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음)
 * - `serve`  { id: number; cyl: number; from: number; order: number }
 *            id = 온 차례 번호(0 부터), cyl = 받은 실린더, from = 팔이 떠난 실린더, order = 받은 차례(1 부터)
 * - `arrive` { arm: number; dir: 1 | -1; requests: { id: number; cyl: number; ahead: boolean }[] }
 *            새 요청이 온다. ahead 는 그때 팔 기준 앞/뒤 판정
 * - `turn`   { at: number; dir: 1 | -1 }
 *            가던 쪽에 남은 요청이 없어 돌아선다. dir 은 돌아선 뒤의 방향
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ElevatorArrival = { after: number; requests: number[] };

export type ElevatorSweepFacetData = {
  type: 'elevator-sweep';
  stepMs: number;
  /** 실린더 수. 번호는 0..cylinders-1 */
  cylinders: number;
  /** 팔의 처음 자리 */
  start: number;
  /** 1 = 큰 번호 쪽, -1 = 작은 번호 쪽 */
  direction: number;
  /** 처음 줄 (온 차례) */
  queue: number[];
  /** 받은 요청 수가 after 가 된 직후 오는 요청들 (온 차례) */
  arrivals: ElevatorArrival[];
};

type Pending = { id: number; cyl: number };

function checkCylinder(cyl: number, cylinders: number, where: string): void {
  if (!Number.isInteger(cyl) || cyl < 0 || cyl >= cylinders) {
    throw new Error(`elevatorSweep: ${where} 의 실린더 ${cyl} 이 0..${cylinders - 1} 밖이다`);
  }
}

export async function elevatorSweep(context: FacetContext<ElevatorSweepFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ElevatorSweepFacetData>;
  const { stepMs, cylinders, start, direction, queue, arrivals } = ctx.data;

  if (direction !== 1 && direction !== -1) {
    throw new Error(`elevatorSweep: 방향 ${direction} 은 1 또는 -1 이어야 한다`);
  }
  checkCylinder(start, cylinders, '팔의 처음 자리');

  const byCount = new Map<number, number[]>();
  for (const a of arrivals) {
    if (!Number.isInteger(a.after) || a.after < 1) {
      throw new Error(`elevatorSweep: after ${a.after} 는 1 이상의 정수여야 한다`);
    }
    if (byCount.has(a.after)) throw new Error(`elevatorSweep: after ${a.after} 가 두 번 적혔다`);
    byCount.set(a.after, a.requests);
  }

  const seen = new Set<number>();
  const pending: Pending[] = [];
  let nextId = 0;
  function admit(cyl: number, where: string): Pending {
    checkCylinder(cyl, cylinders, where);
    if (seen.has(cyl)) throw new Error(`elevatorSweep: 실린더 ${cyl} 에 요청이 둘이다 — 규약이 따로 필요하다`);
    seen.add(cyl);
    const req = { id: nextId, cyl };
    nextId += 1;
    pending.push(req);
    return req;
  }
  for (const cyl of queue) admit(cyl, '처음 줄');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let arm = start;
  let dir: 1 | -1 = direction;
  let order = 0;

  while (pending.length > 0) {
    // 걸음 0 이 이미 읽을 줄을 보이므로 첫 발신 앞에도 문을 둔다
    if (!(await pause())) return;
    if (pending.some((r) => r.cyl === arm)) {
      throw new Error(`elevatorSweep: 팔 자리 ${arm} 에 요청이 있다 — 규약이 따로 필요하다`);
    }
    const ahead = pending.filter((r) => (r.cyl - arm) * dir > 0);
    if (ahead.length === 0) {
      dir = dir === 1 ? -1 : 1;
      await ctx.emit({ type: 'turn', payload: { at: arm, dir } });
      continue;
    }
    let pick = ahead[0];
    for (const r of ahead) {
      if (pick === undefined || Math.abs(r.cyl - arm) < Math.abs(pick.cyl - arm)) pick = r;
    }
    if (pick === undefined) throw new Error('elevatorSweep: 앞쪽 요청을 고르지 못했다');
    const chosen = pick;
    pending.splice(pending.indexOf(chosen), 1);
    order += 1;
    await ctx.emit({ type: 'serve', payload: { id: chosen.id, cyl: chosen.cyl, from: arm, order } });
    arm = chosen.cyl;

    const incoming = byCount.get(order);
    if (incoming !== undefined) {
      if (!(await pause())) return;
      const requests = incoming.map((cyl) => {
        const req = admit(cyl, `차례 ${order} 뒤 새 요청`);
        if (cyl === arm) throw new Error(`elevatorSweep: 새 요청 ${cyl} 이 팔 자리와 같다`);
        return { id: req.id, cyl, ahead: (cyl - arm) * dir > 0 };
      });
      await ctx.emit({ type: 'arrive', payload: { arm, dir, requests } });
    }
  }

  const unused = [...byCount.keys()].filter((after) => after > order);
  if (unused.length > 0) {
    throw new Error(`elevatorSweep: after ${unused.join(', ')} 에 이르기 전에 줄이 비었다 — 새 요청이 오지 못했다`);
  }
}
