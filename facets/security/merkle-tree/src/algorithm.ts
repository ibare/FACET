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
 *   - rewind payload: {}   손으로 짚기 시작할 때 화면을 되감는다
 *   - build-leaves  payload: {}   잎마다 자기 해시가 붙는다
 *   - combine-up    payload: {}   둘씩 묶여 위로 합쳐져 꼭대기 값이 남는다
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

/** 손으로 짚어 보는 입력. control-bar 의 advance 버튼이 보낸다. */
export type MerkleInput = { type: 'advance' } | { type: string };

/** 자동 재생과 손으로 짚기가 공유하는 걸음 수. */
const STEP_COUNT = 4;

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

  /**
   * 한 걸음을 실제로 발신한다. 자동 재생과 손으로 짚기가 같은 경로를 쓴다.
   *
   * 인덱스로 분기하되 emit 의 type 은 리터럴이다 (C2).
   */
  async function playStep(i: number): Promise<void> {
    switch (i) {
      case 0:
        await ctx.emit({ type: 'build-leaves' });
        break;
      case 1:
        await ctx.emit({ type: 'combine-up' });
        break;
      case 2:
        await ctx.emit({ type: 'change-leaf' });
        break;
      default:
        await ctx.emit({ type: 'mark-path' });
        break;
    }
  }

  /**
   * 걸음 사이 머무름. 취소되면 false — 호출부가 즉시 빠져나가야 한다 (C8).
   *
   * 걸음을 배열로 순회하지 않고 한 줄씩 펴 쓰는 이유는 `ctx.emit` 의 type 이
   * 리터럴이어야 하기 때문이다 (C2). 덕분에 어휘가 코드에 그대로 드러난다.
   */
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    const ok = await ctx.sleep(stepMs);
    return ok && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: { algorithmLabel, before, after, changedLeaf },
  });

  // 네 걸음. 접히는 것을 먼저 보여야 한 줄만 갈린다는 말이 뜻을 갖는다.
  for (let i = 0; i < STEP_COUNT; i++) {
    if (!(await pause())) return;
    await playStep(i);
  }

  // 손으로 짚어 보는 루프. 끝까지 간 뒤 다시 누르면 처음으로 되감는다.
  let cursor = STEP_COUNT;
  for (;;) {
    if (ctx.cancelled) return;
    let ev: MerkleInput;
    try {
      ev = await ctx.waitForInput<MerkleInput>();
    } catch {
      return;
    }
    if (ev.type !== 'advance') continue;
    if (cursor >= STEP_COUNT) {
      await ctx.emit({ type: 'rewind' });
      cursor = 0;
    }
    await playStep(cursor);
    cursor += 1;
  }
}
