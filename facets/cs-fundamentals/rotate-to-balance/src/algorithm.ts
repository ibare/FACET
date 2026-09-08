/**
 * rotate-to-balance — 회전으로 기울기를 편다.
 *
 * 왼쪽으로 치우친(균형 인수가 범위를 벗어난) 이진 트리를 한 번의 왼쪽 회전으로
 * 바로잡는다. 축(피벗)이 아래로 내려가고 그 오른쪽 자식이 축의 자리로
 * 올라오며, 올라온 쪽의 왼쪽 가지 하나가 손을 바꿔 내려간 쪽의 오른쪽에 붙는다.
 *
 * `ctx.data` 로 받는 회전 전 트리(`RotateToBalanceData`)에 실제로 회전 연산을
 * 수행해 회전 후 트리를 계산한다 — 두 상태를 나란히 선언해 갈아 끼우지 않는다.
 *
 * ── 확장 이벤트 어휘 (C2) ──────────────────────────────────────────────
 *
 * `balance-computed`  두 번 발신 (회전 전 1회, 회전 후 1회).
 *   target: entries 의 각 노드에 대응하는 `node:<id>` 배열.
 *   payload: {
 *     phase: 'before' | 'after';
 *     rootId: string;
 *     entries: { id: string; value: number; height: number; balance: number; outOfRange: boolean }[];
 *   }
 *   silent: 아니다 — 높이/균형 인수 배지가 화면에 나타나는 step boundary.
 *
 * `rotate`  1회 발신. 축이 내려가고 자식이 올라오며 가지 하나가 손을 바꾸는
 *   순간 전체를 한 이벤트로 묶는다 — 두 자리가 "맞물려" 도는 동작이라 낱개
 *   이벤트로 쪼개면 동시성이 훼손된다 (C2 의 layer-discovered/fold 와 같은 취지).
 *   target: [`node:<pivotId>`, `node:<newRootId>`, `node:<movedId>`?]
 *   payload: {
 *     pivotId: string; pivotValue: number;
 *     newRootId: string; newRootValue: number;
 *     movedId: string | null; movedValue: number | null;
 *     afterNodes: RotateNode[]; afterRootId: string;
 *   }
 *   silent: 아니다 — 노드가 실제로 이동하는 애니메이션 step boundary.
 *
 * `rewind`  자동 재생이 끝난 뒤 처음 누르는 `advance` 에서 1회 발신. 화면을
 *   회전 전 상태로 되돌린다(다시 보기와 달리 mechanism.reset 을 타지 않고
 *   algorithm 이 스스로 처음 장면을 다시 그린다 — S-piece 의 advance 루프).
 *   target: 없음. payload: { rootId: string }.
 *   silent: 아니다 — 화면이 실제로 초기 배치로 되돌아가는 step boundary.
 *
 * `done`  표준 어휘. 마지막 걸음에서 1회 발신. 회전으로 키가 줄고 중위 순회
 *   결과가 그대로임을 함께 알린다.
 *   payload: { heightBefore: number; heightAfter: number; order: { id: string; value: number }[] }
 *   silent: 아니다 — 결론 배지가 나타나는 step boundary.
 */

import type {
  FacetContext,
  ReactiveContext,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';

export type RotateNode = {
  id: string;
  value: number;
  left: string | null;
  right: string | null;
};

export type RotateToBalanceData = {
  type: 'rotateToBalance';
  stepMs: number;
  rootId: string;
  /** 균형이 깨진 축 — 이 노드를 기준으로 왼쪽 회전을 수행한다. */
  pivotId: string;
  nodes: RotateNode[];
};

export type BalanceEntry = {
  id: string;
  value: number;
  height: number;
  balance: number;
  outOfRange: boolean;
};

export type BalancePayload = {
  phase: 'before' | 'after';
  rootId: string;
  entries: BalanceEntry[];
};

export type RotatePayload = {
  pivotId: string;
  pivotValue: number;
  newRootId: string;
  newRootValue: number;
  movedId: string | null;
  movedValue: number | null;
  afterNodes: RotateNode[];
  afterRootId: string;
};

export type RewindPayload = { rootId: string };

export type DonePayload = {
  heightBefore: number;
  heightAfter: number;
  order: { id: string; value: number }[];
};

const BALANCE_RANGE = 1;

function computeHeightsAndBalances(
  nodes: RotateNode[],
  rootId: string,
): Map<string, { height: number; balance: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const stats = new Map<string, { height: number; balance: number }>();

  function heightOf(id: string | null): number {
    if (!id) return 0;
    const n = byId.get(id);
    if (!n) return 0;
    const hL = heightOf(n.left);
    const hR = heightOf(n.right);
    const h = 1 + Math.max(hL, hR);
    stats.set(id, { height: h, balance: hL - hR });
    return h;
  }

  heightOf(rootId);
  return stats;
}

function toEntries(
  nodes: RotateNode[],
  stats: Map<string, { height: number; balance: number }>,
): BalanceEntry[] {
  return nodes
    .filter((n) => stats.has(n.id))
    .map((n) => {
      const s = stats.get(n.id)!;
      return {
        id: n.id,
        value: n.value,
        height: s.height,
        balance: s.balance,
        outOfRange: s.balance < -BALANCE_RANGE || s.balance > BALANCE_RANGE,
      };
    });
}

/**
 * `pivotId` 를 축으로 한 왼쪽 회전. 축의 오른쪽 자식이 축의 자리로 올라오고,
 * 그 자식의 왼쪽 가지(있었다면)가 손을 바꿔 축의 오른쪽에 붙는다.
 *
 * 피벗의 부모를 찾아 다시 연결한다 — 피벗이 트리의 뿌리면 뿌리 자체가 바뀐다.
 * 특정 데이터에 매인 코드가 아니라 임의의 이진 트리에 적용 가능한 일반 연산.
 */
function rotateLeft(
  nodes: RotateNode[],
  rootId: string,
  pivotId: string,
): { nodes: RotateNode[]; rootId: string; newRootId: string; movedId: string | null } {
  const byId = new Map(nodes.map((n) => [n.id, { ...n }]));
  const pivot = byId.get(pivotId);
  if (!pivot || !pivot.right) {
    throw new Error(`rotateLeft: pivot "${pivotId}" 에 오른쪽 자식이 없어 왼쪽 회전을 할 수 없음`);
  }
  const newRoot = byId.get(pivot.right);
  if (!newRoot) {
    throw new Error(`rotateLeft: pivot 의 오른쪽 자식 "${pivot.right}" 을 찾을 수 없음`);
  }

  const movedId = newRoot.left;
  pivot.right = movedId;
  newRoot.left = pivot.id;

  let parent: RotateNode | undefined;
  for (const n of byId.values()) {
    if (n.left === pivotId || n.right === pivotId) {
      parent = n;
      break;
    }
  }
  if (parent) {
    if (parent.left === pivotId) parent.left = newRoot.id;
    else parent.right = newRoot.id;
  }

  const nextRootId = pivotId === rootId ? newRoot.id : rootId;
  return { nodes: [...byId.values()], rootId: nextRootId, newRootId: newRoot.id, movedId };
}

/** 취소 검사와 `ctx.sleep` 을 묶는다. cancel 되면 false. */
/** 걸음과 걸음 사이의 문. `false` 면 취소된 것이다. */
type Gate = () => Promise<boolean>;

async function pause(ctx: ReactiveContext, ms: number): Promise<boolean> {
  if (ctx.cancelled) return false;
  return ctx.sleep(ms);
}

export async function rotateToBalanceAlgorithm(
  ctx: FacetContext<RotateToBalanceData>,
): Promise<void> {
  const reactive = ctx as ReactiveContext<RotateToBalanceData>;
  const { nodes: beforeNodes, rootId: beforeRootId, pivotId, stepMs } = reactive.data;

  const beforeStats = computeHeightsAndBalances(beforeNodes, beforeRootId);
  const beforeEntries = toEntries(beforeNodes, beforeStats);

  const rotated = rotateLeft(beforeNodes, beforeRootId, pivotId);
  const afterStats = computeHeightsAndBalances(rotated.nodes, rotated.rootId);
  const afterEntries = toEntries(rotated.nodes, afterStats);

  const pivotBefore = beforeNodes.find((n) => n.id === pivotId);
  const newRootBefore = beforeNodes.find((n) => n.id === rotated.newRootId);
  const movedBefore = rotated.movedId ? beforeNodes.find((n) => n.id === rotated.movedId) : undefined;
  if (!pivotBefore || !newRootBefore) {
    throw new Error('rotateToBalanceAlgorithm: pivot 또는 newRoot 노드를 initialData 에서 찾을 수 없음');
  }

  const order = [...beforeNodes]
    .sort((a, b) => a.value - b.value)
    .map((n) => ({ id: n.id, value: n.value }));

  /**
   * 네 걸음을 선형으로 편다. 자동 재생과 되짚기가 같은 순서를 지나므로
   * 문(gate)만 갈아 끼운다 — 걸음을 클로저 배열로 둘러 두면 그것이 사람이 적은
   * 걸음표가 되고, 순서를 바꾸려면 배열을 손대야 한다 (S-piece).
   *
   * `gate` 가 `false` 를 주면 취소된 것이니 그 자리에서 멈춘다 (C8).
   */
  const play = async (gate: Gate): Promise<boolean> => {
    // 1. 회전 전 — 자리마다 높이를 재고 균형 인수를 적는다.
    const beforePayload: BalancePayload = {
      phase: 'before',
      rootId: beforeRootId,
      entries: beforeEntries,
    };
    await reactive.emit({
      type: 'balance-computed',
      target: beforeEntries.map((e) => `node:${e.id}`),
      payload: beforePayload,
    });
    if (!(await gate())) return false;

    // 2. 돈다 — 축이 내려가고 자식이 올라오며 가지 하나가 손을 바꾼다.
    const rotatePayload: RotatePayload = {
      pivotId,
      pivotValue: pivotBefore.value,
      newRootId: rotated.newRootId,
      newRootValue: newRootBefore.value,
      movedId: rotated.movedId,
      movedValue: movedBefore?.value ?? null,
      afterNodes: rotated.nodes,
      afterRootId: rotated.rootId,
    };
    await reactive.emit({
      type: 'rotate',
      target: [
        `node:${pivotId}`,
        `node:${rotated.newRootId}`,
        ...(rotated.movedId ? [`node:${rotated.movedId}`] : []),
      ],
      payload: rotatePayload,
    });
    if (!(await gate())) return false;

    // 3. 회전 뒤 — 다시 재면 모두 범위 안이다.
    const afterPayload: BalancePayload = {
      phase: 'after',
      rootId: rotated.rootId,
      entries: afterEntries,
    };
    await reactive.emit({
      type: 'balance-computed',
      target: afterEntries.map((e) => `node:${e.id}`),
      payload: afterPayload,
    });
    if (!(await gate())) return false;

    // 4. 키가 줄었고 중위 순회는 그대로다.
    const donePayload: DonePayload = {
      heightBefore: beforeStats.get(beforeRootId)?.height ?? 0,
      heightAfter: afterStats.get(rotated.rootId)?.height ?? 0,
      order,
    };
    await reactive.emit({ type: 'done', payload: donePayload });
    return !reactive.cancelled;
  };

  /** 시간이 여는 문 — 자동 재생. */
  const bySleep: Gate = () => pause(reactive, stepMs);

  /** 사람이 여는 문 — advance 를 받을 때까지 기다린다. */
  const byPress: Gate = async () => {
    for (;;) {
      if (reactive.cancelled) return false;
      let input: ReactiveInputEvent;
      try {
        input = await reactive.waitForInput();
      } catch {
        // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다.
        return false;
      }
      if (input.type === 'advance') return !reactive.cancelled;
    }
  };

  if (!(await play(bySleep))) return;

  // 자동 재생 종료 후 — advance 로 한 걸음씩. 처음 누르는 advance 는 되감고
  // 첫 걸음까지 곧바로 보인다. play 가 emit 을 문보다 앞에 두므로 그대로 된다.
  while (!reactive.cancelled) {
    if (!(await byPress())) return;
    const rewindPayload: RewindPayload = { rootId: beforeRootId };
    await reactive.emit({ type: 'rewind', payload: rewindPayload });
    if (!(await play(byPress))) return;
  }
}
