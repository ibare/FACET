/**
 * bst-compare-and-go 조각 알고리즘.
 *
 * 질문: "이진 탐색 트리는 한 번 비교할 때마다 어떻게 아래로 내려가는가?"
 * 동사: 내려간다 — 비교 한 번마다 한쪽 가지를 통째로 후보에서 빼고 한 층 아래로
 * 간다. 버린 쪽은 화면에서 지워지지 않고, 옅어진 채로 남아 "더 이상 후보가
 * 아님"만 표시한다.
 *
 * 데이터는 호스트가 확정한 실측 트리 — 50/30/70/20/40/60/80, 찾는 값 40.
 * 걸음은 그 트리를 실제로 타고 내려가며 만든다 (`buildBeats`) — 손으로 적은
 * 배열이 아니라 순회의 결과다.
 *
 * 식별자: `node:<id>` — 트리 노드.
 *
 * 이벤트 (C2):
 *   'compare'  target: `node:<id>`
 *     payload: { nodeId: string; nodeValue: number; needle: number; result: 'lt' | 'gt' | 'eq' }
 *     silent: false — 커서가 그 노드로 옮겨가고 비교 캡션이 갱신된다.
 *   'fold'     target: `node:<rootId>`  (C2 의 BST 서브트리 폴드 어휘)
 *     payload: { rootId: string; side: 'L' | 'R'; nodes: string[]; remaining: number }
 *     silent: false — 반대쪽 서브트리 전체가 후보에서 빠지며 옅어진다.
 *     `nodes` 는 실제 서브트리 순회로 얻은 id 목록이고, `remaining` 은 남은
 *     서브트리(계속 내려갈 쪽)의 실제 노드 수다.
 *   'rewind'   facet 고유 확장. target 없음, payload 없음.
 *     silent: false — 자동 재생이 끝난 뒤 처음 누르는 advance 가 화면을 처음
 *     상태로 되돌린다. 같은 advance 안에서 곧바로 첫 걸음(compare)이 이어진다
 *     (S-piece: 되감기만 하고 멈추면 반응이 없는 것으로 읽힌다).
 *   'done'     target: `node:<nodeId>`
 *     payload: { nodeId: string }
 *     silent: true — 메타 이벤트. 마지막 compare('eq') 가 이미 "찾음"을
 *     보여줬으므로 추가 시각 변화가 없다.
 *
 * projector 는 이 넷을 전부 처리한다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BstCompareAndGoNode = {
  value: number;
  left: string | null;
  right: string | null;
};

export type BstCompareAndGoData = {
  type: 'bst-compare-and-go';
  nodes: Record<string, BstCompareAndGoNode>;
  rootId: string;
  needle: number;
  stepMs: number;
};

type CompareBeat = {
  kind: 'compare';
  nodeId: string;
  nodeValue: number;
  needle: number;
  result: 'lt' | 'gt' | 'eq';
};

type FoldBeat = {
  kind: 'fold';
  rootId: string;
  side: 'L' | 'R';
  nodes: string[];
  remaining: number;
};

type Beat = CompareBeat | FoldBeat;

/** 서브트리 전체 id 를 실제로 훑어 모은다 — 사람이 적은 목록이 아니라 순회의 결과. */
function subtreeIds(nodes: Record<string, BstCompareAndGoNode>, id: string | null): string[] {
  if (!id) return [];
  const node = nodes[id];
  if (!node) return [];
  return [id, ...subtreeIds(nodes, node.left), ...subtreeIds(nodes, node.right)];
}

/** 루트에서 needle 을 향해 실제로 트리를 타고 내려가며 걸음을 만든다. */
function buildBeats(data: BstCompareAndGoData): Beat[] {
  const beats: Beat[] = [];
  let currentId: string | null = data.rootId;
  while (currentId) {
    const node: BstCompareAndGoNode | undefined = data.nodes[currentId];
    if (!node) break;
    const result: 'lt' | 'gt' | 'eq' =
      data.needle < node.value ? 'lt' : data.needle > node.value ? 'gt' : 'eq';
    beats.push({ kind: 'compare', nodeId: currentId, nodeValue: node.value, needle: data.needle, result });
    if (result === 'eq') break;
    const goLeft: boolean = result === 'lt';
    const keepId: string | null = goLeft ? node.left : node.right;
    const dropId: string | null = goLeft ? node.right : node.left;
    const droppedNodes: string[] = subtreeIds(data.nodes, dropId);
    if (droppedNodes.length > 0) {
      beats.push({
        kind: 'fold',
        rootId: currentId,
        side: goLeft ? 'R' : 'L',
        nodes: droppedNodes,
        remaining: subtreeIds(data.nodes, keepId).length,
      });
    }
    currentId = keepId;
  }
  return beats;
}

/** 걸음 하나를 실제 이벤트로 내보낸다 — type 은 이 스위치 안에서만 리터럴로 쓴다 (C2). */
async function playBeat(ctx: FacetContext<BstCompareAndGoData>, beat: Beat): Promise<void> {
  if (beat.kind === 'compare') {
    await ctx.emit({
      type: 'compare',
      target: `node:${beat.nodeId}`,
      payload: {
        nodeId: beat.nodeId,
        nodeValue: beat.nodeValue,
        needle: beat.needle,
        result: beat.result,
      },
    });
    return;
  }
  await ctx.emit({
    type: 'fold',
    target: `node:${beat.rootId}`,
    payload: {
      rootId: beat.rootId,
      side: beat.side,
      nodes: beat.nodes,
      remaining: beat.remaining,
    },
  });
}

export async function bstCompareAndGoAlgorithm(ctx: FacetContext<BstCompareAndGoData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BstCompareAndGoData>;
  const beats = buildBeats(rctx.data);
  let lastCompareId: string | null = null;
  for (const beat of beats) {
    if (beat.kind === 'compare') lastCompareId = beat.nodeId;
  }

  // 자동 재생 — 걸음마다 읽을 시간을 준다 (initialData.stepMs, 원칙 2).
  for (const beat of beats) {
    if (rctx.cancelled) return;
    await playBeat(rctx, beat);
    if (rctx.cancelled) return;
    const ok = await rctx.sleep(rctx.data.stepMs);
    if (!ok) return;
  }
  if (rctx.cancelled) return;
  if (lastCompareId) {
    await rctx.emit({
      type: 'done',
      target: `node:${lastCompareId}`,
      payload: { nodeId: lastCompareId },
      silent: true,
    });
  }

  // 자동 재생이 끝난 뒤 — advance 로 한 걸음씩 다시 짚어본다 (S-piece).
  // idx 가 걸음 수 이상이면 "끝에 도달"한 상태 — 다음 advance 는 되감고 나서
  // 곧바로 첫 걸음을 보인다.
  let idx = beats.length;
  while (!rctx.cancelled) {
    const input = await rctx.waitForInput();
    if (rctx.cancelled) return;
    if (input.type !== 'advance') continue;
    if (idx >= beats.length) {
      await rctx.emit({ type: 'rewind' });
      idx = 0;
    }
    if (rctx.cancelled) return;
    await playBeat(rctx, beats[idx]);
    idx++;
  }
}
