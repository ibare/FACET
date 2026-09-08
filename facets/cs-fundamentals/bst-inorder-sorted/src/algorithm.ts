/**
 * bstInorderSorted algorithm — 중위 순회로 실제로 걷는다.
 *
 * 이 파일이 만드는 걸음(Beat)은 `buildBeats` 가 `ctx.data.nodes` 위에서 벌이는
 * 진짜 재귀 중위 순회의 결과다. 손으로 적은 걸음표가 아니다 — 노드가 하나 더
 * 늘어도 이 함수가 다시 순회해 걸음을 새로 만든다.
 *
 * 이벤트 어휘 (모두 target: 'node:<value>', 표준 어휘는 C2 참고):
 *   highlight    payload 없음 — 이 자리에 선다. 먼저 왼쪽 서브트리를 비우러
 *                내려간다 (자식이 없으면 즉시 빈 것으로 친다).
 *   unhighlight  payload 없음 — 자기 값을 내놓은 뒤 이 노드의 "서 있음"을
 *                뜨고 오른쪽으로 넘어간다.
 *   append       payload: { value: number } — 이 노드의 값이 흘러나와 줄 끝에
 *                쌓인다. 걸음의 핵심 순간.
 *   mark         payload 없음 — 내놓은 자리를 영구히 "다녀왔다" 상태로 굳힌다.
 *   done         target 없음, payload 없음 — 아홉 값이 모두 나와 줄이
 *                오름차순으로 완성됐다.
 *
 * facet 고유 확장 이벤트 (표준 어휘에 이 의미가 없어 새로 짓는다):
 *   rewind       target 없음, payload 없음, silent 아님(화면을 실제로 지운다) —
 *                자동 재생이 끝난 뒤 `advance` 를 처음 누르면 화면을 시작
 *                상태로 되돌리고, 곧바로 첫 걸음을 보인다 (S-piece: 되감기만
 *                하고 멈추면 반응이 없는 것으로 읽힌다).
 *
 * silent 이벤트는 없다 — 여섯 이벤트 전부 화면이 실제로 바뀐다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type BstInorderSortedNode = {
  value: number;
  /** 왼쪽 자식의 값. 없으면 null. */
  left: number | null;
  /** 오른쪽 자식의 값. 없으면 null. */
  right: number | null;
};

export type BstInorderSortedData = {
  type: 'bst-inorder-sorted';
  rootValue: number;
  nodes: BstInorderSortedNode[];
  /** 자동 재생 걸음 간격 (ms). 읽을 시간을 주는 저작 결정 (S-piece). */
  stepMs: number;
};

type Beat = { kind: 'stand'; value: number } | { kind: 'output'; value: number };

/**
 * 진짜 재귀 중위 순회. 왼쪽을 다 비우고, 자기를 내놓고, 오른쪽으로 넘어간다 —
 * 이 함수의 호출 순서 자체가 이 조각의 주장이다.
 */
function buildBeats(rootValue: number, byValue: Map<number, BstInorderSortedNode>): Beat[] {
  const beats: Beat[] = [];
  function walk(value: number | null): void {
    if (value === null) return;
    const node = byValue.get(value);
    if (!node) return;
    beats.push({ kind: 'stand', value: node.value });
    walk(node.left);
    beats.push({ kind: 'output', value: node.value });
    walk(node.right);
  }
  walk(rootValue);
  return beats;
}

async function emitBeat(rctx: ReactiveContext<BstInorderSortedData>, beat: Beat): Promise<void> {
  if (beat.kind === 'stand') {
    await rctx.emit({ type: 'highlight', target: `node:${beat.value}` });
    return;
  }
  await rctx.emit({ type: 'append', target: `node:${beat.value}`, payload: { value: beat.value } });
  await rctx.emit({ type: 'mark', target: `node:${beat.value}` });
  await rctx.emit({ type: 'unhighlight', target: `node:${beat.value}` });
}

/** 취소 검사와 걸음 간격 대기를 한 자리에 묶는다 (S-piece). */
async function pause(rctx: ReactiveContext<BstInorderSortedData>): Promise<boolean> {
  if (rctx.cancelled) return false;
  return rctx.sleep(rctx.data.stepMs);
}

export async function bstInorderSortedAlgorithm(ctx: FacetContext<BstInorderSortedData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BstInorderSortedData>;
  const byValue = new Map(rctx.data.nodes.map((n) => [n.value, n] as const));
  const beats = buildBeats(rctx.data.rootValue, byValue);

  // 자동 재생 — 한 번 끝까지 걷는다.
  for (const beat of beats) {
    if (rctx.cancelled) return;
    await emitBeat(rctx, beat);
    if (!(await pause(rctx))) return;
  }
  if (rctx.cancelled) return;
  await rctx.emit({ type: 'done' });

  // 자동 재생이 끝난 뒤 — advance 를 누를 때마다 한 걸음씩 다시 짚는다.
  // 한 바퀴를 다 짚으면 다음 advance 는 되감고(rewind) 첫 걸음부터 다시 보인다.
  let cursor = 0;
  while (!rctx.cancelled) {
    let input: ReactiveInputEvent;
    try {
      input = await rctx.waitForInput();
    } catch {
      // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다 (C6).
      return;
    }
    if (input.type !== 'advance') continue;
    if (cursor === 0) {
      await rctx.emit({ type: 'rewind' });
    }
    await emitBeat(rctx, beats[cursor]);
    cursor += 1;
    if (cursor >= beats.length) {
      cursor = 0;
      await rctx.emit({ type: 'done' });
    }
  }
}
