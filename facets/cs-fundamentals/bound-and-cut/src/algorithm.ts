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
 *   갈래를 가리키는 이름을 두지 않는다. 걸음이 오는 차례가 곧 자리 번호다.
 *   target 은 쓰지 않는다.
 *
 * ── 이벤트 ─────────────────────────────────────────────────────────────
 *   plan             { columns: number; scaleMax: number }                  silent
 *                    갈래가 몇이 될지와 자의 눈금 최대값. **둘 다 다 돌아 봐야
 *                    나오는 수**라 화면이 셀 수 없다 — 자리 폭과 눈금은 첫 갈래가
 *                    그려지기 전에 정해져야 하므로 여기서 실어 준다.
 *   branch-measured  { decisions: ('in'|'out'|'open')[] }
 *                    한 갈래에 자를 대어 한계를 잰다. **결정만 싣는다** — 값·무게·
 *                    한계·쪼갠 물건·다 정해졌나는 전부 이 결정에서 셈해지므로
 *                    (`packedLoad` · `relaxBound` · `isSettled`) 싣는 순간 같은
 *                    물음에 두 답이 생긴다.
 *   best-raised      (payload 없음)
 *                    **직전에 잰 갈래**가 지금까지의 최고를 올린다. 올라간 값은
 *                    그 갈래의 값이므로 장면이 셈한다.
 *   branch-cut       (payload 없음)
 *                    **직전에 잰 갈래**의 한계가 최고에 못 미쳐 잘린다. 한계도
 *                    최고도 장면이 쥔 것에서 나온다.
 *   rewind           (payload 없음)
 *                    자동 재생을 마친 뒤 처음으로 되감는다.
 *   done             (payload 없음)
 *                    다 돌았다. 자르기 횟수·최적값·답을 든 갈래는 전부 장면이
 *                    재 온 갈래들에서 센다.
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

/** 자를 대어 잰 결과. */
export type Relaxation = {
  /** 남은 것을 쪼개서라도 한도를 채웠을 때의 값. */
  bound: number;
  /** 한계를 셈할 때 쪼갠 물건. 쪼갤 것이 없었으면 null. */
  splitItem: string | null;
  splitNum: number;
  splitDen: number;
};

export type BoundStep =
  | { kind: 'measure'; decisions: Decision[] }
  | { kind: 'best' }
  | { kind: 'cut' };

export type BoundAndCutTrace = {
  steps: BoundStep[];
  /** 방문한 갈래의 수. */
  columns: number;
  /** 자의 눈금 최대값 — 가장 큰 한계를 10 단위로 올림한 것. */
  scaleMax: number;
};

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * 값/무게가 큰 순서로 세운 물건.
 *
 * 한계가 상한이 되려면 이 순서여야 한다 — 쪼갤 수 있을 때 가장 이득이 큰 것부터
 * 담아야 더 잘할 수 없다는 말이 성립한다.
 *
 * **선언만 있으면 나오는 순수 함수라 장면이 직접 부른다.** 걸음에 실어 보내면
 * 같은 순서를 두 곳에서 정하게 된다 (`tasks/scene-migration-protocol.md` 의 B 갈래).
 */
export function sortByDensity(items: readonly KnapsackItem[]): KnapsackItem[] {
  return [...items].sort((a, b) => b.value / b.weight - a.value / a.weight);
}

/** 이 갈래가 이미 담기로 한 것들의 값과 무게. */
export function packedLoad(
  items: readonly KnapsackItem[],
  decisions: readonly Decision[],
): { value: number; weight: number } {
  let value = 0;
  let weight = 0;
  for (let i = 0; i < decisions.length; i += 1) {
    if (decisions[i] !== 'in') continue;
    const it = items[i];
    if (it === undefined) continue;
    value += it.value;
    weight += it.weight;
  }
  return { value, weight };
}

/** 모든 물건의 결정이 끝났는가. 끝났으면 한계와 값이 같아진다. */
export function isSettled(decisions: readonly Decision[]): boolean {
  return decisions.every((d) => d !== 'open');
}

/**
 * 분수 배낭 완화 — 아직 정하지 않은 물건을 순서대로 담되, 마지막 하나는 쪼개서라도
 * 남은 자리를 꽉 채운다. 물건이 값/무게 내림차순이라는 전제 위에서만 이것이 상한이
 * 된다.
 *
 * 알고리즘과 장면이 **이 한 함수를 함께 부른다.** 화면의 막대 끝과 캡션의 한계가
 * 같은 셈에서 나오고, 자를지 말지를 가르는 수도 같은 것이다.
 */
export function relaxBound(
  items: readonly KnapsackItem[],
  capacity: number,
  decisions: readonly Decision[],
): Relaxation {
  const { value: base, weight } = packedLoad(items, decisions);
  const opened = decisions.indexOf('open');
  const from = opened === -1 ? decisions.length : opened;

  let value = base;
  let left = capacity - weight;
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
  const items = sortByDensity(data.items);
  const n = items.length;
  const steps: BoundStep[] = [];
  let best = 0;
  let peak = 0;

  const explore = (idx: number, taken: Decision[]): void => {
    const decisions: Decision[] = [
      ...taken,
      ...Array.from({ length: n - taken.length }, (): Decision => 'open'),
    ];
    const { value, weight } = packedLoad(items, decisions);
    const r = relaxBound(items, data.capacity, decisions);
    if (r.bound > peak) peak = r.bound;

    steps.push({ kind: 'measure', decisions });

    // 아직 아무것도 어기지 않았다. 이겨 봐야 못 이기므로 자른다.
    if (r.bound < best) {
      steps.push({ kind: 'cut' });
      return;
    }
    // 여기까지 담은 것 자체가 하나의 답이다. 최고가 올라가면 자르는 기준이 올라간다.
    if (value > best) {
      best = value;
      steps.push({ kind: 'best' });
    }
    if (idx === n) return;

    const it = items[idx];
    // 담으면 한도를 넘는 갈래는 애초에 생기지 않는다 — 자르기와는 다른 일이다.
    if (weight + it.weight <= data.capacity) explore(idx + 1, [...taken, 'in']);
    explore(idx + 1, [...taken, 'out']);
  };

  explore(0, []);

  return {
    steps,
    columns: steps.reduce((acc, s) => (s.kind === 'measure' ? acc + 1 : acc), 0),
    scaleMax: Math.max(10, Math.ceil(peak / 10) * 10),
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
        await ctx.emit({ type: 'branch-measured', payload: { decisions: [...step.decisions] } });
        return;
      case 'best':
        await ctx.emit({ type: 'best-raised' });
        return;
      case 'cut':
        await ctx.emit({ type: 'branch-cut' });
        return;
    }
  };

  const finish = async (): Promise<void> => {
    await ctx.emit({ type: 'done' });
  };

  await ctx.emit({
    type: 'plan',
    payload: { columns: trace.columns, scaleMax: trace.scaleMax },
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
  //
  // 띠를 단 뒤로는 누를 `advance` 가 없어 여기로 오지 않는다. 이행이 끝난 뒤
  // 일괄로 걷어낸다 (`tasks/scene-migration-protocol.md` 7절).
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
