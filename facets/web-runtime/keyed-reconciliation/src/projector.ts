/**
 * keyedReconciliationProjector — algorithm 이 emit 하는 이벤트를 stage 메서드 호출로 번역한다.
 *
 * 'round-start' → stage.roundStart · 'phase' → codePanel.highlightPhase (silent 여도 온다) ·
 * 'step' → stage.applyStep(payload, duration) · 'round-end' → stage.roundEnd.
 *
 * 운동 길이는 `runtime.getSpeed()` 를 이벤트마다 그때그때 읽어 정한다 — 속도를 올리면 다음
 * 걸음부터 곧바로 짧아진다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { RoundStartPayload, StepPayload } from './keyed-reconciliation-stage.js';

/** 걸음 하나의 운동 기본 길이(ms). 재생 속도로 나뉜다. */
const BASE_MOTION_MS = 380;

type Stage = {
  roundStart(payload: RoundStartPayload): void;
  applyStep(payload: StepPayload, durationMs: number): void;
  roundEnd(): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

function readRoundStart(payload: unknown): RoundStartPayload | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  if (
    Array.isArray(p.oldItems) &&
    Array.isArray(p.newItems) &&
    typeof p.oldTag === 'string' &&
    typeof p.newTag === 'string' &&
    typeof p.checkedItem === 'string' &&
    typeof p.checkedSlot === 'string' &&
    typeof p.keyModeId === 'string' &&
    typeof p.changeId === 'string'
  ) {
    return {
      oldItems: p.oldItems.filter((x): x is string => typeof x === 'string'),
      newItems: p.newItems.filter((x): x is string => typeof x === 'string'),
      oldTag: p.oldTag,
      newTag: p.newTag,
      checkedItem: p.checkedItem,
      checkedSlot: p.checkedSlot,
      keyModeId: p.keyModeId,
      changeId: p.changeId,
    };
  }
  return undefined;
}

function readStep(payload: unknown): StepPayload | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.kind !== 'string') return undefined;
  if (p.kind === 'patch' && typeof p.slot === 'string' && typeof p.atIndex === 'number' && typeof p.text === 'string') {
    return { kind: 'patch', slot: p.slot, atIndex: p.atIndex, text: p.text };
  }
  if (p.kind === 'create' && typeof p.slot === 'string' && typeof p.atIndex === 'number' && typeof p.text === 'string') {
    return { kind: 'create', slot: p.slot, atIndex: p.atIndex, text: p.text, branch: p.branch === true };
  }
  if (p.kind === 'delete' && Array.isArray(p.slots)) {
    return { kind: 'delete', slots: p.slots.filter((x): x is string => typeof x === 'string'), branch: p.branch === true };
  }
  if (
    p.kind === 'move' &&
    typeof p.slot === 'string' &&
    typeof p.fromIndex === 'number' &&
    typeof p.toIndex === 'number' &&
    typeof p.text === 'string'
  ) {
    return { kind: 'move', slot: p.slot, fromIndex: p.fromIndex, toIndex: p.toIndex, text: p.text };
  }
  return undefined;
}

export const keyedReconciliationProjector: ProjectorFactory = (views, runtime) => {
  return {
    onEvent(event: FacetRuntimeEvent): void {
      const stage = views.stage as unknown as Stage | undefined;
      const codePanel = views.codePanel as unknown as CodePanel | undefined;
      const speed = runtime?.getSpeed() ?? 1;
      const duration = BASE_MOTION_MS / speed;

      switch (event.type) {
        case 'round-start': {
          const p = readRoundStart(event.payload);
          if (!p) throw new Error('round-start payload 모양이 어긋났다');
          stage?.roundStart(p);
          return;
        }
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          const phase = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase(phase);
          return;
        }
        case 'step': {
          const p = readStep(event.payload);
          if (!p) throw new Error('step payload 모양이 어긋났다');
          stage?.applyStep(p, duration);
          return;
        }
        case 'round-end': {
          stage?.roundEnd();
          return;
        }
        default:
          return;
      }
    },
    onReset(): void {
      const stage = views.stage as unknown as Stage | undefined;
      const codePanel = views.codePanel as unknown as CodePanel | undefined;
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
