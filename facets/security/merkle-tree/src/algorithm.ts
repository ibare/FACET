/**
 * 머클 트리 (Merkle tree) 시각화 알고리즘 — 조각(단일 주장) facet.
 *
 * 이 facet 이 답하는 질문 하나:
 *   "무엇이 바뀌었는지, 전부 다시 읽지 않고 어떻게 찾는가?"
 *
 * 잎의 해시를 둘씩 묶어 위로 접으면 꼭대기에 값 하나가 남는다. 잎 하나가
 * 바뀌면 그 잎에서 꼭대기까지의 한 줄만 갈리고 나머지 가지는 그대로다. 그래서
 * 꼭대기 값 하나만 견주면 무엇이든 바뀌었는지 알 수 있고, 갈라진 쪽만 따라
 * 내려가면 어디가 바뀌었는지도 몇 걸음에 찾는다.
 *
 * 해시 사슬 조각과 대비된다. 사슬은 한 칸을 고치면 뒤가 전부 무너지지만,
 * 트리는 한 줄만 바뀌고 나머지는 성한 채 남는다.
 *
 * 진행 동력은 ReactiveMechanism. 컨트롤바 없이 스스로 시작하고 걸음 간격도
 * 스스로 정한다 (ctx.sleep).
 *
 * 식별자 (C1): 노드를 가리키는 곳이 payload 뿐이라 target 을 쓰지 않는다.
 *
 * 이벤트 (C2) — 전부 facet 로컬 (StandardEventType 미포함):
 *   - init          payload: { algorithmLabel, before, after, changedLeaf }
 *   - build-leaves  payload: {}   잎마다 자기 해시가 붙는다
 *   - fold-up       payload: {}   둘씩 묶여 위로 접혀 꼭대기 값이 남는다
 *   - change-leaf   payload: {}   잎 하나가 바뀐다
 *   - mark-path     payload: {}   꼭대기까지 한 줄만 갈리고 나머지는 그대로다
 *
 * 메트릭 (C5): 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 잎 하나 — 이름과 그 해시. */
export type MerkleLeaf = {
  /** 화면에 인쇄할 이름. */
  label: string;
  /** sha256(label) 실측값. */
  hash: string;
};

/** 트리 한 벌. 잎 넷과 중간 둘, 꼭대기 하나. */
export type MerkleSnapshot = {
  leaves: MerkleLeaf[];
  /** sha256(leaf0 + leaf1). */
  left: string;
  /** sha256(leaf2 + leaf3). */
  right: string;
  /** sha256(left + right). */
  root: string;
};

export type MerkleTreeFacetData = {
  type: 'merkle-tree';
  /** 화면에 인쇄할 해시 함수 이름. */
  algorithmLabel: string;
  /** 바뀌기 전의 트리. */
  before: MerkleSnapshot;
  /** 잎 하나가 바뀐 뒤의 트리. */
  after: MerkleSnapshot;
  /** 바뀐 잎의 위치 (0-based). */
  changedLeaf: number;
  /**
   * 한 걸음 사이 머무는 간격 ms.
   *
   * 조각은 컨트롤바가 없어 speed-slider 로 늦출 수 없다 (원칙 2).
   */
  stepMs: number;
};

export async function merkleTree(
  ctxBase: FacetContext<MerkleTreeFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<MerkleTreeFacetData>;
  const { algorithmLabel, before, after, changedLeaf, stepMs } = ctx.data;

  await ctx.emit({
    type: 'init',
    payload: { algorithmLabel, before, after, changedLeaf },
  });

  // 네 걸음. 접히는 것을 먼저 보여야 한 줄만 갈린다는 말이 뜻을 갖는다.
  for (const type of ['build-leaves', 'fold-up', 'change-leaf', 'mark-path'] as const) {
    if (ctx.cancelled) return;
    const ok = await ctx.sleep(stepMs);
    if (!ok || ctx.cancelled) return;
    await ctx.emit({ type });
  }
}
