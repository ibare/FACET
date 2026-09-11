/**
 * three-edit-choices — 한 칸의 값을 정하는 세 갈래.
 *
 * 편집거리 표의 칸 (i, j) 는 이웃 셋에서 온다. 위에서 오면 글자를 **지운** 것이고,
 * 왼쪽에서 오면 **넣은** 것이며, 왼쪽 위에서 오면 **바꾼** 것이다 (두 글자가 같으면
 * 바꿀 것이 없어 공짜로 온다). 셋이 제 비용을 더해 값을 내놓고 그중 가장 싼 것이
 * 그 칸의 값이 된다.
 *
 * 표를 채우는 것은 이 조각의 일이 아니다. 칸 셋을 골라 그 안에서 세 값이 겨루는
 * 것만 본다.
 *
 * ── 이벤트 (전부 facet 고유. silent 는 없다 — 모두 걸음의 경계다)
 *
 *   cell-open  { i, j, rowChar, colChar, same, up, left, diag, levels }
 *              칸 하나를 연다. up/left/diag 는 이웃 셋의 값, rowChar/colChar 는
 *              여기서 만나는 두 글자, same 은 그 둘이 같은가, levels 는 비용
 *              사다리의 눈금 수.
 *   offers     { del, ins, sub, subCost }
 *              세 이웃이 제 비용을 더해 내놓은 값. subCost 는 대각선이 더한 값
 *              (두 글자가 같으면 0, 다르면 1).
 *   weigh      { best, winners }
 *              가장 싼 값과 그 값을 낸 갈래. winners ⊂ ['delete','insert','diag'] 이며
 *              둘 이상이면 비긴 칸이다.
 *   settle     { i, j, value }
 *              이긴 값이 칸에 앉는다.
 *   done       payload 없다. 방문할 칸이 다 끝났다.
 *   rewind     payload 없다. 처음으로 되감는다 (손걸음 회차의 시작).
 *
 * ── 메트릭
 *
 * 없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type ThreeEditChoicesData = {
  type: string;
  /** 행을 이루는 낱말 — 고치기 전. */
  source: string;
  /** 열을 이루는 낱말 — 고친 뒤. */
  target: string;
  /**
   * 들여다볼 칸. **이 배열은 데이터가 정한 순서가 아니라 사람이 적은 것이다**
   * (S-piece 의 "답사 경로가 곧 논증인 조각" 예외).
   *
   * 이 조각이 보이는 것은 표를 채우는 순회가 아니라 칸 하나의 속이라, 돌 대상이
   * 없다. 어느 칸을 어느 순서로 짚느냐가 곧 논증이다 — 셋이 겨뤄 하나가 남는
   * 규칙을 먼저 보이고(넣음이 이긴다), 둘이 비기는 칸을 보인 뒤(지움과 바꿈이
   * 같다), 두 글자가 같아 대각선이 공짜로 오는 칸에서 끝낸다. 순서를 바꾸면
   * 논증이 설명으로 주저앉는다.
   */
  visits: ReadonlyArray<{ i: number; j: number }>;
  /** 걸음 사이에 쉬는 시간 (ms). 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
};

/** 한 칸에서 세 갈래가 내놓는 것. */
type Choices = {
  up: number;
  left: number;
  diag: number;
  del: number;
  ins: number;
  sub: number;
  subCost: number;
  same: boolean;
};

/**
 * 편집거리 표를 끝까지 셈한다. 화면에 뜨는 값은 전부 여기서 나온다 —
 * 세 후보도 이긴 것도 지어내지 않는다.
 */
export function computeEditTable(source: string, target: string): number[][] {
  const rows = source.length + 1;
  const cols = target.length + 1;
  const table: number[][] = [];
  for (let i = 0; i < rows; i += 1) {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    table.push(row);
  }
  for (let j = 0; j < cols; j += 1) table[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const same = source[i - 1] === target[j - 1];
      const del = table[i - 1][j] + 1;
      const ins = table[i][j - 1] + 1;
      const sub = table[i - 1][j - 1] + (same ? 0 : 1);
      table[i][j] = Math.min(del, ins, sub);
    }
  }
  return table;
}

function choicesAt(
  table: number[][],
  source: string,
  target: string,
  i: number,
  j: number,
): Choices {
  const same = source[i - 1] === target[j - 1];
  const subCost = same ? 0 : 1;
  const up = table[i - 1][j];
  const left = table[i][j - 1];
  const diag = table[i - 1][j - 1];
  return { up, left, diag, del: up + 1, ins: left + 1, sub: diag + subCost, subCost, same };
}

function winnersOf(c: Choices, best: number): string[] {
  const out: string[] = [];
  if (c.del === best) out.push('delete');
  if (c.ins === best) out.push('insert');
  if (c.sub === best) out.push('diag');
  return out;
}

export async function threeEditChoicesAlgorithm(
  ctx: FacetContext<ThreeEditChoicesData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<ThreeEditChoicesData>;
  const { source, target, visits, stepMs } = ctx.data;
  const table = computeEditTable(source, target);

  /**
   * 사다리 눈금은 방문할 칸 전부를 통틀어 한 번 정한다. 칸마다 다시 재면 같은
   * 값이 칸마다 다른 높이에 서게 되어, 높이가 값이라는 이 그림의 유일한 규약이
   * 깨진다.
   */
  let levels = 1;
  for (const { i, j } of visits) {
    const c = choicesAt(table, source, target, i, j);
    levels = Math.max(levels, c.del, c.ins, c.sub);
  }

  /** 자동 재생이 끝난 뒤로는 손걸음이다. */
  let manual = false;

  /**
   * 걸음 사이의 문.
   *
   * **첫 걸음 앞에는 문이 없다** — 기다릴 앞걸음이 없기 때문이고, 문을 먼저 두면
   * 마운트 직후 stepMs 만큼 빈 화면이 보인다. 조각이 여럿 박힌 글에서는 그 빈
   * 화면이 여럿 겹친다 (S-piece).
   */
  async function gate(first: boolean): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (first) return true;
    if (!manual) return rc.sleep(stepMs);
    for (;;) {
      let input: ReactiveInputEvent;
      try {
        input = await rc.waitForInput();
      } catch (err) {
        // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
        // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
        if (!ctx.cancelled) throw err;
        return false;
      }
      if (ctx.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 그것을 걸음으로 세지 않게.
      if (input.type === 'advance') return true;
    }
  }

  /** 한 회차. 자동이면 시간이, 손걸음이면 advance 가 민다. */
  async function runOnce(): Promise<boolean> {
    let first = true;
    const step = async (): Promise<boolean> => {
      const ok = await gate(first);
      first = false;
      return ok;
    };

    for (const { i, j } of visits) {
      const c = choicesAt(table, source, target, i, j);
      const best = Math.min(c.del, c.ins, c.sub);

      if (!(await step())) return false;
      await ctx.emit({
        type: 'cell-open',
        payload: {
          i,
          j,
          rowChar: source[i - 1],
          colChar: target[j - 1],
          same: c.same,
          up: c.up,
          left: c.left,
          diag: c.diag,
          levels,
        },
      });

      if (!(await step())) return false;
      await ctx.emit({
        type: 'offers',
        payload: { del: c.del, ins: c.ins, sub: c.sub, subCost: c.subCost },
      });

      if (!(await step())) return false;
      await ctx.emit({
        type: 'weigh',
        payload: { best, winners: winnersOf(c, best) },
      });

      if (!(await step())) return false;
      await ctx.emit({ type: 'settle', payload: { i, j, value: best } });
    }

    if (!(await step())) return false;
    await ctx.emit({ type: 'done' });
    return true;
  }

  for (;;) {
    if (!(await runOnce())) return;

    // 회차가 끝났다. 여기서부터는 누르는 사람의 시간이다.
    let input: ReactiveInputEvent;
    try {
      input = await rc.waitForInput();
    } catch (err) {
      // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
      // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
      if (!ctx.cancelled) throw err;
      return;
    }
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;

    // 자동 재생 뒤 처음 누르는 advance 는 되감고 **첫 걸음까지** 간다 —
    // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    manual = true;
    await ctx.emit({ type: 'rewind' });
  }
}
