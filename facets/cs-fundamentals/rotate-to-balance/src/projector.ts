/**
 * rotate-to-balance projector — algorithm.ts 의 이벤트를 stage 메서드 호출로 번역한다.
 *
 * 처리하는 type: `balance-computed` · `rotate` · `rewind` · `done` (algorithm.ts
 * 상단 JSDoc 의 payload 스키마와 대응). 그 외 type 은 default 에서 조용히 버린다
 * (이 algorithm 은 이 넷 외에 발신하지 않는다 — C2).
 */

import type { ProjectorFactory, ProjectorInstance, ViewInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type {
  StageBalanceEntry,
  StageNode,
  StageOrderEntry,
  StageRotateArgs,
} from './rotate-to-balance-stage.js';

type StageInstance = ViewInstance & {
  init(nodes: StageNode[], rootId: string): void;
  setCaption(text: string): void;
  showBalance(entries: StageBalanceEntry[]): void;
  rotate(args: StageRotateArgs): Promise<void>;
  markInorderUnchanged(order: StageOrderEntry[]): void;
};

type BalancePayload = {
  phase: 'before' | 'after';
  rootId: string;
  entries: { id: string; value: number; height: number; balance: number; outOfRange: boolean }[];
};

type RotatePayload = {
  pivotId: string;
  pivotValue: number;
  newRootId: string;
  newRootValue: number;
  movedId: string | null;
  movedValue: number | null;
  afterNodes: StageNode[];
  afterRootId: string;
};

type RewindPayload = { rootId: string };

type DonePayload = {
  heightBefore: number;
  heightAfter: number;
  order: { id: string; value: number }[];
};

function isBalanceEntry(v: unknown): v is BalancePayload['entries'][number] {
  if (!v || typeof v !== 'object') return false;
  const e = v as Partial<BalancePayload['entries'][number]>;
  return (
    typeof e.id === 'string' &&
    typeof e.value === 'number' &&
    typeof e.height === 'number' &&
    typeof e.balance === 'number' &&
    typeof e.outOfRange === 'boolean'
  );
}

function readBalancePayload(payload: unknown): BalancePayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<BalancePayload>;
  if ((p.phase !== 'before' && p.phase !== 'after') || typeof p.rootId !== 'string' || !Array.isArray(p.entries)) {
    return null;
  }
  if (!p.entries.every(isBalanceEntry)) return null;
  return { phase: p.phase, rootId: p.rootId, entries: p.entries };
}

function isStageNode(v: unknown): v is StageNode {
  if (!v || typeof v !== 'object') return false;
  const n = v as Partial<StageNode>;
  return (
    typeof n.id === 'string' &&
    typeof n.value === 'number' &&
    (n.left === null || typeof n.left === 'string') &&
    (n.right === null || typeof n.right === 'string')
  );
}

function readRotatePayload(payload: unknown): RotatePayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<RotatePayload>;
  if (
    typeof p.pivotId !== 'string' ||
    typeof p.pivotValue !== 'number' ||
    typeof p.newRootId !== 'string' ||
    typeof p.newRootValue !== 'number' ||
    typeof p.afterRootId !== 'string' ||
    !Array.isArray(p.afterNodes) ||
    !p.afterNodes.every(isStageNode)
  ) {
    return null;
  }
  return {
    pivotId: p.pivotId,
    pivotValue: p.pivotValue,
    newRootId: p.newRootId,
    newRootValue: p.newRootValue,
    movedId: typeof p.movedId === 'string' ? p.movedId : null,
    movedValue: typeof p.movedValue === 'number' ? p.movedValue : null,
    afterNodes: p.afterNodes,
    afterRootId: p.afterRootId,
  };
}

function readRewindPayload(payload: unknown): RewindPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<RewindPayload>;
  return typeof p.rootId === 'string' ? { rootId: p.rootId } : null;
}

function isOrderEntry(v: unknown): v is DonePayload['order'][number] {
  if (!v || typeof v !== 'object') return false;
  const o = v as Partial<DonePayload['order'][number]>;
  return typeof o.id === 'string' && typeof o.value === 'number';
}

function readDonePayload(payload: unknown): DonePayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<DonePayload>;
  if (
    typeof p.heightBefore !== 'number' ||
    typeof p.heightAfter !== 'number' ||
    !Array.isArray(p.order) ||
    !p.order.every(isOrderEntry)
  ) {
    return null;
  }
  return { heightBefore: p.heightBefore, heightAfter: p.heightAfter, order: p.order };
}

export const rotateToBalanceProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as StageInstance;
  const tr = runtime?.t ?? makeTranslator();

  let initialNodes: StageNode[] = [];
  let initialRootId = '';

  const instance: ProjectorInstance = {
    onInit(initialData: unknown): void {
      const data = initialData as { nodes?: unknown; rootId?: unknown } | undefined;
      initialNodes = Array.isArray(data?.nodes) ? (data!.nodes as StageNode[]) : [];
      initialRootId = typeof data?.rootId === 'string' ? data.rootId : (initialNodes[0]?.id ?? '');
      stage.init(initialNodes, initialRootId);
      stage.setCaption('');
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'balance-computed': {
          const payload = readBalancePayload(event.payload);
          if (!payload) return;
          stage.showBalance(payload.entries);
          if (payload.phase === 'before') {
            const bad = payload.entries.find((e) => e.outOfRange);
            if (bad) {
              stage.setCaption(
                tr(
                  'caption.imbalance',
                  'Node {value} has balance factor {balance} — outside the [-1, 1] range.',
                  { value: bad.value, balance: bad.balance },
                ),
              );
            } else {
              stage.setCaption(tr('caption.balanceChecked', 'Every balance factor is within range.'));
            }
          } else {
            stage.setCaption(tr('caption.rebalanced', 'Every balance factor is back in the [-1, 1] range.'));
          }
          return;
        }

        case 'rotate': {
          const payload = readRotatePayload(event.payload);
          if (!payload) return;
          if (payload.movedId !== null && payload.movedValue !== null) {
            stage.setCaption(
              tr(
                'caption.rotating',
                '{newRootValue} rises to the top, {pivotValue} settles below it, and {movedValue} changes parent.',
                { newRootValue: payload.newRootValue, pivotValue: payload.pivotValue, movedValue: payload.movedValue },
              ),
            );
          } else {
            stage.setCaption(
              tr(
                'caption.rotatingSimple',
                '{newRootValue} rises to the top and {pivotValue} settles below it.',
                { newRootValue: payload.newRootValue, pivotValue: payload.pivotValue },
              ),
            );
          }
          await stage.rotate({
            pivotId: payload.pivotId,
            newRootId: payload.newRootId,
            movedId: payload.movedId,
            afterNodes: payload.afterNodes,
            afterRootId: payload.afterRootId,
          });
          return;
        }

        case 'rewind': {
          const payload = readRewindPayload(event.payload);
          stage.init(initialNodes, payload?.rootId ?? initialRootId);
          stage.setCaption(tr('caption.rewound', 'Back to the start — press again to step through.'));
          return;
        }

        case 'done': {
          const payload = readDonePayload(event.payload);
          if (!payload) return;
          const order = payload.order.map((o) => o.value).join(', ');
          stage.setCaption(
            tr(
              'caption.done',
              'Height drops from {before} to {after}; in-order sequence stays {order}.',
              { before: payload.heightBefore, after: payload.heightAfter, order },
            ),
          );
          stage.markInorderUnchanged(payload.order);
          return;
        }

        default:
          // 이 algorithm 은 balance-computed / rotate / rewind / done 외 type 을
          // 발신하지 않는다 — 알 수 없는 type 은 조용히 버린다 (C2).
          return;
      }
    },
  };

  return instance;
};
