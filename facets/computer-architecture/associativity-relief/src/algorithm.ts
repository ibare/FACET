/**
 * 연관도(associativity) — 한 자리에 여럿을 두면 덜 밀린다.
 *
 * 칸 수는 넷으로 고정하고 **묶는 법만** 바꾼다. 1-way 는 자리 넷에 하나씩,
 * 2-way 는 자리 둘에 둘씩이다. 같은 접근열을 두 번 굴려, 늘린 것이 하나도
 * 없는데 미스가 주는 것을 보인다.
 *
 * 1차 데이터는 칸 수 · 라인 크기 · 연관도 · 접근열뿐이다. 자리 수 · 인덱스 ·
 * 태그 · 히트/미스 · 축출은 전부 여기서 셈한다.
 *
 * ── 발신 이벤트 (facet 고유. 전부 걸음 경계라 silent 인 것이 없다)
 *
 *   regroup      { ways: number; sets: number }
 *       자리 짜임을 다시 긋는다. 칸은 그대로 두고 묶음만 바꾸며, 새 판이므로
 *       앉아 있던 것은 비운다. 첫 판의 짜임은 stage 가 initialData 로 이미
 *       그려 두었으므로 둘째 판부터 나간다.
 *
 *   cache-fill   { ways, step, addr, setIndex, wayIndex, occupied }
 *       빈 칸에 올린다. `occupied` 는 올리기 **전** 그 자리에 이미 앉아 있던
 *       칸의 수다. 0 보다 크면 아무도 밀어내지 않고 곁에 앉는 것이다.
 *
 *   cache-evict  { ways, step, addr, setIndex, wayIndex, victimAddr }
 *       자리가 꽉 차 앞서 온 것을 밀어내고 그 칸을 차지한다. `victimAddr` 는
 *       밀려나는 주소다.
 *
 *   cache-hit    { ways, step, addr, setIndex, wayIndex }
 *       찾는 것이 이미 그 자리에 앉아 있다.
 *
 *   done         { firstMisses: number; lastMisses: number }
 *       두 판의 미스 수. 화면의 셈은 이 둘로 맺는다.
 *
 *   rewind       payload 없음
 *       한 걸음씩 다시 보려고 처음으로 되감는다.
 *
 * ── 걸음
 *
 * 한 바퀴는 `ways` 순회다 — 첫 판의 접근 여섯, 자리 다시 묶기, 둘째 판의 접근
 * 여섯, 맺음. 걸음마다 `stepMs` 를 쉰다. 자동 재생이 끝나면 `advance` 를 받아
 * 처음으로 되감고 거기서부터 한 걸음씩 간다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type AssociativityReliefData = {
  type: 'associativity-relief';
  /** 라인 하나가 담는 바이트. 주소를 줄 번호로 바꾸는 나눗수다. */
  lineBytes: number;
  /** 캐시 전체의 칸 수. 연관도가 바뀌어도 이 수는 그대로다 — 그것이 이 조각의 주장이다. */
  totalLines: number;
  /** 견줄 연관도. 앞의 것부터 차례로 굴린다. */
  ways: number[];
  /** 접근할 주소. 두 판에 같은 열을 쓴다. */
  accesses: number[];
  /** 걸음 사이에 쉬는 시간 (ms). */
  stepMs: number;
};

/** 한 칸에 앉아 있는 것. `usedAt` 은 마지막으로 쓴 때 — 밀어낼 것을 고르는 자다. */
type Resident = { tag: number; addr: number; usedAt: number };

/** 걸음 사이의 문. 계속 가면 true, 취소됐으면 false. */
type Gate = () => Promise<boolean>;

/**
 * `advance` 가 올 때까지 기다린다. 취소되면 false.
 *
 * **받은 것의 종류를 본다** — 지금은 메커니즘이 reset/speed 를 스스로 처리하고
 * `advance` 만 흘려보내므로 안 걸러도 돌아가지만, 위젯 입력이 하나라도 붙는
 * 순간 그것까지 걸음으로 세게 된다 (S-piece).
 */
async function waitForAdvance(rc: ReactiveContext<AssociativityReliefData>): Promise<boolean> {
  for (;;) {
    if (rc.cancelled) return false;
    let event: ReactiveInputEvent;
    try {
      event = await rc.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
      // 올려 러너가 드러내게 둔다 (C8 정본).
      if (!rc.cancelled) throw err;
      return false;
    }
    if (rc.cancelled) return false;
    if (event.type === 'advance') return true;
  }
}

/**
 * 한 판의 접근을 차례로 굴리고 미스 수를 돌려준다.
 *
 * 자리 수는 `칸 수 ÷ 연관도`, 인덱스는 `줄 mod 자리 수`, 태그는 `줄 ÷ 자리 수` 다.
 * 연관도가 올라가면 자리 수가 줄어 인덱스 나눗수가 바뀌지만, 이 접근열에서는
 * 두 판 모두 0번 자리로 간다 — 달라지는 것은 그 자리가 몇을 담느냐뿐이다.
 */
async function playAccesses(
  rc: ReactiveContext<AssociativityReliefData>,
  data: AssociativityReliefData,
  gate: Gate,
  ways: number,
  sets: number,
): Promise<number> {
  const seats: (Resident | null)[][] = Array.from({ length: sets }, () =>
    Array.from({ length: ways }, () => null),
  );
  let clock = 0;
  let misses = 0;

  for (let step = 0; step < data.accesses.length; step += 1) {
    const addr = data.accesses[step]!;
    const line = Math.floor(addr / data.lineBytes);
    const setIndex = line % sets;
    const tag = Math.floor(line / sets);
    const seat = seats[setIndex]!;

    if (!(await gate())) return misses;
    clock += 1;

    const hitWay = seat.findIndex((r) => r !== null && r.tag === tag);
    if (hitWay >= 0) {
      seat[hitWay]!.usedAt = clock;
      await rc.emit({
        type: 'cache-hit',
        payload: { ways, step, addr, setIndex, wayIndex: hitWay },
      });
      if (rc.cancelled) return misses;
      continue;
    }

    misses += 1;

    const freeWay = seat.findIndex((r) => r === null);
    if (freeWay >= 0) {
      const occupied = seat.reduce((n, r) => (r === null ? n : n + 1), 0);
      seat[freeWay] = { tag, addr, usedAt: clock };
      await rc.emit({
        type: 'cache-fill',
        payload: { ways, step, addr, setIndex, wayIndex: freeWay, occupied },
      });
      if (rc.cancelled) return misses;
      continue;
    }

    // 빈 칸이 없다. 가장 오래 안 쓴 것을 밀어낸다 (LRU). 자리가 하나뿐이면
    // 고를 것도 없이 그 하나가 밀려난다 — 1-way 의 여섯 미스가 그것이다.
    let victimWay = 0;
    for (let w = 1; w < seat.length; w += 1) {
      if (seat[w]!.usedAt < seat[victimWay]!.usedAt) victimWay = w;
    }
    const victimAddr = seat[victimWay]!.addr;
    seat[victimWay] = { tag, addr, usedAt: clock };
    await rc.emit({
      type: 'cache-evict',
      payload: { ways, step, addr, setIndex, wayIndex: victimWay, victimAddr },
    });
    if (rc.cancelled) return misses;
  }

  return misses;
}

/** 한 바퀴 — 연관도마다 한 판씩 굴리고 두 판의 미스를 맞댄다. */
async function playRound(
  rc: ReactiveContext<AssociativityReliefData>,
  data: AssociativityReliefData,
  gate: Gate,
): Promise<boolean> {
  const misses: number[] = [];

  for (let round = 0; round < data.ways.length; round += 1) {
    const ways = Math.max(1, data.ways[round]!);
    const sets = Math.max(1, Math.floor(data.totalLines / ways));

    if (round > 0) {
      if (!(await gate())) return false;
      await rc.emit({ type: 'regroup', payload: { ways, sets } });
      if (rc.cancelled) return false;
    }

    misses.push(await playAccesses(rc, data, gate, ways, sets));
    if (rc.cancelled) return false;
  }

  if (!(await gate())) return false;
  await rc.emit({
    type: 'done',
    payload: { firstMisses: misses[0] ?? 0, lastMisses: misses[misses.length - 1] ?? 0 },
  });
  return !rc.cancelled;
}

export const associativityReliefAlgorithm = async (
  ctx: FacetContext<AssociativityReliefData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<AssociativityReliefData>;
  const data = ctx.data;

  /** 손으로 나아가는가. 첫 바퀴는 스스로 굴러가고, 끝난 뒤부터 한 걸음씩 간다. */
  let manual = false;
  /**
   * 이 바퀴의 첫 걸음은 문을 지나지 않는다 (S-piece). 문은 걸음 *사이*의 것이라
   * 첫 걸음 앞에는 기다릴 앞걸음이 없다 — 문을 먼저 두면 `stepMs` 만큼 빈 화면이
   * 보인 뒤에야 그림이 선다. 되감은 직후에도 같아서, 첫 `advance` 한 번이
   * 되감기와 첫 걸음을 함께 낸다.
   */
  let firstStep = true;

  const gate: Gate = async () => {
    if (firstStep) {
      firstStep = false;
      return !rc.cancelled;
    }
    if (manual) return await waitForAdvance(rc);
    return await rc.sleep(data.stepMs);
  };

  for (;;) {
    firstStep = true;
    if (!(await playRound(rc, data, gate))) return;

    // 한 바퀴가 끝났다. 여기서부터는 누르는 만큼만 간다.
    manual = true;
    if (!(await waitForAdvance(rc))) return;
    await rc.emit({ type: 'rewind' });
    if (rc.cancelled) return;
  }
};
