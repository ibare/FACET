/**
 * BlackHeightEqualProjector — walk-step / path-settled / all-settled / rewind
 * 이벤트를 black-height-equal-stage 의 메서드 호출로 번역한다.
 *
 * 문안은 여기서 runtime.t 로 확정해 문자열로 넘긴다 — stage 는 무엇을 그릴지
 * 결정하지 않고 받은 문자열을 그대로 보여 준다 (원칙 5: Projector 가 유일한
 * 번역기).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import type { RBColor } from './algorithm.js';

type WalkStepPayload = {
  id: string;
  kind: 'node' | 'nil';
  color: RBColor;
  counted: boolean;
  runningCount: number;
  pathIndex: number;
};

type PathSettledPayload = {
  pathIndex: number;
  blackCount: number;
  nilId: string;
};

type AllSettledPayload = {
  blackCount: number;
};

type Stage = {
  init?(data: { root: StageNode }): void;
  visitStep?(payload: WalkStepPayload & { caption: string }): Promise<void> | void;
  settlePath?(payload: PathSettledPayload & { caption: string }): Promise<void> | void;
  settleAll?(payload: AllSettledPayload & { caption: string }): Promise<void> | void;
  rewind?(payload: { caption: string }): Promise<void> | void;
};

function readWalkStep(payload: unknown): WalkStepPayload | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.id !== 'string') return undefined;
  if (p.kind !== 'node' && p.kind !== 'nil') return undefined;
  if (p.color !== 'red' && p.color !== 'black') return undefined;
  if (typeof p.counted !== 'boolean') return undefined;
  if (typeof p.runningCount !== 'number') return undefined;
  if (typeof p.pathIndex !== 'number') return undefined;
  return {
    id: p.id,
    kind: p.kind,
    color: p.color,
    counted: p.counted,
    runningCount: p.runningCount,
    pathIndex: p.pathIndex,
  };
}

function readPathSettled(payload: unknown): PathSettledPayload | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.pathIndex !== 'number') return undefined;
  if (typeof p.blackCount !== 'number') return undefined;
  if (typeof p.nilId !== 'string') return undefined;
  return { pathIndex: p.pathIndex, blackCount: p.blackCount, nilId: p.nilId };
}

function readAllSettled(payload: unknown): AllSettledPayload | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.blackCount !== 'number') return undefined;
  return { blackCount: p.blackCount };
}

/** stage 로 넘기는 트리 모양. stage 안의 RBNodeLike 와 동형이다. */
type StageNode = {
  id: string;
  value: number;
  color: RBColor;
  left?: StageNode;
  right?: StageNode;
};

/**
 * 초기 트리를 재귀로 좁힌다 (C9). `object 인가` 만 보고 `unknown` 을 그대로
 * 넘기면 stage 가 `as RBNodeLike` 로 받아 안쪽에서 터진다 — 경계에서 걸러야
 * 어디가 잘못됐는지 알 수 있다.
 */
function readStageNode(raw: unknown): StageNode | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const n = raw as Record<string, unknown>;
  if (typeof n.id !== 'string') return undefined;
  if (typeof n.value !== 'number') return undefined;
  if (n.color !== 'red' && n.color !== 'black') return undefined;
  const node: StageNode = { id: n.id, value: n.value, color: n.color };
  if (n.left !== undefined && n.left !== null) {
    const left = readStageNode(n.left);
    if (!left) return undefined;
    node.left = left;
  }
  if (n.right !== undefined && n.right !== null) {
    const right = readStageNode(n.right);
    if (!right) return undefined;
    node.right = right;
  }
  return node;
}

function readInitialData(data: unknown): { root: StageNode } | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const root = readStageNode((data as Record<string, unknown>).root);
  return root ? { root } : undefined;
}

export const blackHeightEqualProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage;
  const t: Translate = runtime?.t ?? makeTranslator();

  function tr(key: string, fallback: string, vars?: Record<string, string | number>): string {
    return t ? t(key, fallback, vars) : fallback;
  }

  return {
    onInit(initialData) {
      const data = readInitialData(initialData);
      if (!data) return;
      stage.init?.(data);
    },

    onEvent(event) {
      switch (event.type) {
        case 'walk-step': {
          const p = readWalkStep(event.payload);
          if (!p) return;
          const caption =
            p.kind === 'nil'
              ? tr('caption.visitNil', 'Nil — always counts as black. Running total {n}.', { n: p.runningCount })
              : p.color === 'black'
                ? tr('caption.visitBlack', 'Black — count it. Running total {n}.', { n: p.runningCount })
                : tr('caption.visitRed', 'Red — skip it. Running total stays {n}.', { n: p.runningCount });
          return stage.visitStep?.({ ...p, caption }) as Promise<void> | undefined;
        }
        case 'path-settled': {
          const p = readPathSettled(event.payload);
          if (!p) return;
          const caption = tr('caption.settled', 'This path settles at {n} black.', { n: p.blackCount });
          return stage.settlePath?.({ ...p, caption }) as Promise<void> | undefined;
        }
        case 'all-settled': {
          const p = readAllSettled(event.payload);
          if (!p) return;
          const caption = tr(
            'caption.allSettled',
            'Every path settles at the same number — {n} black.',
            { n: p.blackCount },
          );
          return stage.settleAll?.({ ...p, caption }) as Promise<void> | undefined;
        }
        case 'rewind': {
          const caption = tr('caption.rewind', 'Back to the root — watching it again, one step at a time.', {});
          return stage.rewind?.({ caption }) as Promise<void> | undefined;
        }
        default:
          // 이 조각은 위 넷 외의 이벤트를 발신하지 않는다. 알 수 없는 타입은
          // 조용히 무시한다 (C2).
          return;
      }
    },
  };
};
