/**
 * 맥락 조립 projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 운동 길이는 재생 속도를 따라간다 — 부를 때마다 지금 속도로 셈한다.
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { ContextAssemblyStage } from './context-assembly-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

const num = (o: Record<string, unknown>, k: string): number | null =>
  typeof o[k] === 'number' ? (o[k] as number) : null;

export const contextAssemblyProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ContextAssemblyStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let stepMs = 800;

  /** 한 걸음의 운동 길이 — 걸음 간격(stepMs ÷ 속도)의 0.6. */
  const ms = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return Math.round((stepMs * 0.6) / Math.max(0.01, speed));
  };

  return {
    onInit(initialData: unknown) {
      if (typeof initialData === 'object' && initialData !== null) {
        const s = (initialData as { stepMs?: unknown }).stepMs;
        if (typeof s === 'number') stepMs = s;
      }
    },
    async onEvent(event: FacetRuntimeEvent) {
      const raw = event.payload;
      const pl: Record<string, unknown> = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      switch (event.type) {
        case 'phase': {
          const ph = pl.phase;
          if (typeof ph === 'string') code?.highlightPhase?.(ph);
          return;
        }
        case 'round-start': {
          const budget = num(pl, 'budget');
          const order = num(pl, 'order');
          const lengths = pl.lengths;
          if (budget === null || order === null) return;
          if (!Array.isArray(lengths) || !lengths.every((x) => typeof x === 'number')) return;
          await stage?.roundStart(budget, order, lengths as number[], ms());
          return;
        }
        case 'admit': {
          const rank = num(pl, 'rank');
          const words = num(pl, 'words');
          const used = num(pl, 'used');
          const budget = num(pl, 'budget');
          if (rank === null || words === null || used === null || budget === null) return;
          await stage?.admit(rank, words, used, budget, ms());
          return;
        }
        case 'overflow': {
          const rank = num(pl, 'rank');
          const words = num(pl, 'words');
          const used = num(pl, 'used');
          const budget = num(pl, 'budget');
          const leftOut = num(pl, 'leftOut');
          if (rank === null || words === null || used === null || budget === null || leftOut === null) return;
          await stage?.overflow(rank, words, used, budget, leftOut, ms());
          return;
        }
        case 'seat': {
          const rank = num(pl, 'rank');
          const side = pl.side;
          if (rank === null || (side !== 'front' && side !== 'back')) return;
          await stage?.seat(rank, side, ms());
          return;
        }
        case 'depth': {
          const answer = num(pl, 'answer');
          const slot = num(pl, 'slot');
          const count = num(pl, 'count');
          const depth = num(pl, 'depth');
          const leftOut = num(pl, 'leftOut');
          if (answer === null || slot === null || count === null || depth === null || leftOut === null) return;
          await stage?.depth(answer, slot, count, depth, leftOut, ms());
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.clear();
      code?.clearHighlight?.();
    },
  };
};
