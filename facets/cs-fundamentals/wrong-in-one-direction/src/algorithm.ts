/**
 * wrong-in-one-direction — 블룸 필터의 답을 믿는 법 (조각).
 *
 * 이미 다 채워진 비트 배열에 **묻기만** 한다. 넣는 장면은 이 조각의 일이 아니다.
 * 한 낱말의 자리 셋을 차례로 짚다가 꺼진 자리를 만나면 거기서 멈춘다.
 *
 * 자리는 선언에서 받지 않고 여기서 셈한다 — 이중 해싱 `h_i = (h1 + i·h2) mod m`.
 * 선언이 주는 것은 낱말별 `h1` · `h2` 와 시작 비트열뿐이다.
 *
 * ## 이벤트 — 전부 이 facet 고유 확장. silent 는 없다 (모두 시각 변화가 있다).
 *
 * | type        | payload | 뜻 |
 * |-------------|---------|----|
 * | `probe`     | `{ word: string; probeIndex: number; slots: number[]; slot: number; bit: number }` | 자리 하나를 짚었다. `bit` 이 0 이면 여기서 막힌다 |
 * | `verdict`   | `{ word: string; present: boolean; truth: boolean; blockedSlot: number }` | 답을 냈다. `present` 면 `blockedSlot` 은 -1. `truth` 는 실제로 넣었는지 |
 * | `attribute` | `{ word: string; slots: number[]; owners: string[] }` | 그 자리들을 켠 것이 누구였는지. `owners[i]` 는 `slots[i]` 를 켠 낱말 (없으면 빈 문자열) |
 * | `rewind`    | `{}` | 처음으로 되감는다 (자동 재생을 마친 뒤 첫 `advance`) |
 * | `done`      | `{}` | 넷을 다 물었다 |
 *
 * 메트릭은 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WordHash = { h1: number; h2: number };

export type WrongInOneDirectionData = {
  type: 'wrong-in-one-direction';
  /** 비트 배열의 길이 m. */
  slotCount: number;
  /** 해시 수 k. */
  hashCount: number;
  /** 이미 채워진 상태의 비트열. '0' / '1' 문자 slotCount 개. */
  bits: string;
  /** 이 필터에 넣은 것. 비트열은 이 셋이 만든 것이다. */
  inserted: string[];
  /** 물어볼 것. 이 순서로 묻는다. */
  queries: string[];
  /** 낱말별 두 해시. h1 = Java String.hashCode & 0x7FFFFFFF, h2 = FNV-1a 32bit & 0x7FFFFFFF 를 홀수로 (| 1). */
  hashes: Record<string, WordHash | undefined>;
  /** 걸음 하나가 끝난 뒤의 정지 시간(ms). */
  stepMs: number;
};

/** 이중 해싱 — h_i = (h1 + i·h2) mod m. */
function slotsOf(data: WrongInOneDirectionData, word: string): number[] {
  const h = data.hashes[word];
  if (h === undefined) return [];
  const out: number[] = [];
  for (let i = 0; i < data.hashCount; i += 1) {
    out.push((h.h1 + i * h.h2) % data.slotCount);
  }
  return out;
}

function bitAt(data: WrongInOneDirectionData, slot: number): number {
  return data.bits[slot] === '1' ? 1 : 0;
}

/**
 * 자리마다 그 자리를 켠 낱말을 찾는다.
 *
 * 한 자리를 둘이 켤 수 있으므로(자리 2 는 kiwi 와 mango 가 함께 켠다) 넣은 순서가
 * 앞선 것을 답으로 삼는다. 이 조각이 묻는 것은 "누가 켰는가" 가 아니라 "켠 것이
 * 이 낱말이 아니다" 이므로 하나만 대면 족하다.
 */
function ownersOf(data: WrongInOneDirectionData, slots: number[]): string[] {
  const lit = new Map<number, string>();
  for (const word of data.inserted) {
    for (const slot of slotsOf(data, word)) {
      if (!lit.has(slot)) lit.set(slot, word);
    }
  }
  return slots.map((slot) => lit.get(slot) ?? '');
}

export async function wrongInOneDirectionAlgorithm(
  ctx: FacetContext<WrongInOneDirectionData>,
): Promise<void> {
  const rx = ctx as ReactiveContext<WrongInOneDirectionData>;
  const data = ctx.data;

  /** 스스로 나아가는 중인가, `advance` 로 한 걸음씩 짚는 중인가. */
  let auto = true;
  /** 다음 문을 그냥 지나게 한다 — 마운트 직후와 되감은 직후의 첫 걸음 (S-piece). */
  let freePass = true;

  /** 걸음 사이의 문. 취소되면 false. */
  async function gate(): Promise<boolean> {
    if (freePass) {
      freePass = false;
      return true;
    }
    if (auto) return rx.sleep(data.stepMs);
    for (;;) {
      const input = await rx.waitForInput();
      // 받은 것의 종류를 본다 — 위젯 입력이 걸음으로 세어지지 않게 (S-piece).
      if (input.type === 'advance') return !rx.cancelled;
    }
  }

  /** 넷을 차례로 묻는다. 순서는 데이터가 정한다 — 걸음표를 손으로 적지 않는다 (C2). */
  async function walk(): Promise<void> {
    for (const word of data.queries) {
      const slots = slotsOf(data, word);
      let blockedSlot = -1;

      for (let i = 0; i < slots.length; i += 1) {
        if (!(await gate())) return;
        const slot = slots[i];
        const bit = bitAt(data, slot);
        await ctx.emit({ type: 'probe', payload: { word, probeIndex: i, slots, slot, bit } });
        if (bit === 0) {
          blockedSlot = slot;
          break;
        }
      }

      const present = blockedSlot < 0;
      const truth = data.inserted.includes(word);
      if (!(await gate())) return;
      await ctx.emit({ type: 'verdict', payload: { word, present, truth, blockedSlot } });

      // 넣은 적 없는데 "있다" 가 나왔을 때에만, 그 자리를 켠 것이 누구였는지 밝힌다.
      // 이 한 걸음이 이 조각의 논증이 서는 자리다.
      if (present && !truth) {
        if (!(await gate())) return;
        await ctx.emit({ type: 'attribute', payload: { word, slots, owners: ownersOf(data, slots) } });
      }
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done', payload: {} });
  }

  await walk();

  // 자동 재생이 끝났다. 처음 누르는 advance 는 되감고 첫 걸음까지 간다 (S-piece).
  while (!ctx.cancelled) {
    const input = await rx.waitForInput();
    if (input.type !== 'advance') continue;
    auto = false;
    freePass = true;
    await ctx.emit({ type: 'rewind', payload: {} });
    await walk();
  }
}
