/**
 * mark-visited-or-loop — 방문 표시가 없으면 탐색이 고리를 벗어나지 못한다.
 *
 * 한 가지 걸음 규칙을 두 번 돌린다. 규칙은 **"지금 자리의 이웃 목록을 앞에서부터
 * 훑어 갈 수 있는 첫 이웃으로 옮긴다"** 이고, 두 회차의 차이는 오직 하나 —
 * 다녀간 자리에 표시를 남기고 그 표시를 읽는가다.
 *
 *   1회차 (marks: false) — 표시가 없다. C 에서 이웃 목록의 첫 칸이 늘 A 이므로
 *                          A→B→C→A 를 되풀이한다. 상한(maxSteps)에서 끊는다.
 *   2회차 (marks: true)  — 표시를 읽는다. C 에서 A 는 이미 표시가 있어 건너뛰고
 *                          다음 이웃 D 로 나간다. 갈 곳이 없으면 멈춘다.
 *
 * 화면에 뜨는 수(걸음 수 · 닿은 자리 수 · 닿지 못한 자리)는 **하나도 싣지 않는다.**
 * 전부 밟은 자리의 차례에서 나오므로 장면이 센다 (`scene.ts` 의 `stepsOf` ·
 * `reachedOf` · `missedOf` · `wearOf` · `markedOf`). 여기서 함께 세어 실으면 같은
 * 것을 두 자리에서 세는 꼴이 되어 언젠가 갈린다.
 *
 * 손으로 적은 걸음표는 없다 — 순서를 정하는 것은 `data.adjacency` 이지 저작자가
 * 아니다 (S-piece).
 *
 * ── 확장 이벤트 (C2) ──────────────────────────────────────────────────
 *
 * | type            | payload                                          | silent |
 * | --------------- | ------------------------------------------------ | ------ |
 * | `walk-begin`    | `{ marks: boolean }`                             | 아니오 |
 * | `skip-neighbor` | `{ to: string }`                                 | 아니오 |
 * | `step-move`     | `{ to: string }`                                 | 아니오 |
 * | `walk-stalled`  | 없음 — 고리에 갇힌 채 상한에 걸렸다는 신호       | 아니오 |
 * | `walk-escaped`  | 없음 — 갈 곳이 없는데 다 밟았다는 신호           | 아니오 |
 * | `rewind`        | 없음 — 한 걸음씩 보기로 되감는다는 신호          | 아니오 |
 * | `done`          | (표준) 자동 재생 끝                              | **예** |
 *
 * `done` 은 앞 걸음의 결말을 확정할 뿐 화면을 바꾸지 않는데 문(gate)을 지나지 않아
 * 띠에 0ms 짜리 눈금이 선다. 앞 걸음과 한 뜻이므로 `silent` 로 접는다 (S-runtime).
 *
 * 식별자 (C1): 쓰지 않는다. 걸음이 가리키는 자리는 전부 payload 가 정규 경로다.
 *
 * 메트릭은 없다 (조각 — S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MarkVisitedOrLoopData = {
  type: 'graph-walk';
  /** 정점 이름. 화면 표기이자 adjacency 의 키. */
  nodes: string[];
  /** 이웃을 보는 순서. 저작 결정이므로 배열 순서가 그대로 규칙이다. */
  adjacency: Record<string, string[]>;
  start: string;
  /** 표시 없는 회차를 끊는 걸음 상한 (C8 — 되풀이 걸음에도 끝이 있어야 한다). */
  maxSteps: number;
  /** 걸음 간격. 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/**
 * 한 걸음(정확히는 한 emit) 뒤에 놓이는 문.
 *
 * 자동 재생에서는 `ctx.sleep(stepMs)`, 한 걸음씩 보기에서는 `waitForInput` 이
 * 들어간다. false 를 돌려주면 그 자리에서 걷기를 접는다.
 */
type Gate = () => Promise<boolean>;

/** 다음 이웃 후보를 고른 결과. */
type Choice =
  | { kind: 'move'; to: string }
  | { kind: 'skip'; to: string }
  | { kind: 'stop' };

const DEFAULT_STEP_MS = 650;

function neighborsOf(data: MarkVisitedOrLoopData, node: string): string[] {
  return data.adjacency[node] ?? [];
}

/**
 * 한 회차를 걷는다.
 *
 * @returns 끝까지 걸었으면 true, 취소되었으면 false.
 */
async function walk(
  ctx: ReactiveContext<MarkVisitedOrLoopData>,
  marks: boolean,
  gate: Gate,
): Promise<boolean> {
  const data = ctx.data;
  const start = data.start;

  await ctx.emit({ type: 'walk-begin', payload: { marks } });

  /**
   * 다녀간 자리.
   *
   * **표시란 바로 이 기록이고, 표시를 읽는 회차만 그것을 본다** — 그래서 `marked`
   * 를 따로 두지 않는다. 한때 둘로 나뉘어 있었는데 marks 회차에서 내용이 언제나
   * 같았다. 같은 것을 두 이름으로 두면 규칙이 두 곳에 적히는 것이다.
   */
  const reached = new Set<string>([start]);
  let current = start;

  if (!(await gate())) return false;

  let steps = 0;
  while (steps < data.maxSteps) {
    if (ctx.cancelled) return false;

    // 이웃 목록을 앞에서부터 훑는다. 표시를 읽는 회차에서만 이미 본 자리를 건너뛴다.
    let choice: Choice = { kind: 'stop' };
    for (const neighbor of neighborsOf(data, current)) {
      if (ctx.cancelled) return false;
      if (marks && reached.has(neighbor)) {
        choice = { kind: 'skip', to: neighbor };
        await ctx.emit({ type: 'skip-neighbor', payload: { to: neighbor } });
        if (!(await gate())) return false;
        continue;
      }
      choice = { kind: 'move', to: neighbor };
      break;
    }

    if (choice.kind !== 'move') break;

    const next = choice.to;
    steps += 1;
    await ctx.emit({ type: 'step-move', payload: { to: next } });
    current = next;
    reached.add(current);

    if (!(await gate())) return false;
  }

  // 갈림은 여기서만 내린다. 셈한 수는 싣지 않는다 — 장면이 같은 자취에서 센다.
  const missed = data.nodes.filter((n) => !reached.has(n));
  if (missed.length > 0) {
    await ctx.emit({ type: 'walk-stalled' });
  } else {
    await ctx.emit({ type: 'walk-escaped' });
  }
  return true;
}

/** 두 회차를 잇달아 걷는다 — 표시 없이 한 번, 표시를 켜고 한 번. */
async function runBoth(ctx: ReactiveContext<MarkVisitedOrLoopData>, gate: Gate): Promise<void> {
  if (!(await walk(ctx, false, gate))) return;
  // 첫 회차의 결말을 읽을 시간. 다음 발신이 화면을 지우므로 문은 여기 있어야 한다.
  // 마지막 회차의 결말 뒤에는 두지 않는다 — 지울 것이 오지 않으므로 빈 기다림이 된다.
  if (!(await gate())) return;
  if (!(await walk(ctx, true, gate))) return;
  // 문을 지나지 않는 발신이라 벽시계가 0 이다. 앞 걸음의 결말과 한 뜻이므로 접는다.
  await ctx.emit({ type: 'done', silent: true });
}

export const markVisitedOrLoop = async (
  ctx: FacetContext<MarkVisitedOrLoopData>,
): Promise<void> => {
  // reactive 메커니즘이 주입하는 확장 ctx (sleep / waitForInput) — context.ts 가
  // 안내하는 단언 경로다.
  const rc = ctx as ReactiveContext<MarkVisitedOrLoopData>;
  const stepMs =
    typeof rc.data.stepMs === 'number' && rc.data.stepMs > 0 ? rc.data.stepMs : DEFAULT_STEP_MS;

  // 1) 자동 재생 — 누르지 않아도 화면이 할 말을 마친다.
  await runBoth(rc, () => rc.sleep(stepMs));

  // 2) 한 걸음씩 — 곱씹으며 읽고 싶은 사람을 위한 경로. 처음 누르는 advance 는
  //    되감고 첫 걸음까지 보인다 (S-piece). 그래서 되감기 직후의 첫 문만
  //    그냥 통과시킨다.
  while (!rc.cancelled) {
    // `advance` 만 걸음으로 친다 — 아래 문에서도 같다. 지금은 reactive 메커니즘이
    // reset/speed 를 스스로 처리해 advance 만 흘려보내지만, 이 조각에 위젯 입력이
    // 하나라도 붙으면 그것까지 걸음으로 세게 된다.
    if ((await rc.waitForInput()).type !== 'advance') continue;
    if (rc.cancelled) return;
    await rc.emit({ type: 'rewind' });

    let firstGate = true;
    await runBoth(rc, async () => {
      if (firstGate) {
        firstGate = false;
        return true;
      }
      while ((await rc.waitForInput()).type !== 'advance') {
        if (rc.cancelled) return false;
      }
      return !rc.cancelled;
    });
  }
};
