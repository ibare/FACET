/**
 * 2차 기회 (시계 알고리즘) — 바늘이 칸을 돌며 표시를 지우고, 표시 없는 칸에서 내보낸다.
 *
 * 값은 모두 예로 정한 것이다. 칸 넷 · 처음 페이지와 표시 · 참조 넷은 실제 시스템에서 잰 것이 아니다.
 *
 * 규약 (사양 그대로):
 *   - 칸은 0 → 1 → 2 → 3 → 0 차례로 돈다. 바늘은 한 방향으로만 간다.
 *   - 적중 = 참조한 페이지가 어느 칸에 있다. 그 칸의 표시를 1 로. 바늘은 움직이지 않는다. 한 걸음.
 *   - 폴트 = 어느 칸에도 없다. 알아채는 한 걸음 뒤, 바늘 자리부터 짚는다 — 짚은 칸마다 한 걸음.
 *     표시 1 이면 0 으로 지우고 다음 칸으로. 표시 0 이면 그 페이지를 내보내고 새 페이지를
 *     그 칸에 표시 1 로 넣고 바늘은 그다음 칸으로 (이것이 마지막 짚음).
 *   - 바늘이 두 바퀴를 돌고도 멈추지 않으면 셈할 수 없는 상태라 던진다.
 *
 * 이벤트 (전부 silent 아님 — 한 이벤트가 한 걸음):
 *   'hit'   payload { ref: number; page: number; slot: number }
 *           ref 번째 참조가 slot 칸의 page 에 적중. 그 칸 표시가 1 이 된다.
 *   'miss'  payload { ref: number; page: number }
 *           ref 번째 참조 page 가 어느 칸에도 없다. 바늘이 돌기 시작한다.
 *   'spare' payload { slot: number; page: number; next: number }
 *           바늘이 slot 칸(page)을 짚었다. 표시 1 → 0 으로 지우고 바늘은 next 칸으로.
 *   'evict' payload { slot: number; out: number; page: number; next: number }
 *           바늘이 slot 칸(out)을 짚었다. 표시 0 → out 을 내보내고 page 를 표시 1 로 넣는다.
 *           바늘은 next 칸으로.
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 채운다 (칸 넷 · 바늘 · 참조).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SecondChanceSlot = { page: number; bit: 0 | 1 };

export type SecondChanceFacetData = {
  type: 'second-chance';
  stepMs: number;
  /** 돌아가는 차례대로 칸. 칸 번호 = 배열 자리 */
  slots: SecondChanceSlot[];
  /** 바늘이 처음 가리키는 칸 */
  hand: number;
  /** 참조되는 페이지, 이 차례로 */
  refs: number[];
};

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** 자료를 좁힌다. 모르는 모양은 조용히 넘기지 않고 던진다. */
export function readSecondChanceData(raw: unknown): SecondChanceFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('second-chance: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'second-chance') throw new Error('second-chance: type 이 다르다');
  if (!isInt(d.stepMs) || d.stepMs <= 0) throw new Error('second-chance: stepMs 가 양의 정수가 아니다');
  if (!Array.isArray(d.slots) || d.slots.length === 0) {
    throw new Error('second-chance: slots 가 비었거나 배열이 아니다');
  }
  const slots: SecondChanceSlot[] = d.slots.map((s: unknown, i: number) => {
    if (typeof s !== 'object' || s === null) throw new Error(`second-chance: 칸 ${i} 모양이 틀렸다`);
    const o = s as Record<string, unknown>;
    if (!isInt(o.page)) throw new Error(`second-chance: 칸 ${i} 의 page 가 정수가 아니다`);
    if (o.bit !== 0 && o.bit !== 1) throw new Error(`second-chance: 칸 ${i} 의 bit 가 0 도 1 도 아니다`);
    return { page: o.page, bit: o.bit };
  });
  const pages = new Set(slots.map((s) => s.page));
  if (pages.size !== slots.length) throw new Error('second-chance: 같은 페이지가 두 칸에 있다');
  if (!isInt(d.hand) || d.hand < 0 || d.hand >= slots.length) {
    throw new Error('second-chance: hand 가 칸 범위 밖이다');
  }
  if (!Array.isArray(d.refs) || d.refs.length === 0) {
    throw new Error('second-chance: refs 가 비었거나 배열이 아니다');
  }
  const refs = d.refs.map((r: unknown, i: number) => {
    if (!isInt(r)) throw new Error(`second-chance: 참조 ${i} 가 정수가 아니다`);
    return r;
  });
  return { type: 'second-chance', stepMs: d.stepMs, slots, hand: d.hand, refs };
}

export async function secondChance(
  context: FacetContext<SecondChanceFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SecondChanceFacetData>;
  const data = readSecondChanceData(ctx.data);
  const slots = data.slots.map((s) => ({ page: s.page, bit: s.bit }));
  const n = slots.length;
  let hand = data.hand;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  for (let r = 0; r < data.refs.length; r += 1) {
    // 걸음 0 이 이미 칸과 바늘을 보이므로 첫 발신 앞에도 읽을 틈을 둔다.
    if (!(await pause())) return;
    const page = data.refs[r]!;
    const at = slots.findIndex((s) => s.page === page);
    if (at >= 0) {
      slots[at] = { page, bit: 1 };
      await ctx.emit({ type: 'hit', payload: { ref: r, page, slot: at } });
      continue;
    }
    await ctx.emit({ type: 'miss', payload: { ref: r, page } });

    let placed = false;
    for (let looked = 0; looked <= 2 * n; looked += 1) {
      if (!(await pause())) return;
      const cur = slots[hand]!;
      const next = (hand + 1) % n;
      if (cur.bit === 1) {
        slots[hand] = { page: cur.page, bit: 0 };
        await ctx.emit({ type: 'spare', payload: { slot: hand, page: cur.page, next } });
        hand = next;
        continue;
      }
      slots[hand] = { page, bit: 1 };
      await ctx.emit({ type: 'evict', payload: { slot: hand, out: cur.page, page, next } });
      hand = next;
      placed = true;
      break;
    }
    if (!placed) throw new Error(`second-chance: 페이지 ${page} 를 넣을 칸을 바늘이 찾지 못했다`);
  }
}
