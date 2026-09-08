/**
 * height-balance-check projector — algorithm 이벤트를 stage 메서드 호출로 번역한다.
 *
 *   'node-settle' → stage.settleNode(...)   높이 토큰이 올라와 값을 적는다.
 *   'rewind'      → stage.rewind()          되감아 골격만 남긴다.
 *   그 외          → 조용히 무시 (표준 vocab 밖의 알려지지 않은 이벤트, C2).
 */

import type { ProjectorFactory, ViewInstance } from '@ffacet/core/runtime';

/** 'node-settle' payload 를 좁힌 형태 (C9) — event.payload 는 unknown 이다. */
type SettleStep = {
  value: number;
  leftHeight: number;
  rightHeight: number;
  height: number;
  balance: number;
  outOfRange: boolean;
};

/** stage view 가 노출하는 메서드 계약 (C9). */
type Stage = ViewInstance & {
  init(root: StageTreeNode): void;
  settleNode(step: SettleStep): Promise<void>;
  rewind(): void;
};

function readSettlePayload(payload: unknown): SettleStep | undefined {
  const p = payload as Partial<SettleStep> | undefined;
  if (
    typeof p?.value !== 'number' ||
    typeof p?.leftHeight !== 'number' ||
    typeof p?.rightHeight !== 'number' ||
    typeof p?.height !== 'number' ||
    typeof p?.balance !== 'number' ||
    typeof p?.outOfRange !== 'boolean'
  ) {
    return undefined;
  }
  return {
    value: p.value,
    leftHeight: p.leftHeight,
    rightHeight: p.rightHeight,
    height: p.height,
    balance: p.balance,
    outOfRange: p.outOfRange,
  };
}

/** stage 로 넘기는 트리 모양. stage 안의 같은 이름과 동형이다. */
type StageTreeNode = {
  value: number;
  left?: StageTreeNode;
  right?: StageTreeNode;
};

/**
 * 초기 트리를 재귀로 좁힌다 (C9).
 *
 * 이벤트 payload 만 좁히고 초기 데이터는 캐스팅으로 통과시키면, 저작자가
 * `initialData` 를 잘못 적었을 때 stage 안쪽에서 `undefined.value` 로 터진다 —
 * 경계에서 걸러야 어디가 잘못됐는지 알 수 있다.
 */
function readStageTree(raw: unknown): StageTreeNode | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const n = raw as Record<string, unknown>;
  if (typeof n.value !== 'number') return undefined;
  const node: StageTreeNode = { value: n.value };
  if (n.left !== undefined && n.left !== null) {
    const left = readStageTree(n.left);
    if (!left) return undefined;
    node.left = left;
  }
  if (n.right !== undefined && n.right !== null) {
    const right = readStageTree(n.right);
    if (!right) return undefined;
    node.right = right;
  }
  return node;
}

export const heightBalanceCheckProjector: ProjectorFactory = (views) => {
  const stage = views.stage as Stage;

  return {
    onInit(initialData) {
      const raw = typeof initialData === 'object' && initialData !== null
        ? (initialData as Record<string, unknown>).root
        : undefined;
      const root = readStageTree(raw);
      if (!root) {
        throw new Error('heightBalanceCheckProjector: initialData.root 가 트리 모양이 아니다');
      }
      stage.init(root);
    },
    onEvent(event) {
      switch (event.type) {
        case 'node-settle': {
          const step = readSettlePayload(event.payload);
          if (!step) return;
          return stage.settleNode(step);
        }
        case 'rewind':
          stage.rewind();
          return;
        default:
          // 표준 vocab 밖의 알려지지 않은 이벤트는 조용히 무시한다 (C2).
          return;
      }
    },
  };
};
