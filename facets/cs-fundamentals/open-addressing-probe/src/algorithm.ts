/**
 * open-addressing-probe — 조각(piece) 알고리즘.
 *
 * 질문 하나: 제 자리가 차 있으면 열쇠는 어디에 앉는가?
 * 사슬을 달지 않고 표 안에서만 해결한다 — 한 칸 옆을 보고, 거기도 차 있으면
 * 또 한 칸 옆을 본다. 빈 자리를 만날 때까지 옆으로 밀려간다.
 *
 * 자리 계산은 데이터의 hash 값에서 알고리즘이 직접 구한다 (선형 탐사):
 *   home = (hash & 0x7FFFFFFF) % size
 *   next = (slot + 1) % size
 * 화면에 뜨는 자리 번호는 전부 이 계산의 결과이므로 지어낸 값이 없다 (S-piece).
 * hash 는 Java String.hashCode 실측값이며 facet.ts 의 initialData 에 있다.
 *
 * ── 식별자
 *   index:<n>   버킷 번호 (0 .. size-1)
 *
 * ── 이벤트 (facet 고유 확장, C2)
 *   key-arrive   target index:<home>
 *                payload { key: string; hash: number; home: number }
 *                열쇠가 제 자리 위에 도착한다.
 *   probe-step   target [index:<from>, index:<to>]
 *                payload { key: string; from: number; to: number; holder: string }
 *                from 이 holder 에게 차 있다 → 한 칸 옆(to)으로 밀려간다.
 *   key-seated   target index:<slot>
 *                payload { key: string; home: number; slot: number; probes: number }
 *                빈 자리를 만나 앉는다.
 *   spill-noted  target index:<slot>
 *                payload { key: string; home: number; slot: number; blocker: string }
 *                제 자리를 차지한 것조차 밀려온 열쇠였다 — 충돌이 번진 자리.
 *   rewind       payload 없음
 *                빈 표로 되돌린다. advance 로 다시 짚어 보기 직전에 발신.
 *   done         payload 없음 (표준 이벤트)
 *
 * silent 이벤트는 없다 — 모든 걸음이 화면을 바꾼다.
 * 메트릭은 부르지 않는다 (조각, S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 넣을 열쇠 하나. hash 는 Java String.hashCode 실측값. */
export type ProbeKey = {
  key: string;
  hash: number;
};

export type OpenAddressingProbeData = {
  type: 'open-addressing-probe';
  /** 버킷 수. 자리 = (hash & 0x7FFFFFFF) % size */
  size: number;
  /** 넣는 차례 */
  keys: ProbeKey[];
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 680;
const HASH_MASK = 0x7fffffff;

/** 한 걸음을 나아가도 되는지 묻는 문. false 면 중단 (취소되었거나 입력이 끊겼다). */
type Gate = () => Promise<boolean>;

function homeSlotOf(hash: number, size: number): number {
  return (hash & HASH_MASK) % size;
}

/**
 * 네 열쇠를 차례로 넣는 한 벌. 자동 재생과 한 걸음씩 짚어 보기가 같은 몸을
 * 쓰고, 걸음 사이의 대기만 gate 로 갈린다.
 */
async function runSequence(
  ctx: ReactiveContext<OpenAddressingProbeData>,
  gate: Gate,
): Promise<boolean> {
  const size = ctx.data.size;
  if (size <= 0) return true;

  const table: (string | null)[] = new Array<string | null>(size).fill(null);
  const homeOf = new Map<string, number>();
  const seats: { key: string; home: number; slot: number }[] = [];

  for (const entry of ctx.data.keys) {
    const home = homeSlotOf(entry.hash, size);
    homeOf.set(entry.key, home);

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'key-arrive',
      target: `index:${home}`,
      payload: { key: entry.key, hash: entry.hash, home },
    });

    let slot = home;
    let probes = 0;
    while (table[slot] !== null) {
      // 표가 가득 찬 경우는 이 조각의 데이터에서 일어나지 않지만, 한 바퀴를
      // 다 돌면 멈춘다 — 빈 자리가 없으면 개방 주소법은 할 말이 없다.
      if (probes >= size) return true;
      const holder = table[slot] ?? '';
      const next = (slot + 1) % size;

      if (!(await gate())) return false;
      await ctx.emit({
        type: 'probe-step',
        target: [`index:${slot}`, `index:${next}`],
        payload: { key: entry.key, from: slot, to: next, holder },
      });
      slot = next;
      probes += 1;
    }

    table[slot] = entry.key;
    seats.push({ key: entry.key, home, slot });

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'key-seated',
      target: `index:${slot}`,
      payload: { key: entry.key, home, slot, probes },
    });
  }

  // 남의 충돌이 번진 자리를 찾는다 — 제 자리에 앉아 있는 것조차 제 자리가
  // 아닌 열쇠라면, 이 열쇠는 자기와 부딪힌 적 없는 충돌 때문에 밀려난 것이다.
  const spill = seats.find((s) => {
    if (s.slot === s.home) return false;
    const blocker = table[s.home];
    if (blocker === null) return false;
    return homeOf.get(blocker) !== s.home;
  });

  if (spill !== undefined) {
    if (!(await gate())) return false;
    await ctx.emit({
      type: 'spill-noted',
      target: `index:${spill.slot}`,
      payload: {
        key: spill.key,
        home: spill.home,
        slot: spill.slot,
        blocker: table[spill.home] ?? '',
      },
    });
  }

  if (!(await gate())) return false;
  await ctx.emit({ type: 'done' });
  return true;
}

export const openAddressingProbe = async (
  ctxIn: FacetContext<OpenAddressingProbeData>,
): Promise<void> => {
  const ctx = ctxIn as ReactiveContext<OpenAddressingProbeData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  const autoGate: Gate = () => ctx.sleep(stepMs);
  const pressGate: Gate = async () => {
    try {
      await ctx.waitForInput();
    } catch {
      // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다.
      return false;
    }
    return !ctx.cancelled;
  };

  if (!(await runSequence(ctx, autoGate))) return;

  // 자동 재생은 끝났다. 곱씹으며 짚어 보려는 사람을 기다린다 (S-piece) —
  // 첫 누름이 표를 비우고, 그 다음 누름부터 한 걸음씩 나아간다.
  for (;;) {
    if (!(await pressGate())) return;
    await ctx.emit({ type: 'rewind' });
    if (!(await runSequence(ctx, pressGate))) return;
  }
};
