/**
 * boundAndCut — 한계 기반 가지치기 (branch and bound).
 *
 * 무게 한도가 있는 가방에 물건을 골라 담아 값을 최대로 한다. 갈래마다 **자를 대어
 * 한계를 재고**, 그 한계가 지금까지의 최고를 못 넘으면 갈래를 자른다. 아직 아무
 * 조건도 어기지 않았는데 자른다는 것이 이 조각의 요지다 — 이겨 봐야 못 이기기
 * 때문에 자른다.
 *
 * 한계 = 남은 물건을 값/무게가 큰 순서로 담되 마지막 하나는 쪼개서라도 한도를
 * 꽉 채웠을 때의 값 (분수 배낭 완화). 실제로는 쪼갤 수 없으므로 이 값보다 잘할
 * 수는 없고, 따라서 이 값이 최고를 못 넘으면 그 아래는 볼 것이 없다.
 *
 * ── 식별자 ─────────────────────────────────────────────────────────────
 *   갈래는 방문 순서(`order`)로만 가리킨다. target 은 쓰지 않는다.
 *
 * ── 이벤트 ─────────────────────────────────────────────────────────────
 *   plan             { columns: number; scaleMax: number; order: string[] }   silent
 *                    갈래가 몇이 될지와 자의 눈금 최대값. 화면이 자리 폭을
 *                    정하려면 첫 갈래가 그려지기 전에 알아야 한다.
 *   branch-measured  { order, decisions, value, weight, bound,
 *                      splitItem, splitNum, splitDen, complete }
 *                    한 갈래에 자를 대어 한계를 잰다.
 *   best-raised      { order: number; best: number }
 *                    지금까지의 최고가 올라간다. 자르는 기준이 함께 올라간다.
 *   branch-cut       { order: number; bound: number; best: number }
 *                    한계가 최고에 못 미쳐 갈래를 자른다.
 *   rewind           (payload 없음)
 *                    자동 재생을 마친 뒤 처음으로 되감는다.
 *   done             { cuts: number; best: number; answerOrder: number }
 *                    자르기 횟수와 최적값. answerOrder 는 그 답을 들고 있는 갈래.
 *
 * ── phase / metric ─────────────────────────────────────────────────────
 *   조각이므로 코드 패널도 metric 도 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type KnapsackItem = {
  id: string;
  weight: number;
  value: number;
};

export type BoundAndCutData = {
  type: 'bound-and-cut';
  /** 가방의 무게 한도. */
  capacity: number;
  items: KnapsackItem[];
  /** 걸음 간격 (S-piece). */
  stepMs: number;
};

/** 한 물건에 대한 이 갈래의 결정. `open` 은 아직 정하지 않은 것. */
export type Decision = 'in' | 'out' | 'open';

export type BranchSnapshot = {
  /** 방문 순서. 화면에서 이 갈래의 자리를 정한다. */
  order: number;
  /** 물건 수만큼의 결정. 값/무게 내림차순 자리에 맞춘다. */
  decisions: Decision[];
  /** 이미 담기로 한 것들의 값. */
  value: number;
  /** 이미 담기로 한 것들의 무게. */
  weight: number;
  /** 남은 것을 쪼개서라도 한도를 채웠을 때의 값. */
  bound: number;
  /** 한계를 셈할 때 쪼갠 물건. 쪼갤 것이 없었으면 null. */
  splitItem: string | null;
  splitNum: number;
  splitDen: number;
  /** 모든 물건의 결정이 끝났는가. */
  complete: boolean;
};

export type BoundStep =
  | { kind: 'measure'; branch: BranchSnapshot }
  | { kind: 'best'; order: number; best: number }
  | { kind: 'cut'; order: number; bound: number; best: number };

export type BoundAndCutTrace = {
  steps: BoundStep[];
  /** 방문한 갈래의 수. */
  columns: number;
  /** 자의 눈금 최대값 — 가장 큰 한계를 10 단위로 올림한 것. */
  scaleMax: number;
  /** 값/무게 내림차순으로 정렬한 물건 id. */
  itemOrder: string[];
  best: number;
  cuts: number;
  /** 최적값을 들고 결정이 모두 끝난 갈래. 없으면 -1. */
  answerOrder: number;
};

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * 분수 배낭 완화 — `from` 번째부터 남은 물건을 순서대로 담되, 마지막 하나는
 * 쪼개서라도 남은 자리를 꽉 채운다. 물건이 값/무게 내림차순이라는 전제 위에서만
 * 이것이 상한이 된다.
 */
function relax(
  items: KnapsackItem[],
  from: number,
  room: number,
  base: number,
): { bound: number; splitItem: string | null; splitNum: number; splitDen: number } {
  let value = base;
  let left = room;
  let splitItem: string | null = null;
  let splitNum = 0;
  let splitDen = 0;
  for (let i = from; i < items.length; i += 1) {
    const it = items[i];
    if (it.weight <= left) {
      left -= it.weight;
      value += it.value;
      continue;
    }
    if (left > 0) {
      value += (it.value * left) / it.weight;
      splitItem = it.id;
      splitNum = left;
      splitDen = it.weight;
    }
    break;
  }
  return { bound: round3(value), splitItem, splitNum, splitDen };
}

/**
 * 깊이 우선으로 갈래를 돌며 걸음을 모은다.
 *
 * 걸음을 배열로 모으는 이유 — 화면이 갈래 자리의 폭을 정하려면 **갈래가 몇이
 * 될지를 첫 갈래가 그려지기 전에** 알아야 하는데, 그 수는 자르기의 결과라
 * 미리 셀 수 없다. 재귀를 두 번 돌리면 두 벌이 어긋날 수 있으므로 한 번 돌려
 * 걸음을 얻고 그것을 재생한다. 사람이 적은 걸음표가 아니라 데이터 순회의
 * 결과다 (S-piece).
 */
export function traceBoundAndCut(data: BoundAndCutData): BoundAndCutTrace {
  const items = [...data.items].sort((a, b) => b.value / b.weight - a.value / a.weight);
  const n = items.length;
  const steps: BoundStep[] = [];
  let best = 0;
  let cuts = 0;
  let visited = 0;
  let peak = 0;

  const explore = (idx: number, weight: number, value: number, decisions: Decision[]): void => {
    const order = visited;
    visited += 1;
    const rest = Array.from({ length: n - decisions.length }, (): Decision => 'open');
    const r = relax(items, idx, data.capacity - weight, value);
    if (r.bound > peak) peak = r.bound;

    steps.push({
      kind: 'measure',
      branch: {
        order,
        decisions: [...decisions, ...rest],
        value,
        weight,
        bound: r.bound,
        splitItem: r.splitItem,
        splitNum: r.splitNum,
        splitDen: r.splitDen,
        complete: idx === n,
      },
    });

    // 아직 아무것도 어기지 않았다. 이겨 봐야 못 이기므로 자른다.
    if (r.bound < best) {
      cuts += 1;
      steps.push({ kind: 'cut', order, bound: r.bound, best });
      return;
    }
    // 여기까지 담은 것 자체가 하나의 답이다. 최고가 올라가면 자르는 기준이 올라간다.
    if (value > best) {
      best = value;
      steps.push({ kind: 'best', order, best });
    }
    if (idx === n) return;

    const it = items[idx];
    // 담으면 한도를 넘는 갈래는 애초에 생기지 않는다 — 자르기와는 다른 일이다.
    if (weight + it.weight <= data.capacity) {
      explore(idx + 1, weight + it.weight, value + it.value, [...decisions, 'in']);
    }
    explore(idx + 1, weight, value, [...decisions, 'out']);
  };

  explore(0, 0, 0, []);

  let answerOrder = -1;
  for (const s of steps) {
    if (s.kind !== 'measure') continue;
    if (s.branch.complete && s.branch.value === best) answerOrder = s.branch.order;
  }

  return {
    steps,
    columns: visited,
    scaleMax: Math.max(10, Math.ceil(peak / 10) * 10),
    itemOrder: items.map((it) => it.id),
    best,
    cuts,
    answerOrder,
  };
}

export async function boundAndCutAlgorithm(
  rawCtx: FacetContext<BoundAndCutData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<BoundAndCutData>;
  const trace = traceBoundAndCut(ctx.data);
  const stepMs = ctx.data.stepMs;

  const pause = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return ctx.sleep(stepMs);
  };

  const play = async (step: BoundStep): Promise<void> => {
    switch (step.kind) {
      case 'measure':
        await ctx.emit({ type: 'branch-measured', payload: { ...step.branch } });
        return;
      case 'best':
        await ctx.emit({ type: 'best-raised', payload: { order: step.order, best: step.best } });
        return;
      case 'cut':
        await ctx.emit({
          type: 'branch-cut',
          payload: { order: step.order, bound: step.bound, best: step.best },
        });
        return;
    }
  };

  const finish = async (): Promise<void> => {
    await ctx.emit({
      type: 'done',
      payload: { cuts: trace.cuts, best: trace.best, answerOrder: trace.answerOrder },
    });
  };

  await ctx.emit({
    type: 'plan',
    payload: {
      columns: trace.columns,
      scaleMax: trace.scaleMax,
      order: [...trace.itemOrder],
    },
    silent: true,
  });

  for (const step of trace.steps) {
    await play(step);
    if (!(await pause())) return;
  }
  await finish();

  // 재생 도중에 눌린 것은 흘려보낸다. 그것까지 받으면 화면이 끝나자마자 되감겨,
  // 다 보고 나서 멈춰 있는 완료 상태가 사라진다 (S-piece).
  while (ctx.pollInput() !== null) {
    /* 큐를 비운다 */
  }

  // 자동 재생을 마쳤다. 이제 곱씹으려는 사람이 한 걸음씩 짚는다 (S-piece).
  // 끝에서 처음 누르면 되감고 첫 걸음까지 보인다 — 되감기만 하면 눌러도 반응이
  // 없는 것으로 읽힌다.
  let cursor = trace.steps.length;
  while (!ctx.cancelled) {
    const input = await ctx.waitForInput();
    if (input.type !== 'advance') continue;
    if (cursor >= trace.steps.length) {
      await ctx.emit({ type: 'rewind' });
      cursor = 0;
    }
    await play(trace.steps[cursor]);
    cursor += 1;
    if (cursor >= trace.steps.length) await finish();
  }
}
