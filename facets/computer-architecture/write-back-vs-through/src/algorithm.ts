/**
 * write-back 과 write-through 를 나란히 굴리는 조각의 algorithm.
 *
 * 같은 고침 차례를 두 정책이 함께 받는다. 고침 횟수는 어느 쪽이나 같고,
 * 갈리는 것은 **아래층으로 내려간 횟수**뿐이다.
 *
 * ── 셈하는 법
 *   write-through — 고칠 때마다 곧장 한 번. 그래서 고침 수와 같다.
 *   write-back    — 고친 줄에 표시만 달아 두었다가, 그 줄이 쫓겨날 때 한 번.
 *                   끝에 남은 고쳐진 줄도 **언젠가는 내려보내야 하므로** 셈에
 *                   넣는다. 넣지 않으면 화면이 거짓을 말한다.
 *   칸 고르기는 LRU — 가장 오래전에 쓴 칸이 자리를 내준다.
 *
 * 적재·축출·표시·메모리 쓰기 횟수는 전부 여기서 셈한다. 1차 데이터는 칸 수 ·
 * 라인 크기 · 고치는 줄 차례뿐이다 (S-piece).
 *
 * ── 식별자
 *   쓰지 않는다. 걸음의 내용이 전부 payload 에 있고 target 이 가리킬 대상이 없다.
 *
 * ── 이벤트 (facet 고유 확장 — C2). 넷 다 silent 가 아니다.
 *   'line-write'  { index, line, slot, hit, marks,
 *                   evictSlot, evictLine, evictMarks,
 *                   throughTotal, backTotal }
 *       고침 한 번. `marks` 는 이 고침까지 그 칸에 쌓인 표시 수(write-back).
 *       `evict*` 는 이 고침이 밀어낸 줄 — 없으면 -1 / 0 이다.
 *   'flush'       { lines: number[], slots: number[], marks: number[], backTotal }
 *       끝에 남은 고쳐진 줄들. 세 배열은 같은 길이이고 자리끼리 짝을 이룬다.
 *   'done'        { writes, throughTotal, backTotal }
 *   'rewind'      {}
 *       한 걸음씩 다시 볼 때 화면을 처음으로 되돌린다.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WriteBackVsThroughData = {
  type: string;
  /** 캐시 칸 수. */
  slotCount: number;
  /** 라인 한 줄의 크기(바이트). 화면에는 `2 × 16 B` 표식으로만 나온다. */
  lineBytes: number;
  /** 고치는 줄의 차례. 이 배열이 걸음을 정한다 — 손으로 적은 걸음표가 아니다. */
  writes: number[];
  /** 걸음 사이의 정지 시간 (S-piece). */
  stepMs: number;
};

/** 캐시 한 칸. `marks` 가 그 줄에 쌓인 고침 표시 수다. */
type Cell = { line: number; marks: number };

type WriteStep = {
  index: number;
  line: number;
  slot: number;
  hit: boolean;
  marks: number;
  evictSlot: number;
  evictLine: number;
  evictMarks: number;
  throughTotal: number;
  backTotal: number;
};

/** 끝에 남은 고쳐진 줄. */
type Leftover = { slot: number; line: number; marks: number };

type Trace = {
  steps: WriteStep[];
  leftovers: Leftover[];
  throughTotal: number;
  backTotal: number;
};

function simulate(data: WriteBackVsThroughData): Trace {
  const writes = Array.isArray(data.writes) ? data.writes : [];
  const slotCount = Math.max(1, Math.floor(data.slotCount));
  const cells: (Cell | null)[] = Array.from({ length: slotCount }, () => null);
  /** 최근에 쓴 칸이 뒤로 간다 — 맨 앞이 가장 오래된 칸이다. */
  const recency: number[] = [];
  const steps: WriteStep[] = [];
  let throughTotal = 0;
  let backTotal = 0;

  for (let index = 0; index < writes.length; index += 1) {
    const line = Math.max(0, Math.floor(writes[index]));

    // write-through — 고쳤으니 곧장 한 번 내려간다.
    throughTotal += 1;

    let slot = cells.findIndex((c) => c !== null && c.line === line);
    const hit = slot >= 0;
    let evictSlot = -1;
    let evictLine = -1;
    let evictMarks = 0;

    if (!hit) {
      const free = cells.indexOf(null);
      if (free >= 0) {
        slot = free;
      } else {
        slot = recency.length > 0 ? recency[0] : 0;
        const victim = cells[slot];
        if (victim !== null) {
          evictSlot = slot;
          evictLine = victim.line;
          evictMarks = victim.marks;
          // write-back 은 여기서만 내려간다 — 고쳐진 줄이 쫓겨날 때.
          if (evictMarks > 0) backTotal += 1;
        }
      }
      cells[slot] = { line, marks: 0 };
    }

    const cell = cells[slot];
    // 고친 표시가 줄 위에 하나 는다. write-back 은 이것만 하고 만다.
    if (cell !== null) cell.marks += 1;

    const seen = recency.indexOf(slot);
    if (seen >= 0) recency.splice(seen, 1);
    recency.push(slot);

    steps.push({
      index,
      line,
      slot,
      hit,
      marks: cell !== null ? cell.marks : 1,
      evictSlot,
      evictLine,
      evictMarks,
      throughTotal,
      backTotal,
    });
  }

  const leftovers: Leftover[] = [];
  for (let slot = 0; slot < cells.length; slot += 1) {
    const cell = cells[slot];
    if (cell !== null && cell.marks > 0) leftovers.push({ slot, line: cell.line, marks: cell.marks });
  }
  // 남은 고쳐진 줄도 언젠가는 내려보낸다. 이것을 빼면 셈이 거짓이 된다.
  backTotal += leftovers.length;

  return { steps, leftovers, throughTotal, backTotal };
}

/** 걸음 사이의 문. 이어 가도 되면 true, 취소·중단이면 false. */
type Gate = () => Promise<boolean>;

export const writeBackVsThroughAlgorithm = async (
  ctx: FacetContext<WriteBackVsThroughData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<WriteBackVsThroughData>;
  const trace = simulate(ctx.data);
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : 700;

  /** 자동 재생 — 스스로 나아간다. */
  const byTime: Gate = () => rc.sleep(stepMs);

  /** 한 걸음씩 — `advance` 를 받을 때까지 선다. 그 밖의 입력은 걸음으로 세지 않는다. */
  const byHand: Gate = async () => {
    for (;;) {
      if (rc.cancelled) return false;
      const input = await rc.waitForInput();
      // 뒤에서도 본다 — throw 규약에만 기대지 않는다 (C8).
      if (rc.cancelled) return false;
      if (input.type === 'advance') return true;
    }
  };

  /**
   * 한 판을 처음부터 끝까지 보인다.
   *
   * 마운트 직후의 첫 걸음은 문을 지나지 않는다 — 문은 걸음 *사이*의 것이라
   * 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece). 같은 이유로, 되감은 뒤
   * 처음 누르는 `advance` 도 첫 걸음까지 그대로 간다.
   */
  const play = async (gate: Gate): Promise<boolean> => {
    let first = true;
    for (const step of trace.steps) {
      if (!first && !(await gate())) return false;
      first = false;
      await ctx.emit({ type: 'line-write', payload: { ...step } });
    }

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'flush',
      payload: {
        lines: trace.leftovers.map((l) => l.line),
        slots: trace.leftovers.map((l) => l.slot),
        marks: trace.leftovers.map((l) => l.marks),
        backTotal: trace.backTotal,
      },
    });

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'done',
      payload: {
        writes: trace.steps.length,
        throughTotal: trace.throughTotal,
        backTotal: trace.backTotal,
      },
    });
    return true;
  };

  if (!(await play(byTime))) return;

  // 자동 재생이 끝났다. 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 다시 짚는다.
  for (;;) {
    if (rc.cancelled) return;
    const input = await rc.waitForInput();
    if (rc.cancelled) return;
    if (input.type !== 'advance') continue;
    await ctx.emit({ type: 'rewind' });
    if (!(await play(byHand))) return;
  }
};
