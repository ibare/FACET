/**
 * union-find — 서로소 집합 완결형 algorithm.
 *
 * 조각 셋(`findRoot` · `unionByRank` · `pathCompression`)이 연산 자체는 다
 * 덮는다. 이 완결형이 더하는 것은 **누적**이다.
 *
 * 경로 압축의 값어치는 한 번의 압축에 있지 않고 "여러 번 물을수록 싸진다" 는
 * 데 있다. 조각은 한 번의 압축까지만 보일 수 있다 — 그 뒤에 무슨 일이
 * 벌어지는지는 여러 연산을 몰아 봐야 드러난다. 그래서 여기서는 **같은 버튼을
 * 두 번 눌렀을 때 값이 달라지는 것**이 논증이다. `find-all` 을 처음 누르면
 * 비싸고, 두 번째 누르면 거의 공짜다.
 *
 * ── 진행 모델
 *
 * `mechanismKind: 'reactive'`. mount 즉시 씨앗 union 을 시연하고, 그 뒤로는
 * `waitForInput` 루프에서 학습자의 조작을 받는다.
 *
 * ── 식별자 (C1)
 *
 *   `node:<i>`   자리 i. 가리킴(부모)은 payload 가 나른다.
 *
 * ── 이벤트
 *
 * | type            | 표준 | target      | payload |
 * | --------------- | --- | ----------- | ------- |
 * | `state-changed` | O   | 없음         | `{ parent, rank }` 구조 전체 |
 * | `highlight`     | O   | `node:<i>`  | `{ node }` 지금 밟는 자리 |
 * | `compare`       | O   | 없음         | `{ a, b, rankA, rankB, tie }` 두 뿌리의 랭크를 견준다 |
 * | `done`          | O   | 없음         | `{ finds, hops }` 한 조작이 끝났다 |
 * | `hop`           | ✗   | `node:<to>` | `{ from, to }` 한 칸 오른다 |
 * | `root-found`    | ✗   | `node:<r>`  | `{ start, root, hops }` 뿌리에 닿았다 |
 * | `attach`        | ✗   | `node:<lo>` | `{ loser, winner, rankGrew }` 한 뿌리를 다른 뿌리 밑에 |
 * | `compress`      | ✗   | 없음         | `{ nodes, root }` 지나온 자리를 뿌리에 곧장 붙인다 |
 * | `already`       | ✗   | 없음         | `{ a, b, root }` 이미 한 무리다 |
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *
 *   union-count · find-count · hop-count
 *
 * 평균은 메트릭이 될 수 없다 — `ctx.metric` 은 더하기만 하고 값을 놓지 못한다.
 * 그래서 평균과 키는 `done` 의 payload 로 보내고 projector 가 HUD 에 적는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type UnionFindData = {
  type: 'union-find';
  /** 자리 수. 0 부터 n−1 까지. */
  size: number;
  /** 시연에서 미리 합쳐 둘 짝들. */
  seed: [number, number][];
  /** 걸음 간격(ms). */
  stepMs: number;
};

/**
 * 어떤 최적화를 켤지. 슬라이더가 정한다.
 *
 * 둘을 **따로** 켤 수 있어야 한다. 랭크와 압축을 묶어 두면 랭크가 애초에 줄을
 * 못 만들게 해서 압축이 접을 것이 없어진다 — 그러면 "두 번째가 싸진다" 를
 * 보일 자리가 사라진다. 각각이 무엇을 하는지 따로 보이고, 마지막에 둘 다.
 */
type Mode = 0 | 1 | 2 | 3; // 0 그냥 · 1 랭크만 · 2 압축만 · 3 둘 다

/** 합칠 때 랭크를 보는가. */
const usesRank = (m: Mode): boolean => m === 1 || m === 3;
/** 찾은 김에 길을 접는가. */
const usesCompress = (m: Mode): boolean => m === 2 || m === 3;

type UnionInput = { type: string; payload?: Record<string, unknown> };

export async function unionFind(ctx: FacetContext<UnionFindData>): Promise<void> {
  const rc = ctx as ReactiveContext<UnionFindData>;
  const { size, stepMs } = rc.data;

  let parent: number[] = [];
  let rank: number[] = [];
  // 기본은 최적화 없음. 납작한 상태로 시작하면 압축이 무엇을 하는지 보여 줄
  // 것이 없다 — 줄이 길어지는 것을 먼저 보이고 슬라이더로 갈아 끼우게 한다.
  // facet.ts 의 segments 기본값과 같아야 한다.
  let mode: Mode = 0;
  /**
   * **이번 조작**에서의 find 횟수와 오른 칸 수.
   *
   * 평생 누적으로 재면 안 된다 — 누적 평균은 보이려는 것을 정확히 뭉갠다.
   * "두 번째 모두 찾기가 싸다" 는 두 조작을 **따로** 재야 드러난다. 평생
   * 누적은 컨트롤바의 메트릭이 이미 지고 있다.
   */
  let opFinds = 0;
  let opHops = 0;
  let inputA = '';
  let inputB = '';

  const reset = (): void => {
    parent = Array.from({ length: size }, (_, i) => i);
    rank = new Array<number>(size).fill(0);
  };

  const pause = async (): Promise<boolean> => {
    if (rc.cancelled) return false;
    return rc.sleep(stepMs);
  };

  const publish = async (): Promise<void> => {
    await rc.emit({
      type: 'state-changed',
      payload: { parent: [...parent], rank: [...rank] },
      silent: true,
    });
  };

  /** 나무의 키 — 가장 깊은 자리가 뿌리까지 몇 칸인가. */
  const height = (): number => {
    let max = 0;
    for (let i = 0; i < size; i += 1) {
      let d = 0;
      let cur = i;
      // 자리 수만큼 올라도 못 닿으면 데이터에 고리가 있다는 뜻이다.
      while (parent[cur] !== cur && d <= size) {
        cur = parent[cur]!;
        d += 1;
      }
      if (d > max) max = d;
    }
    return max;
  };

  /** 새 조작이 시작된다 — 이번 조작의 셈을 0 에서 다시 잡는다. */
  const beginOp = (): void => {
    opFinds = 0;
    opHops = 0;
  };

  const finish = async (): Promise<void> => {
    await publish();
    await rc.emit({ type: 'done', payload: { finds: opFinds, hops: opHops, height: height() } });
  };

  /**
   * 뿌리를 찾아 올라간다. 밟은 자리를 돌려주는 것이 요점이다 —
   * 경로 압축이 그 목록을 그대로 쓴다.
   */
  const findRoot = async (start: number, quiet = false): Promise<{ root: number; path: number[] } | null> => {
    let cur = start;
    const path: number[] = [];
    let guard = 0;
    while (parent[cur] !== cur) {
      if (rc.cancelled) return null;
      if (guard > size) break; // 고리 방어. 정상 데이터에서는 닿지 않는다.
      guard += 1;
      path.push(cur);
      const next = parent[cur]!;
      if (!quiet) {
        await rc.emit({ type: 'hop', target: `node:${next}`, payload: { from: cur, to: next } });
        ctx.metric('hop-count', 'inc');
        if (!(await pause())) return null;
      } else {
        ctx.metric('hop-count', 'inc');
      }
      opHops += 1;
      cur = next;
    }
    opFinds += 1;
    ctx.metric('find-count', 'inc');
    if (!quiet) {
      await rc.emit({
        type: 'root-found',
        target: `node:${cur}`,
        payload: { start, root: cur, hops: path.length },
      });
      if (!(await pause())) return null;
    }

    // 경로 압축 — 올라간 김에 지나온 자리를 전부 뿌리에 곧장 붙인다.
    // 이 한 번의 수고가 그 길 위의 자리 전부를 다음번에 싸게 만든다.
    if (usesCompress(mode) && path.length > 1) {
      for (const n of path) parent[n] = cur;
      await rc.emit({ type: 'compress', payload: { nodes: [...path], root: cur } });
      await publish();
      if (!quiet && !(await pause())) return null;
    }
    return { root: cur, path };
  };

  const union = async (a: number, b: number): Promise<boolean> => {
    const ra = await findRoot(a);
    if (!ra) return false;
    const rb = await findRoot(b);
    if (!rb) return false;

    if (ra.root === rb.root) {
      await rc.emit({ type: 'already', payload: { a, b, root: ra.root } });
      return true;
    }

    let winner = ra.root;
    let loser = rb.root;
    let rankGrew = false;

    if (!usesRank(mode)) {
      // 랭크를 안 본다 — 늘 뒤엣것을 앞엣것 밑에 넣는다. 그래서 줄이 길어진다.
      winner = ra.root;
      loser = rb.root;
      rankGrew = true;
    } else {
      await rc.emit({
        type: 'compare',
        payload: {
          a: ra.root,
          b: rb.root,
          rankA: rank[ra.root]!,
          rankB: rank[rb.root]!,
          tie: rank[ra.root] === rank[rb.root],
        },
      });
      if (!(await pause())) return false;
      if (rank[ra.root]! < rank[rb.root]!) {
        winner = rb.root;
        loser = ra.root;
      } else if (rank[ra.root]! > rank[rb.root]!) {
        winner = ra.root;
        loser = rb.root;
      } else {
        // 키가 같을 때만 어쩔 수 없이 하나 는다.
        rankGrew = true;
      }
    }

    parent[loser] = winner;
    if (rankGrew) rank[winner] = rank[winner]! + 1;
    ctx.metric('union-count', 'inc');
    await rc.emit({
      type: 'attach',
      target: `node:${loser}`,
      payload: { loser, winner, rankGrew },
    });
    await publish();
    return pause();
  };

  const parseSlot = (raw: string): number | null => {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n >= 0 && n < size ? n : null;
  };

  // ── 1. 시연. 씨앗 짝을 합쳐 무리를 만든다.
  reset();
  beginOp();
  await publish();
  for (const [a, b] of rc.data.seed) {
    if (rc.cancelled) return;
    if (!(await union(a, b))) return;
  }
  if (rc.cancelled) return;
  await finish();

  // ── 2. 학습자 차례.
  for (;;) {
    if (rc.cancelled) return;
    let ev: UnionInput;
    try {
      ev = await rc.waitForInput<UnionInput>();
    } catch {
      // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다 (C6).
      return;
    }

    const pa = ev.payload ?? {};
    if (typeof pa.a === 'string') inputA = pa.a;
    if (typeof pa.b === 'string') inputB = pa.b;

    if (ev.type === 'input') continue;

    if (ev.type === 'mode') {
      const v = typeof pa.value === 'number' ? pa.value : Number.parseInt(String(pa.value), 10);
      const next: Mode = v === 0 ? 0 : v === 1 ? 1 : v === 2 ? 2 : 3;
      if (next === mode) continue;
      mode = next;
      // 규칙이 바뀌면 처음부터 다시 쌓는다. 그러지 않으면 옛 규칙으로 만든
      // 모양 위에 새 규칙이 얹혀, 무엇이 무엇 때문인지 가려진다.
      reset();
      beginOp();
      await publish();
      for (const [a, b] of rc.data.seed) {
        if (rc.cancelled) return;
        if (!(await union(a, b))) return;
      }
      await finish();
      continue;
    }

    if (ev.type === 'union') {
      const a = parseSlot(inputA);
      const b = parseSlot(inputB);
      if (a === null || b === null || a === b) continue;
      beginOp();
      if (!(await union(a, b))) return;
      await finish();
      continue;
    }

    if (ev.type === 'find') {
      const a = parseSlot(inputA);
      if (a === null) continue;
      beginOp();
      if (!(await findRoot(a))) return;
      await finish();
      continue;
    }

    if (ev.type === 'find-all') {
      // 모든 자리에서 한 번씩 묻는다. **두 번째 누름이 논증이다** — 경로 압축이
      // 켜져 있으면 첫 번째가 길을 접어 놓아 두 번째는 거의 공짜가 된다.
      beginOp();
      for (let i = 0; i < size; i += 1) {
        if (rc.cancelled) return;
        if (!(await findRoot(i, true))) return;
      }
      await finish();
      continue;
    }
  }
}
