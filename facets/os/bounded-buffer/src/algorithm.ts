/**
 * bounded-buffer — 칸 수가 정해진 버퍼를 넣는 쪽과 꺼내는 쪽이 함께 쓰면 언제 막히는가.
 *
 * 규약 (사양 그대로):
 *   - 한 걸음 = 차례 한 칸. 차례는 데이터(`turns`)로 준다 — 돌림이 아니다.
 *   - 넣는 쪽 차례: 칸이 다 찼으면 막힌다. 그 물건은 넣지 않고 다음 차례에 같은 번호로 다시 해 본다.
 *     칸이 남았으면 손에 든 물건을 맨 뒤에 넣고, 손에는 다음 번호가 온다.
 *   - 꺼내는 쪽 차례: 먼저 넣은 것부터 꺼낸다 (FIFO). 비었으면 막힌다 (빈손).
 *   - 물건 번호는 `firstItem` 부터 하나씩 는다.
 *   - 차례에 넣는 쪽 · 꺼내는 쪽 말고 다른 식별자가 오면 던진다.
 *
 * 이벤트 (전부 silent 아님. 걸음 0 은 scene.initial 이 initialData 로 채운다):
 *   put          { turn: number, item: number, buffer: number[], hand: number }
 *                  turn 은 0 부터 센 차례 자리, buffer 는 넣은 뒤 앞(먼저 넣은 것)부터,
 *                  hand 는 넣는 쪽 손에 새로 온 번호
 *   putBlocked   { turn: number, item: number, buffer: number[] }
 *                  item 은 튕겨 나온 번호 (손에 그대로 남는다)
 *   take         { turn: number, item: number, buffer: number[] }
 *                  item 은 꺼낸 번호, buffer 는 꺼낸 뒤
 *   takeBlocked  { turn: number, buffer: number[] }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BoundedBufferFacetData = {
  type: 'bounded-buffer';
  /** 버퍼 칸 수 */
  capacity: number;
  /** 넣는 쪽 식별자 */
  producer: string;
  /** 꺼내는 쪽 식별자 */
  consumer: string;
  /** 차례 — 한 칸이 한 걸음 */
  turns: string[];
  /** 넣는 쪽이 처음 드는 물건 번호 */
  firstItem: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export async function boundedBuffer(
  context: FacetContext<BoundedBufferFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<BoundedBufferFacetData>;
  const { capacity, producer, consumer, turns, firstItem, stepMs } = ctx.data;

  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error(`bounded-buffer: 칸 수가 양의 정수가 아니다 (${String(capacity)})`);
  }
  if (!Number.isInteger(firstItem)) {
    throw new Error(`bounded-buffer: 첫 물건 번호가 정수가 아니다 (${String(firstItem)})`);
  }
  if (producer === consumer) {
    throw new Error(`bounded-buffer: 넣는 쪽과 꺼내는 쪽 식별자가 같다 (${producer})`);
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const buffer: number[] = [];
  let hand = firstItem;

  // 걸음 0 이 이미 읽을 화면(빈 버퍼 · 차례 줄)이라 첫 발신 앞에도 문을 둔다.
  for (let turn = 0; turn < turns.length; turn += 1) {
    if (!(await pause())) return;
    const who = turns[turn];
    if (who === producer) {
      if (buffer.length >= capacity) {
        await ctx.emit({
          type: 'putBlocked',
          payload: { turn, item: hand, buffer: [...buffer] },
        });
      } else {
        const item = hand;
        buffer.push(item);
        hand += 1;
        await ctx.emit({
          type: 'put',
          payload: { turn, item, buffer: [...buffer], hand },
        });
      }
    } else if (who === consumer) {
      const item = buffer.shift();
      if (item === undefined) {
        await ctx.emit({ type: 'takeBlocked', payload: { turn, buffer: [] } });
      } else {
        await ctx.emit({
          type: 'take',
          payload: { turn, item, buffer: [...buffer] },
        });
      }
    } else {
      throw new Error(`bounded-buffer: 차례 ${turn} 의 식별자를 모른다 (${String(who)})`);
    }
  }
}
