/**
 * floatingPointProjector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 이 파일은 색도 문안도 정하지 않는다. 수만 넘기고, 무엇이라 쓸지와 무슨 색으로
 * 칠할지는 view 가 토큰과 translator 에서 받는다 (S-facet · C10).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage view 의 구조적 계약. 캐스팅 지점을 짧게 두려고 한곳에 모은다 (C9). */
type Stage = {
  setSplit?: (totalBits: number, signBits: number, expBits: number, manBits: number) => void;
  setMeasure?: (name: string, value: number) => void;
  setRuler?: (ticks: number) => void;
  setStored?: (input: number, stored: number) => void;
  reset?: () => void;
};

type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
  clearHighlight?: () => void;
};

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export const floatingPointProjector: ProjectorFactory = (
  views: ProjectorViews,
  _runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  const showSplit = (p: Record<string, unknown>): void => {
    const totalBits = num(p.totalBits);
    const signBits = num(p.signBits);
    const expBits = num(p.expBits);
    const manBits = num(p.manBits);
    if (totalBits === null || signBits === null || expBits === null || manBits === null) return;
    stage?.setSplit?.(totalBits, signBits, expBits, manBits);
  };

  return {
    onInit(initialData: unknown) {
      if (typeof initialData !== 'object' || initialData === null) return;
      showSplit(initialData as Record<string, unknown>);
    },

    onEvent(event: FacetRuntimeEvent) {
      const p =
        typeof event.payload === 'object' && event.payload !== null
          ? (event.payload as Record<string, unknown>)
          : {};

      switch (event.type) {
        case 'split':
          showSplit(p);
          break;

        case 'measure': {
          const name = typeof p.name === 'string' ? p.name : null;
          const value = num(p.value);
          if (name === null || value === null) break;
          stage?.setMeasure?.(name, value);
          break;
        }

        case 'ruler': {
          const ticks = num(p.ticks);
          if (ticks === null) break;
          stage?.setRuler?.(ticks);
          break;
        }

        case 'store': {
          const input = num(p.input);
          const stored = num(p.stored);
          if (input === null || stored === null) break;
          stage?.setStored?.(input, stored);
          break;
        }

        case 'phase': {
          // silent 이벤트이지만 projector 에는 온다 — 코드 패널 하이라이트가
          // 여기서 갈린다 (C3).
          const phase = typeof p.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase?.(phase);
          break;
        }

        default:
          // 그 밖의 이벤트는 이 화면에 보일 것이 없다 — 조용히 흘린다 (C2).
          break;
      }
    },

    onReset() {
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
