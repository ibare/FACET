/**
 * sequence-number — 받는 쪽은 어디까지 받았는지를 무엇으로 알리는가.
 *
 * 한 방향(보내는 쪽 → 받는 쪽)만 본다. 조각 다섯이 바이트 번호를 이어 받고, 도착 차례대로
 * 하나씩 받는 쪽에 닿는다. 닿을 때마다 받는 쪽은 확인 번호를 하나 돌려보낸다.
 *
 * 규약 (사양 그대로 — 하나라도 다르게 짜면 다른 수가 나온다)
 *   - 조각 i 의 seq = firstByte + 앞 조각 길이의 합. 조각 i 는 seq ~ seq + 길이 - 1 을 싣는다
 *   - 확인 번호 = **다음에 받기를 기대하는 바이트 번호** (누적 확인). "받은 끝" 이 아니다
 *   - 빈자리 뒤에 닿은 조각은 버리지 않고 쥐고 있다. 기대 번호에서 시작하는 조각을 쥐고
 *     있는 동안 확인 번호를 그 조각의 끝 다음으로 계속 옮긴다
 *   - 선택 확인(SACK) 없음 · 재전송 없음 · 타이머 없음 · 잃음 없음
 *   - 한 걸음 = 조각 하나가 닿고 그 확인 번호가 돌아가기까지. 시간은 걸음으로만 흐른다
 *
 * 첫 바이트 번호(1001) · 조각 길이 · 도착 차례는 **예로 정한 값**이다. 실제 TCP 의 첫 번호는
 * 무작위로 고른다. 무작위는 쓰지 않는다.
 *
 * 셈할 수 없는 상태는 던진다 (C6): 길이가 양의 정수가 아님 · 도착 차례가 조각 번호의
 * 순열이 아님 · 이미 확인한 바이트를 다시 받음.
 *
 * 이벤트
 *   arrive  (silent 아님, 도착마다 하나 — 걸음 1 ~ n)
 *     payload: {
 *       seg: number       닿은 조각 번호 (1 부터)
 *       before: number    닿기 전 확인 번호
 *       ack: number       돌려보내는 확인 번호 (다음에 기대하는 바이트)
 *       held: number[]    돌려보낸 뒤에도 빈자리 뒤에 쥐고 있는 조각 번호 (오름차순)
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (바이트 줄 · 확인 번호 = firstByte).
 * 걸음 0 에 읽을 것이 있어 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SequenceNumberFacetData = {
  type: 'sequence-number';
  stepMs: number;
  /** 첫 바이트 번호. 예로 정한 값 */
  firstByte: number;
  /** 조각 길이(바이트). 이 차례로 번호를 잇는다 */
  lengths: number[];
  /** 받는 쪽에 닿는 차례 (조각 번호, 1 부터) */
  arrival: number[];
};

/** 조각 하나가 싣는 바이트 범위. end 는 끝 다음 바이트 번호다 (from ~ end - 1) */
export type SegmentRange = { id: number; from: number; end: number };

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/**
 * 바탕 셈 — 조각마다 seq 범위. 알고리즘과 장면이 같은 함수를 부른다.
 * 모양이 틀리면 던진다.
 */
export function segmentRanges(firstByte: unknown, lengths: unknown): SegmentRange[] {
  if (!isPositiveInt(firstByte)) {
    throw new Error(`sequence-number: firstByte 가 양의 정수가 아니다 (${String(firstByte)})`);
  }
  if (!Array.isArray(lengths) || lengths.length === 0) {
    throw new Error('sequence-number: lengths 가 비었거나 배열이 아니다');
  }
  const out: SegmentRange[] = [];
  let seq = firstByte;
  lengths.forEach((len: unknown, i) => {
    if (!isPositiveInt(len)) {
      throw new Error(`sequence-number: 조각 ${i + 1} 의 길이가 양의 정수가 아니다 (${String(len)})`);
    }
    out.push({ id: i + 1, from: seq, end: seq + len });
    seq += len;
  });
  return out;
}

/** 도착 차례가 조각 번호 1..n 의 순열인지 본다. 아니면 던진다 */
export function checkArrival(arrival: unknown, count: number): number[] {
  if (!Array.isArray(arrival) || arrival.length !== count) {
    throw new Error(`sequence-number: arrival 은 조각 수(${count})만큼의 배열이어야 한다`);
  }
  const seen = new Set<number>();
  for (const id of arrival) {
    if (!isPositiveInt(id) || id > count) {
      throw new Error(`sequence-number: 모르는 조각 번호 (${String(id)})`);
    }
    if (seen.has(id)) throw new Error(`sequence-number: 조각 ${id} 가 두 번 닿는다`);
    seen.add(id);
  }
  return [...seen];
}

export async function sequenceNumber(
  context: FacetContext<SequenceNumberFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SequenceNumberFacetData>;
  const { stepMs } = ctx.data;
  const ranges = segmentRanges(ctx.data.firstByte, ctx.data.lengths);
  const order = checkArrival(ctx.data.arrival, ranges.length);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const got = new Set<number>();
  let ack = ranges[0]!.from;

  for (const id of order) {
    // 걸음 0 (바이트 줄) 도 읽을 틈이 있어야 해서 첫 도착 앞에도 문을 둔다
    if (!(await pause())) return;
    const seg = ranges[id - 1]!;
    if (seg.from < ack) {
      throw new Error(`sequence-number: 조각 ${id} (${seg.from}~) 는 이미 확인한 바이트다 (확인 번호 ${ack})`);
    }
    got.add(id);
    const before = ack;
    // 기대 번호에서 시작하는 조각을 쥐고 있는 동안 확인 번호를 그 끝으로 옮긴다
    const heldAtAck = (): SegmentRange | undefined =>
      ranges.find((r) => got.has(r.id) && r.from === ack);
    let next = heldAtAck();
    while (next) {
      if (ctx.cancelled) return;
      ack = next.end;
      next = heldAtAck();
    }
    const held = ranges.filter((r) => got.has(r.id) && r.from >= ack).map((r) => r.id);
    await ctx.emit({ type: 'arrive', payload: { seg: id, before, ack, held } });
  }
}
