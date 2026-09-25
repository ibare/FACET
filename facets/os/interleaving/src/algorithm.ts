/**
 * interleaving 알고리즘 — 두 스레드의 줄을 한 실행 줄로 합치는 차례를 전부 늘어놓는다.
 *
 * 모형 (공통 안내문 · 사양 규약 줄을 그대로 옮김)
 * - CPU 는 하나다. 한 틱 = 한 스레드가 제 프로그램의 한 줄을 실행한다.
 * - 한 판 = 두 스레드의 줄 전부를 한 줄로 합친 차례 하나. 한 스레드 안의 차례는 바뀌지 않는다.
 * - 판은 전부 낸다 — 합친 줄의 자리 n 가운데 첫 스레드가 차지할 자리를 **사전순**으로 고른다
 *   ((0,1) (0,2) (0,3) (1,2) (1,3) (2,3)). 판을 손으로 적지 않고 조합을 셈한다.
 * - 바뀜 수 = 합친 차례에서 이웃한 두 줄의 스레드가 다른 자리의 수.
 * - 줄은 `show "<글자>"` 모양만 안다. 실행하면 그 글자가 출력된다. 다른 모양은 줄 번호를 담아 던진다.
 * - 공유 값은 없다.
 *
 * 이벤트 (모두 silent 아님)
 * - `round` — 판 하나
 *   payload: {
 *     index: number                  // 1 부터
 *     slots: { thread: number; line: number; output: string }[]
 *                                    // 합친 줄의 자리마다 — 스레드 번호(threads 의 차례) · 그 스레드의 줄 번호(0 부터) · 출력 글자
 *     switches: number               // 바뀜 수
 *     summary: { merges: number; arrangements: number } | null
 *                                    // 마지막 판에만 — 합친 차례의 수 · 출력 글자 전부를 늘어놓는 차례의 수(n!)
 *   }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 의 두 프로그램으로 세운다. 읽을 것이 있는 화면이라
 * 첫 발신 앞에 stepMs 를 둔다. 마지막 판을 내면 그냥 돌아온다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type InterleavingThread = { id: string; lines: string[] };

export type InterleavingFacetData = {
  type: 'interleaving';
  stepMs: number;
  threads: InterleavingThread[];
};

export type InterleavingSlot = { thread: number; line: number; output: string };

const SHOW_LINE = /^show "([^"]*)"$/;

/** `show "x"` 한 줄을 실행해 출력 글자를 낸다. 모르는 모양이면 던진다. */
export function runShowLine(line: string, where: string): string {
  const m = SHOW_LINE.exec(line.trim());
  if (!m || m[1] === undefined) {
    throw new Error(`interleaving: ${where} — 모르는 줄 모양 "${line}"`);
  }
  return m[1];
}

/** 0..n-1 에서 k 개를 사전순으로 고른 조합 전부. */
function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const pick: number[] = [];
  function go(start: number): void {
    if (pick.length === k) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i < n; i += 1) {
      pick.push(i);
      go(i + 1);
      pick.pop();
    }
  }
  go(0);
  return out;
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i += 1) f *= i;
  return f;
}

export async function interleaving(ctx: FacetContext<InterleavingFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<InterleavingFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('interleaving: stepMs 가 양수가 아니다');
  }
  const threads = data.threads;
  if (!Array.isArray(threads) || threads.length !== 2) {
    throw new Error('interleaving: 스레드는 둘이어야 한다');
  }
  const first = threads[0];
  const second = threads[1];
  if (!first || !second) throw new Error('interleaving: 스레드가 비었다');

  // 줄마다 출력 글자를 먼저 셈한다 — 모르는 모양은 여기서 던진다.
  const outputs = threads.map((th, ti) => {
    if (th.lines.length === 0) throw new Error(`interleaving: 스레드 ${th.id} 의 줄이 없다`);
    return th.lines.map((line, li) => runShowLine(line, `스레드 ${ti} 줄 ${li}`));
  });
  const outFirst = outputs[0];
  const outSecond = outputs[1];
  if (!outFirst || !outSecond) throw new Error('interleaving: 출력 셈이 비었다');

  const n = first.lines.length + second.lines.length;
  const picks = combinations(n, first.lines.length);
  const arrangements = factorial(n);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let r = 0; r < picks.length; r += 1) {
    if (!(await pause())) return;
    const pos = picks[r];
    if (!pos) throw new Error(`interleaving: 판 ${r} 의 자리가 없다`);
    const slots: InterleavingSlot[] = [];
    let ia = 0;
    let ib = 0;
    for (let k = 0; k < n; k += 1) {
      if (ctx.cancelled) return;
      if (pos.includes(k)) {
        const output = outFirst[ia];
        if (output === undefined) throw new Error(`interleaving: 판 ${r} 자리 ${k} — 첫 스레드 줄 ${ia} 이 없다`);
        slots.push({ thread: 0, line: ia, output });
        ia += 1;
      } else {
        const output = outSecond[ib];
        if (output === undefined) throw new Error(`interleaving: 판 ${r} 자리 ${k} — 둘째 스레드 줄 ${ib} 이 없다`);
        slots.push({ thread: 1, line: ib, output });
        ib += 1;
      }
    }
    let switches = 0;
    for (let k = 1; k < slots.length; k += 1) {
      if (ctx.cancelled) return;
      const a = slots[k - 1];
      const b = slots[k];
      if (!a || !b) throw new Error(`interleaving: 판 ${r} 자리 ${k} 가 비었다`);
      if (a.thread !== b.thread) switches += 1;
    }
    const isLast = r === picks.length - 1;
    await ctx.emit({
      type: 'round',
      payload: {
        index: r + 1,
        slots,
        switches,
        summary: isLast ? { merges: picks.length, arrangements } : null,
      },
    });
  }
}
