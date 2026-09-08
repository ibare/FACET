/**
 * height-stays-low 조각 algorithm — 같은 잎 수를 자식 수가 다른 두 나무가
 * 각자 덮어 나간다. 층을 하나 내려갈 때마다 덮는 잎 수가 (자식 수)^(층-1) 로
 * 불어나고, 그 자식 수가 목표에 닿기까지 밟아야 할 층수(=나무 높이)를 정한다.
 *
 * 이벤트 어휘 (C2 — facet 고유 확장, kebab-case):
 *
 *   'descend'
 *     한 나무가 층을 하나 내려가 그 층까지 덮은 잎 수를 발신한다.
 *     payload: { treeId: 'branchA' | 'branchB'; level: number; covered: number; arrived: boolean }
 *       - level    지금 내려간 층 (뿌리 = 1층).
 *       - covered  이 층이 덮는 잎 수 = branchCount^(level-1).
 *       - arrived  이 층에서 covered 가 처음 target 이상이 됐는가 (그 나무의 마지막 층).
 *     target: `tree:<treeId>`. silent 아님 — 매 층이 step boundary.
 *
 *   'rewind'
 *     자동 재생이 끝난 뒤 처음 누르는 advance 입력에서, 화면을 초기(아무 층도
 *     내려가지 않은) 상태로 되돌리라는 신호. payload 없음. silent 아님.
 *
 *   'result'
 *     두 나무가 모두 목표에 닿은 뒤, 최종 층수를 비교해 발신한다.
 *     payload: { levelsA: number; levelsB: number }. silent 아님.
 *
 * 표준 `done` 은 쓰지 않는다 — 이 조각의 결론은 "다 됐다" 가 아니라 "몇 층
 * 내려갔는가의 격차" 이고, 그 결론은 `result` 페이로드의 두 숫자가 이미 담고
 * 있다. 별도로 완료를 알릴 필요가 없다.
 *
 * 자동 재생을 마친 뒤에는 `ReactiveContext.waitForInput()` 으로 `advance` 입력을
 * 받아 한 걸음씩 다시 짚는다. 자동 재생 뒤 처음 받는 advance 는 `rewind` 를
 * 발신해 되돌리는 동시에 1층까지 보인다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HeightStaysLowData = {
  type: 'height-stays-low';
  algorithmLabel?: string;
  /** 덮어야 할 잎 수. */
  target: number;
  /** 나무 A 의 자식 수 (좁고 깊다). */
  branchA: number;
  /** 나무 B 의 자식 수 (넓고 낮다). */
  branchB: number;
  /** 걸음 간격(ms). */
  stepMs: number;
};

type TreeId = 'branchA' | 'branchB';

/**
 * children^(h-1) >= target 이 되는 첫 층 h 와 그 층이 덮는 잎 수를 찾는다.
 * 뿌리를 1층으로 센다 — 사양의 표와 동일한 규칙.
 */
function levelsToReach(children: number, target: number): { levels: number; covered: number } {
  let level = 1;
  let covered = 1;
  while (covered < target) {
    level += 1;
    covered *= children;
  }
  return { levels: level, covered };
}

/** 취소 검사와 ctx.sleep 을 한 번에 — cancel 되면 즉시 false. */
async function pause(reactive: ReactiveContext, ms: number): Promise<boolean> {
  if (reactive.cancelled) return false;
  return reactive.sleep(ms);
}

export async function heightStaysLow(ctx: FacetContext<HeightStaysLowData>): Promise<void> {
  const reactive = ctx as ReactiveContext<HeightStaysLowData>;
  const { target, branchA, branchB, stepMs } = ctx.data;

  const a = levelsToReach(branchA, target);
  const b = levelsToReach(branchB, target);
  const maxLevel = Math.max(a.levels, b.levels);

  /** 전체 걸음(level)에서, 아직 목표에 닿지 않은 나무마다 descend 를 하나씩 발신. */
  async function emitLevel(level: number): Promise<void> {
    if (level <= a.levels) {
      const covered = level === a.levels ? a.covered : Math.pow(branchA, level - 1);
      if (ctx.cancelled) return;
      await ctx.emit({
        type: 'descend',
        target: 'tree:branchA',
        payload: { treeId: 'branchA' as TreeId, level, covered, arrived: level === a.levels },
      });
    }
    if (level <= b.levels) {
      const covered = level === b.levels ? b.covered : Math.pow(branchB, level - 1);
      if (ctx.cancelled) return;
      await ctx.emit({
        type: 'descend',
        target: 'tree:branchB',
        payload: { treeId: 'branchB' as TreeId, level, covered, arrived: level === b.levels },
      });
    }
  }

  // ── 자동 재생: 1층부터 두 나무를 나란히 내려간다.
  for (let level = 1; level <= maxLevel; level++) {
    if (ctx.cancelled) return;
    await emitLevel(level);
    if (!(await pause(reactive, stepMs))) return;
  }
  if (ctx.cancelled) return;
  await ctx.emit({ type: 'result', payload: { levelsA: a.levels, levelsB: b.levels } });

  // ── 자동 재생 종료 뒤 advance 로 한 걸음씩 다시 짚기.
  let manualLevel = 0; // 0 = 아직 되감기 전
  for (;;) {
    // 루프 바디 시작부에서 취소를 본다 (C8).
    if (ctx.cancelled) return;
    let input;
    try {
      input = await reactive.waitForInput();
    } catch {
      // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다 (C6).
      return;
    }
    if (input.type !== 'advance') continue;

    if (manualLevel === 0 || manualLevel >= maxLevel) {
      await ctx.emit({ type: 'rewind', payload: {} });
      manualLevel = 1;
    } else {
      manualLevel += 1;
    }
    if (ctx.cancelled) return;
    await emitLevel(manualLevel);
    if (manualLevel >= maxLevel) {
      if (ctx.cancelled) return;
      await ctx.emit({ type: 'result', payload: { levelsA: a.levels, levelsB: b.levels } });
    }
  }
}
