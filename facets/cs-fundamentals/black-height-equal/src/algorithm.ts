/**
 * BlackHeightEqual — 뿌리에서 잎(nil)까지 네 경로를 실제로 따라 내려가며
 * 지나는 검은 자리를 하나씩 센다. 데이터는 성한 레드-블랙 트리이므로 길이가
 * 달라도(2 또는 3) 넷 다 검은 수는 같다(2).
 *
 * 식별자
 *   node:<id>   실제 노드. 뿌리(root) 자신은 걸음에 없다 — 뿌리 아래부터 센다.
 *   nil:<id>    <id> 노드가 갖지 못한 자식 자리. 자식이 둘 다 없는 노드는
 *               그 하나의 nil 로 경로를 맺는다 — 좌/우 nil 을 둘 다 세면
 *               같은 수를 두 번 보여 주는 것이라 하나만 짚는다.
 *
 * 이벤트 (전부 화면이 바뀌는 step boundary — silent 없음)
 *   walk-step     { id, kind: 'node' | 'nil', color: 'red' | 'black',
 *                   counted: boolean, runningCount: number, pathIndex: number }
 *                 커서가 한 자리 내려간다. counted 는 이 자리가 검어서(또는
 *                 nil 이라서) 셈에 들어갔는지. nil 은 항상 counted:true.
 *   path-settled  { pathIndex, blackCount, nilId }
 *                 경로 하나를 다 내려갔다. 그 경로의 검은 수를 nilId 곁에
 *                 남기고 커서가 뿌리로 돌아간다.
 *   all-settled   { blackCount }
 *                 네 경로를 다 돌았다. 남은 수가 전부 같다는 것을 강조한다.
 *   rewind        {}
 *                 자동 재생이 끝난 뒤 처음 누르는 advance 가 처음으로 되감는다.
 *                 이후 advance 는 그 지점부터 같은 순서를 한 걸음씩 다시 밟는다.
 *
 * `done` 은 쓰지 않는다 — reactive 조각은 자동 재생이 끝난 뒤에도 advance
 * 입력을 계속 받아야 해서 "끝"이라는 사건이 없다. all-settled 가 그 매듭을
 * 대신 짓는다.
 */

import type { AlgorithmFn, ReactiveContext } from '@ffacet/core/runtime';

export type RBColor = 'red' | 'black';

export type RBNode = {
  id: string;
  value: number;
  color: RBColor;
  left?: RBNode;
  right?: RBNode;
};

export type BlackHeightEqualData = {
  type: 'black-height-equal';
  root: RBNode;
  stepMs: number;
};

type WalkStep =
  | { kind: 'node'; id: string; color: RBColor }
  | { kind: 'nil'; id: string };

type WalkPath = {
  pathIndex: number;
  steps: WalkStep[];
  nilId: string;
};

/**
 * 뿌리 아래 경로들을 실제로 따라 내려가며 만든다 — 미리 적어 둔 표를 훑지
 * 않는다. 뿌리 자신은 걸음에 넣지 않는다. 자식이 둘 다 없는 노드는 nil
 * 자리 하나로 경로를 맺는다(위 파일 상단 주석 참조).
 */
function buildPaths(root: RBNode): WalkPath[] {
  const paths: WalkPath[] = [];

  function settle(trail: WalkStep[], nilId: string): void {
    paths.push({
      pathIndex: paths.length,
      steps: [...trail, { kind: 'nil', id: nilId }],
      nilId,
    });
  }

  function walk(node: RBNode, trail: WalkStep[]): void {
    const nextTrail: WalkStep[] = [...trail, { kind: 'node', id: node.id, color: node.color }];
    const isLeaf = !node.left && !node.right;
    if (isLeaf) {
      settle(nextTrail, node.id);
      return;
    }
    if (node.left) walk(node.left, nextTrail);
    else settle(nextTrail, node.id);
    if (node.right) walk(node.right, nextTrail);
    else settle(nextTrail, node.id);
  }

  if (root.left) walk(root.left, []);
  else settle([], root.id);
  if (root.right) walk(root.right, []);
  else settle([], root.id);

  return paths;
}

type StepAction = () => Promise<void>;

/**
 * 경로마다 걸음을 실제 ctx.emit 호출로 편다. counted / runningCount 는 이
 * 걸음에서 계산한 값이지 미리 적어 둔 표가 아니다 — 세는 것이 이 조각의
 * 동사다.
 */
function buildActions(ctx: ReactiveContext<BlackHeightEqualData>, paths: WalkPath[]): StepAction[] {
  const actions: StepAction[] = [];
  let lastBlackCount = 0;

  for (const path of paths) {
    // 셈은 여기서, 길을 실제로 밟으며 한다. 걸음 함수 안에서 세면 그 변수가
    // 클로저에 남아 되짚기 두 바퀴째에 첫 바퀴 끝값에서 이어진다 — 화면에
    // "지금까지 4" 같은 거짓이 뜬다 (S-piece: 화면이 거짓을 말하지 않게).
    let runningCount = 0;

    for (const step of path.steps) {
      const counted = step.kind === 'nil' || step.color === 'black';
      if (counted) runningCount += 1;
      const at = runningCount; // 이 걸음 시점의 값으로 굳힌다.
      const color = step.kind === 'nil' ? ('black' as const) : step.color;
      const target = step.kind === 'nil' ? `nil:${step.id}` : `node:${step.id}`;

      actions.push(async () => {
        await ctx.emit({
          type: 'walk-step',
          target,
          payload: {
            id: step.id,
            kind: step.kind,
            color,
            counted,
            runningCount: at,
            pathIndex: path.pathIndex,
          },
        });
      });
    }

    const blackCount = runningCount;
    lastBlackCount = blackCount;
    actions.push(async () => {
      await ctx.emit({
        type: 'path-settled',
        target: `nil:${path.nilId}`,
        payload: { pathIndex: path.pathIndex, blackCount, nilId: path.nilId },
      });
    });
  }

  const finalBlackCount = lastBlackCount;
  actions.push(async () => {
    await ctx.emit({ type: 'all-settled', payload: { blackCount: finalBlackCount } });
  });

  return actions;
}

export const blackHeightEqual: AlgorithmFn<BlackHeightEqualData> = async (rawCtx) => {
  // reactive 메커니즘이 주입하는 확장 컨텍스트로 단언한다 — registerAlgorithm
  // 시그니처는 FacetContext 그대로 두고, 실제 실행 시점의 mechanismKind:'reactive'
  // 가 sleep/waitForInput 을 실제로 채워 준다 (packages/core/src/runtime/context.ts).
  const ctx = rawCtx as ReactiveContext<BlackHeightEqualData>;
  const { root, stepMs } = ctx.data;
  const paths = buildPaths(root);
  const actions = buildActions(ctx, paths);

  // 자동 재생 — 걸음마다 stepMs 만큼 쉬며 뿌리에서 잎까지 순서대로 보인다.
  for (const action of actions) {
    if (ctx.cancelled) return;
    await action();
    if (ctx.cancelled) return;
    const ok = await ctx.sleep(stepMs);
    if (!ok) return;
  }

  // 자동 재생이 끝났다 — 이제부터는 advance 로 한 걸음씩 짚는다. cursor 를
  // 이미 actions.length 로 채워 두면 첫 입력이 곧 되감기 분기를 타므로,
  // "처음 누르는 advance 는 되감고 첫 걸음까지 보인다"(S-piece)를 따로 적을
  // 필요가 없다.
  let cursor = actions.length;
  while (!ctx.cancelled) {
    const input = await ctx.waitForInput();
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;
    if (cursor >= actions.length) {
      cursor = 0;
      await ctx.emit({ type: 'rewind', payload: {} });
      if (ctx.cancelled) return;
    }
    await actions[cursor]();
    cursor += 1;
  }
};
