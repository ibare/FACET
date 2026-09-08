/**
 * splitUntilOne — 분할. 더 쪼갤 수 없을 때까지 반으로 가른다.
 *
 * 이 조각이 답하는 질문 하나: **쪼개는 동안 무엇이 바뀌는가.**
 * 답은 "묶음의 경계뿐" 이다. 값은 한 칸도 움직이지 않고 좌우 순서도 그대로이며,
 * 견줌은 한 번도 일어나지 않는다. 그래서 이 알고리즘에는 비교 연산이 없다 —
 * 있는 것은 구간을 반으로 나누는 셈뿐이다.
 *
 * ── 식별자 문법
 *   group:<lo>-<hi>   묶음. 배열의 닫힌 구간 [lo, hi] 로 이름 짓는다.
 *                     이진 분할이 만드는 구간은 서로 겹치지 않으므로 구간이 곧 유일 id.
 *
 * ── 이벤트 (전부 이 facet 고유. 표준 어휘로 표현되는 장면이 아니다)
 *   group-appear    target `group:<id>`
 *                   payload { groupId: string; lo: number; hi: number;
 *                             depth: number; size: number }
 *                   맨 위에 묶음 하나가 생긴다. 아직 아무 일도 일어나지 않은 상태.
 *                   silent: 아니다.
 *
 *   split           target `group:<parentId>`
 *                   payload { parentId: string; parentDepth: number;
 *                             parentLo: number; parentHi: number;
 *                             cutAfter: number;
 *                             leftId: string; leftLo: number; leftHi: number;
 *                             rightId: string; rightLo: number; rightHi: number }
 *                   한 묶음이 둘로 갈라진다. `cutAfter` 는 가른 자리 — 왼쪽 묶음의
 *                   마지막 칸 번호이며, 화면의 찢어지는 지점이 그 칸의 오른쪽 경계다.
 *                   silent: 아니다.
 *
 *   leaves-reached  payload { depth: number; groupIds: string[] }
 *                   모든 묶음이 낱개가 되어 더 가를 자리가 없다. 이 조각의 끝.
 *                   silent: 아니다.
 *
 *   rewind          payload 없음.
 *                   처음으로 되감는다. 자동 재생이 끝난 뒤 `advance` 로 다시
 *                   한 걸음씩 짚어 볼 때 첫 누름에서 발신된다 (S-piece).
 *                   silent: 아니다.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없으므로 `ctx.metric` 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SplitUntilOneData = {
  type: 'split-until-one';
  /** 가를 대상. 값 자체는 이 조각에서 한 번도 견주어지지 않는다. */
  values: number[];
  /** 걸음 간격 (S-piece). 저작 선언이며 화면 애니메이션 시간이 여기 더해진다. */
  stepMs: number;
};

/** 배열의 닫힌 구간 하나 = 묶음 하나. */
export type SplitGroup = {
  id: string;
  lo: number;
  hi: number;
  depth: number;
};

/** 한 번의 갈라짐. 부모 구간과 그것이 낳은 두 구간. */
export type SplitStep = {
  parentId: string;
  parentDepth: number;
  parentLo: number;
  parentHi: number;
  /** 가른 자리 — 왼쪽 묶음의 마지막 칸 번호. */
  cutAfter: number;
  leftId: string;
  leftLo: number;
  leftHi: number;
  rightId: string;
  rightLo: number;
  rightHi: number;
};

export type SplitPlan = {
  root: SplitGroup;
  /** 갈라짐을 층 순서(너비 우선)로 늘어놓은 것. 층이 위에서 아래로 쌓이는 순서다. */
  splits: SplitStep[];
  /** 더 가를 수 없는 낱개 묶음들. 왼쪽에서 오른쪽 순. */
  leaves: SplitGroup[];
  /** 가장 깊은 층 번호. 층 수는 이 값 + 1. */
  maxDepth: number;
};

function groupId(lo: number, hi: number): string {
  return `${lo}-${hi}`;
}

/**
 * 길이 `count` 인 배열을 반으로 계속 가를 때 생기는 구간들을 셈한다.
 *
 * 순수 함수이며 값을 보지 않는다 — 갈라짐은 값과 무관하게 자리만으로 정해진다는
 * 것이 이 조각의 주장이므로, 셈하는 쪽도 값을 받지 않는 편이 정직하다.
 *
 * 층 순서(너비 우선)로 훑는다. 한 층이 다 갈라진 뒤 다음 층이 갈라져야 화면에서
 * 층이 위에서 아래로 쌓이는 것으로 보인다.
 */
export function computeSplitUntilOnePlan(count: number): SplitPlan {
  const root: SplitGroup = { id: groupId(0, count - 1), lo: 0, hi: count - 1, depth: 0 };
  const splits: SplitStep[] = [];
  const leaves: SplitGroup[] = [];
  let maxDepth = 0;
  if (count <= 0) return { root, splits, leaves, maxDepth };

  const queue: SplitGroup[] = [root];
  while (queue.length > 0) {
    const g = queue.shift() as SplitGroup;
    if (g.depth > maxDepth) maxDepth = g.depth;
    if (g.lo === g.hi) {
      leaves.push(g);
      continue;
    }
    const cutAfter = Math.floor((g.lo + g.hi) / 2);
    const left: SplitGroup = {
      id: groupId(g.lo, cutAfter),
      lo: g.lo,
      hi: cutAfter,
      depth: g.depth + 1,
    };
    const right: SplitGroup = {
      id: groupId(cutAfter + 1, g.hi),
      lo: cutAfter + 1,
      hi: g.hi,
      depth: g.depth + 1,
    };
    splits.push({
      parentId: g.id,
      parentDepth: g.depth,
      parentLo: g.lo,
      parentHi: g.hi,
      cutAfter,
      leftId: left.id,
      leftLo: left.lo,
      leftHi: left.hi,
      rightId: right.id,
      rightLo: right.lo,
      rightHi: right.hi,
    });
    queue.push(left, right);
  }
  return { root, splits, leaves, maxDepth };
}

/**
 * 한 걸음이 끝난 뒤의 문. `false` 면 중단 (취소되었거나 되감기 요청).
 *
 * 문을 emit **뒤**에 둔다. 그래야 자동 재생의 첫 화면이 곧바로 뜨고, 손으로
 * 짚는 재생에서도 첫 `advance` 한 번에 되감기와 첫 걸음이 함께 보인다 (S-piece).
 */
type Gate = () => Promise<boolean>;

async function play(
  ctx: ReactiveContext<SplitUntilOneData>,
  plan: SplitPlan,
  gate: Gate,
): Promise<boolean> {
  await ctx.emit({
    type: 'group-appear',
    target: `group:${plan.root.id}`,
    payload: {
      groupId: plan.root.id,
      lo: plan.root.lo,
      hi: plan.root.hi,
      depth: plan.root.depth,
      size: plan.root.hi - plan.root.lo + 1,
    },
  });
  if (!(await gate())) return false;

  for (const s of plan.splits) {
    await ctx.emit({
      type: 'split',
      target: `group:${s.parentId}`,
      payload: {
        parentId: s.parentId,
        parentDepth: s.parentDepth,
        parentLo: s.parentLo,
        parentHi: s.parentHi,
        cutAfter: s.cutAfter,
        leftId: s.leftId,
        leftLo: s.leftLo,
        leftHi: s.leftHi,
        rightId: s.rightId,
        rightLo: s.rightLo,
        rightHi: s.rightHi,
      },
    });
    if (!(await gate())) return false;
  }

  await ctx.emit({
    type: 'leaves-reached',
    payload: {
      depth: plan.maxDepth,
      groupIds: plan.leaves.map((l) => l.id),
    },
  });
  return true;
}

export const splitUntilOneAlgorithm = async (
  ctx: FacetContext<SplitUntilOneData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<SplitUntilOneData>;
  const values = Array.isArray(rc.data?.values) ? rc.data.values : [];
  if (values.length === 0) return;

  const plan = computeSplitUntilOnePlan(values.length);
  const stepMs = typeof rc.data.stepMs === 'number' ? rc.data.stepMs : 800;

  /** 자동 재생 — 걸음 간격은 선언이 정한다. */
  const autoGate: Gate = () => rc.sleep(stepMs);

  /** 손으로 짚는 재생 — `advance` 한 번이 한 걸음. */
  const advanceGate: Gate = async () => {
    for (;;) {
      if (rc.cancelled) return false;
      try {
        const ev = await rc.waitForInput();
        if (ev.type === 'advance') return true;
      } catch {
        return false;
      }
    }
  };

  if (!(await play(rc, plan, autoGate))) return;

  // 자동 재생이 끝났다. 이제 advance 를 기다리다가, 첫 누름에 되감고 곧바로
  // 첫 걸음까지 보인다 — 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다.
  for (;;) {
    if (!(await advanceGate())) return;
    await rc.emit({ type: 'rewind' });
    if (!(await play(rc, plan, advanceGate))) return;
  }
};
