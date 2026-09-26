/**
 * dirty-scan — 구독(줄)이 없을 때, 값 하나가 바뀌었다는 것을 알아내려면 지켜보는
 * 값 전부를 처음부터 끝까지 훑어 지난번에 본 값과 견주는 수밖에 없다는 것을 보인다.
 * AngularJS 의 `$digest` 꼴 — 한 바퀴 = 지켜보는 값 전부를 적힌 차례로 한 번씩
 * 들여다보기. 한 바퀴에서 다른 것이 하나라도 있었으면 한 바퀴 더, 하나도 없었으면 멈춘다.
 *
 * 이벤트
 *   write  — 지켜보는 값 하나를 바꾼다. 구독이 없어 아무에게도 알리지 않는다
 *            (그 자체가 이 조각의 요점). 걸음 하나를 그대로 차지한다.
 *            target: `value:<name>`
 *            payload: { name: string; from: string | number; to: string | number }
 *   look   — 훑기 한 바퀴 안에서 값 하나를 들여다본다. 지난번 값과 지금 값을 견주어
 *            다르면 지난번 값을 지금 값으로 갈아 끼우고 그 자리만 다시 그린다.
 *            다르든 같든 끝까지 간다 — 바뀐 것을 찾아도 멈추지 않는다.
 *            target: `value:<name>`
 *            payload: {
 *              name: string; pass: number; lookIndex: number;
 *              last: string | number; now: string | number; dirty: boolean;
 *            }
 *
 * silent 이벤트는 없다 — 모든 이벤트가 걸음 하나씩이다 (사양의 걸음 열넷: 처음 +
 * 쓰기 하나 + 들여다보기 열둘).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WatchedValue = { name: string; value: string | number };

export type DirtyScanFacetData = {
  type: 'dirty-scan';
  /** 지켜보는 값 여섯 — 이 차례로 훑는다. */
  watched: WatchedValue[];
  /** 훑기가 시작되기 전에 일어나는 쓰기 하나. `code` 는 화면에 보일 쓰기 한 줄(표기: `level = 5`). */
  write: { name: string; value: string | number; code: string };
  /** AngularJS 의 $digest 한도(10) — 이를 넘으면 훑기가 가라앉지 않는다고 본다. */
  maxPasses: number;
  stepMs: number;
};

export async function dirtyScan(ctxIn: FacetContext<DirtyScanFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<DirtyScanFacetData>;
  const { watched, write, maxPasses } = ctx.data;
  if (watched.length === 0) throw new Error('지켜볼 값이 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(ctx.data.stepMs)) && !ctx.cancelled;
  }

  const now = new Map<string, string | number>(watched.map((w) => [w.name, w.value]));
  const last = new Map<string, string | number>(watched.map((w) => [w.name, w.value]));

  if (!now.has(write.name)) throw new Error(`쓰기가 모르는 이름을 가리킨다: ${write.name}`);
  const from = now.get(write.name) as string | number;
  now.set(write.name, write.value);

  await ctx.emit({
    type: 'write',
    target: `value:${write.name}`,
    payload: { name: write.name, from, to: write.value },
  });
  if (!(await pause())) return;

  let lookIndex = 0;
  let pass = 0;
  while (true) {
    if (ctx.cancelled) return;
    pass += 1;
    if (pass > maxPasses) throw new Error(`훑기가 ${maxPasses} 바퀴를 넘도록 가라앉지 않는다`);
    let dirtyInPass = 0;
    for (const w of watched) {
      if (ctx.cancelled) return;
      lookIndex += 1;
      const nowValue = now.get(w.name) as string | number;
      const lastValue = last.get(w.name) as string | number;
      const dirty = nowValue !== lastValue;
      if (dirty) {
        dirtyInPass += 1;
        last.set(w.name, nowValue);
      }
      await ctx.emit({
        type: 'look',
        target: `value:${w.name}`,
        payload: { name: w.name, pass, lookIndex, last: lastValue, now: nowValue, dirty },
      });
      if (!(await pause())) return;
    }
    if (dirtyInPass === 0) return;
  }
}
