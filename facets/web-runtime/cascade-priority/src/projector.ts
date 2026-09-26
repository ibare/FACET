/**
 * cascade-priority 의 projector — algorithm 이벤트를 무대 메서드 호출로 옮긴다.
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';

type StageInstance = {
  initRound(elementMarkup: string, parentMarkup: string, rules: { id: number; selector: string; weight: number }[]): void;
  setCandidates(ids: number[]): void;
  setJudged(ruleId: number, matched: boolean): void;
  setHeld(ruleId: number, prevId: number | null, speedMul: number): void;
  assignValue(value: string): void;
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

type RuleMeta = { id: number; selector: string };

export const cascadePriorityProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as StageInstance | undefined;
  const codePanel = views.codePanel as unknown as
    | { highlightPhase(phase: string | null): void; clearHighlight(): void }
    | undefined;
  let ruleMeta: RuleMeta[] = [];
  let heldId: number | null = null;

  return {
    onInit(initialData) {
      const data = initialData as { rules?: unknown } | undefined;
      if (data && Array.isArray(data.rules)) {
        ruleMeta = (data.rules as Array<{ id?: unknown; selector?: unknown }>)
          .filter((r): r is { id: number; selector: string } => typeof r.id === 'number' && typeof r.selector === 'string')
          .map((r) => ({ id: r.id, selector: r.selector }));
      }
      heldId = null;
    },
    onEvent(event) {
      const speed = runtime?.getSpeed() ?? 1;
      switch (event.type) {
        case 'round-init': {
          const p = event.payload as
            | { elementMarkup?: unknown; parentMarkup?: unknown; weights?: unknown }
            | undefined;
          const elementMarkup = typeof p?.elementMarkup === 'string' ? p.elementMarkup : '';
          const parentMarkup = typeof p?.parentMarkup === 'string' ? p.parentMarkup : '';
          const weights = (p?.weights ?? {}) as Record<string, unknown>;
          const rules = ruleMeta.map((r) => {
            const w = weights[String(r.id)];
            return { id: r.id, selector: r.selector, weight: typeof w === 'number' ? w : 0 };
          });
          heldId = null;
          stage?.initRound(elementMarkup, parentMarkup, rules);
          return;
        }
        case 'filter': {
          const p = event.payload as { candidates?: unknown } | undefined;
          const candidates = Array.isArray(p?.candidates) ? (p.candidates as unknown[]).filter((v): v is number => typeof v === 'number') : [];
          stage?.setCandidates(candidates);
          return;
        }
        case 'judge': {
          const p = event.payload as { ruleId?: unknown; matched?: unknown } | undefined;
          if (typeof p?.ruleId === 'number' && typeof p?.matched === 'boolean') {
            stage?.setJudged(p.ruleId, p.matched);
          }
          return;
        }
        case 'compare': {
          const p = event.payload as { ruleId?: unknown; heldAfter?: unknown } | undefined;
          if (typeof p?.heldAfter === 'number') {
            const prev = heldId;
            heldId = p.heldAfter;
            stage?.setHeld(p.heldAfter, prev, speed);
          }
          return;
        }
        case 'assign': {
          const p = event.payload as { value?: unknown } | undefined;
          if (typeof p?.value === 'string') stage?.assignValue(p.value);
          return;
        }
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          const phase = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase(phase);
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      heldId = null;
    },
  };
};
