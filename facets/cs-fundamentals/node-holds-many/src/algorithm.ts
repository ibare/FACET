/**
 * node-holds-many — 다분기 노드에서 값을 찾는다.
 *
 * 자리 하나가 키를 여럿 담고, 자식은 담긴 키 수보다 하나 많다. 한 자리에
 * 이르면 그 안의 키를 왼쪽에서 오른쪽으로 훑는다. target 이 어느 키보다
 * 크면 다음 키로 넘어가고, 어느 키보다 작으면 그 앞의 틈으로 자식을 골라
 * 내려간다. 같으면 멈춘다. "내려갈 곳을 고르는 일이 자리 안에서 벌어진다"
 * 는 것이 이 조각의 동사이므로, 걸음은 실제로 `ctx.data.nodes` 를 훑어
 * 만든다 — 손으로 적은 배열이 아니다.
 *
 * ── 걸음은 자리를 가리킬 뿐 수를 싣지 않는다
 *
 * 전에는 짚은 칸의 값(`key`) · 견줌의 결과(`cmp`) · 내려갈 자리(`childId`) 를
 * 함께 실어 보냈다. 셋 다 **나무와 찾는 값에서 셀 수 있는 것**이고, 앞의 둘은
 * 화면에 `50 > 30` 이라는 등식으로 칸의 숫자와 나란히 뜬다. 여기서도 세면 셈이
 * 둘이 되고, 둘이 갈리는 날 화면 안에서 두 수가 다툰다. 그래서 걸음은 **어느
 * 자리의 몇 번째 칸/틈인가**만 가리키고 수는 `scene.ts` 의 `keyAt` ·
 * `compareAt` · `childAt` 이 정본이다.
 *
 * 이벤트 어휘
 *
 * key-sweep  (확장) 자리 안의 키 하나를 훑어 target 과 비교한다.
 *   payload: { nodeId: string; keyIndex: number }
 *   silent:  아니다 — 커서가 그 칸으로 옮겨가고 캡션이 갱신된다.
 *
 * descend    (확장) 두 키 사이(또는 양 끝)의 틈을 골라 자식으로 내려간다.
 *   payload: { nodeId: string; gapIndex: number }
 *   nodeId 는 갈림길을 고르는 자리(출발지) — 내려갈 곳이 그 자리 안에서
 *   정해진다는 것이 이 조각의 동사이므로 target 은 도착지가 아니라 출발지다.
 *   silent:  아니다 — 커서가 한 층 내려간다.
 *
 * mark       (표준) 찾은 키를 표시한다.
 *   payload: { nodeId: string; keyIndex: number }
 *   silent:  아니다 — 그 칸이 종결 상태로 물든다.
 *
 * done       (표준) payload 없음. 탐색이 멈췄다.
 *   silent:  **그렇다.** 마지막 `mark` 가 이미 "찾음" 을 말했으므로 화면이
 *   달라지지 않는다. 조용하지 않게 두면 띠에 아무 말도 하지 않는 눈금이 하나
 *   더 서서, 끌어 보는 사람이 같은 화면을 두 걸음으로 읽는다. 조용한 발신은
 *   걸음을 늘리지 않고 그 걸음의 장면에 접힌다 (`runtime/scene.ts`).
 *
 * rewind     (확장) 처음 상태로 되돌린다. payload 없음.
 *   띠(`CONTROL_SET.pieceScrub`)를 단 뒤로 누를 `advance` 가 없어 아래 손짚기
 *   루프는 도달 불능이다. 이행이 끝난 뒤 일괄로 걷어낸다
 *   (`tasks/scene-migration-protocol.md` 7 절).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 한 자리(노드) — 담긴 키와, 키 수보다 하나 많은 자식. 잎이면 children 생략. */
export type NodeHoldsManySpec = {
  keys: number[];
  children?: string[];
};

export type NodeHoldsManyData = {
  type: 'node-holds-many';
  /** 자동 재생 한 걸음의 간격(ms). */
  stepMs: number;
  /** 찾는 값. */
  target: number;
  rootId: string;
  nodes: Record<string, NodeHoldsManySpec>;
};

/**
 * 한 걸음. 이벤트가 아니라 **도메인 사실**이다 — 무엇을 훑었고 어디로 내려갔는지.
 *
 * 이벤트 객체를 그대로 쌓아 두면 `ctx.emit(step)` 이 되어 `type` 이 리터럴이
 * 아니게 된다 (C2). 걸음은 순회의 결과로 모으되, 이벤트로 옮기는 일은
 * `emitStep` 의 switch 안에서 리터럴로 한다.
 */
type Step =
  | { kind: 'sweep'; nodeId: string; keyIndex: number }
  | { kind: 'match'; nodeId: string; keyIndex: number }
  | { kind: 'descend'; nodeId: string; gapIndex: number }
  | { kind: 'end' };

/**
 * `ctx.data.nodes` 를 뿌리부터 실제로 훑어 걸음을 만든다. 반환된 배열은 이
 * 순회의 결과물이지 사람이 적은 걸음표가 아니다 (S-piece).
 */
function buildSteps(data: NodeHoldsManyData): Step[] {
  const { nodes, target } = data;
  const steps: Step[] = [];
  let currentId: string | undefined = data.rootId;

  while (currentId !== undefined) {
    const node = nodes[currentId];
    if (!node) break;
    const id = currentId;
    let nextId: string | undefined;
    let matched = false;

    for (let i = 0; i < node.keys.length; i++) {
      const key = node.keys[i]!;
      steps.push({ kind: 'sweep', nodeId: id, keyIndex: i });
      if (target === key) {
        steps.push({ kind: 'match', nodeId: id, keyIndex: i });
        matched = true;
        break;
      }
      if (target < key) {
        steps.push({ kind: 'descend', nodeId: id, gapIndex: i });
        nextId = node.children?.[i];
        break;
      }
      if (i === node.keys.length - 1) {
        const gapIndex = node.keys.length;
        steps.push({ kind: 'descend', nodeId: id, gapIndex });
        nextId = node.children?.[gapIndex];
      }
    }

    if (matched) {
      steps.push({ kind: 'end' });
      return steps;
    }
    currentId = nextId;
  }

  steps.push({ kind: 'end' });
  return steps;
}

/** 걸음 하나를 이벤트로 옮긴다. `type` 은 여기서만, 리터럴로 쓴다 (C2). */
async function emitStep(ctx: FacetContext<NodeHoldsManyData>, step: Step): Promise<void> {
  switch (step.kind) {
    case 'sweep':
      await ctx.emit({
        type: 'key-sweep',
        target: `node:${step.nodeId}`,
        payload: { nodeId: step.nodeId, keyIndex: step.keyIndex },
      });
      return;
    case 'match':
      await ctx.emit({
        type: 'mark',
        target: `node:${step.nodeId}`,
        payload: { nodeId: step.nodeId, keyIndex: step.keyIndex },
      });
      return;
    case 'descend':
      await ctx.emit({
        type: 'descend',
        target: `node:${step.nodeId}`,
        payload: { nodeId: step.nodeId, gapIndex: step.gapIndex },
      });
      return;
    case 'end':
      // 화면이 달라지지 않는 끝맺음이라 걸음을 늘리지 않는다 (위 어휘 표).
      await ctx.emit({ type: 'done', silent: true });
      return;
  }
}

export async function nodeHoldsManyAlgorithm(ctx: FacetContext<NodeHoldsManyData>): Promise<void> {
  const rc = ctx as ReactiveContext<NodeHoldsManyData>;
  const steps = buildSteps(ctx.data);
  const stepMs = ctx.data.stepMs;

  // 자동 재생 — 뿌리에서 실제로 훑어 얻은 걸음을 순서대로 보여 준다.
  for (const step of steps) {
    if (rc.cancelled) return;
    await emitStep(ctx, step);
    if (rc.cancelled) return;
    const ok = await rc.sleep(stepMs);
    if (!ok) return;
  }

  // 자동 재생이 끝난 뒤 — advance 를 누를 때마다 같은 걸음을 하나씩 다시 보인다.
  // cursor 를 steps.length 로 두어, 첫 press 가 반드시 처음으로 되감도록 한다.
  let cursor = steps.length;
  while (!rc.cancelled) {
    const input = await rc.waitForInput();
    if (rc.cancelled) return;
    if (input.type !== 'advance') continue;

    if (cursor >= steps.length) {
      cursor = 0;
      await ctx.emit({ type: 'rewind' });
      if (rc.cancelled) return;
    }
    await emitStep(ctx, steps[cursor]!);
    cursor++;
  }
}
