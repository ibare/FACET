/**
 * euclidean 의 projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 하나도 지나가지 않는다. 여기서 넘기는 것은 수뿐이고, 무엇이라 말할지는
 * stage 가 `facet.ts` 의 messages 에서 받는다 (C10).
 *
 * `divide` 와 `reduce` 는 stage 의 애니메이션 promise 를 **돌려준다.** 러너의
 * `ctx.emit` 이 `await projector.onEvent(event)` 를 하므로, 돌려주지 않으면
 * 자라는 정사각형이 끝나기 전에 다음 걸음이 온다.
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 없는 메서드와도 견디게 전부 optional 이다 (C9). */
type EuclideanStage = {
  setup?(a: number, b: number): void | Promise<void>;
  divide?(a: number, b: number, q: number, r: number, index: number): void | Promise<void>;
  reduce?(a: number, b: number): void | Promise<void>;
  showDone?(gcd: number, divisions: number, quotientSum: number): void;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function fields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const euclideanProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as EuclideanStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  return {
    onInit() {
      // 초기 데이터를 좁혀 밀어 넣지 않는다 — 그것은 stage 의 mount 가 한다.
      // 첫 판이 시작하면 곧바로 `setup` 이 와서 직사각형을 다시 짓는다.
      codePanel?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      const p = fields(event.payload);
      switch (event.type) {
        case 'setup': {
          const a = num(p?.a);
          const b = num(p?.b);
          if (a === null || b === null) return;
          return stage?.setup?.(a, b);
        }
        case 'divide': {
          const a = num(p?.a);
          const b = num(p?.b);
          const q = num(p?.q);
          const r = num(p?.r);
          const index = num(p?.index);
          if (a === null || b === null || q === null || r === null || index === null) return;
          return stage?.divide?.(a, b, q, r, index);
        }
        case 'reduce': {
          const a = num(p?.a);
          const b = num(p?.b);
          if (a === null || b === null) return;
          return stage?.reduce?.(a, b);
        }
        case 'done': {
          const gcd = num(p?.gcd);
          const divisions = num(p?.divisions);
          const quotientSum = num(p?.quotientSum);
          if (gcd === null || divisions === null || quotientSum === null) return;
          stage?.showDone?.(gcd, divisions, quotientSum);
          return;
        }
        case 'phase': {
          const name = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase?.(name);
          return;
        }
        default:
          // 그 밖의 이벤트는 이 facet 이 내지 않는다. 와도 조용히 흘린다.
          return;
      }
    },

    onReset() {
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
