/**
 * zAlgorithm 의 projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 하나도 지나가지 않는다. 여기서 넘기는 것은 수와 글자뿐이고, 무엇이라
 * 말할지는 stage 가 `facet.ts` 의 messages 에서 받는다 (C10).
 *
 * payload 는 여기서 좁혀 정형 객체로 만들어 넘긴다 (C9).
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 없는 메서드와도 견디게 전부 optional 이다 (C9). */
type ZStage = {
  rebuild?(info: { level: number; pattern: string; separator: string; text: string; joined: string }): void;
  showWhole?(step: { index: number; value: number }): Promise<void>;
  borrow?(step: { index: number; from: number; value: number }): Promise<void>;
  scan?(step: { index: number; start: number; value: number; mismatch: boolean; inside: boolean }): Promise<void>;
  moveWindow?(step: { left: number; right: number }): Promise<void>;
  markMatch?(step: { at: number; index: number }): Promise<void>;
  showSummary?(info: { borrows: number; saved: number; matches: number }): void;
  finish?(): void;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function fields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  // 이 뒤로 필드마다 typeof 로 거른다 — 가드가 뒤따르는 좁히개다 (C9).
  return payload as Record<string, unknown>;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export const zAlgorithmProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as ZStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  return {
    onInit(): void {
      // 초기 데이터를 좁혀 밀어 넣지 않는다 — 그것은 stage 의 mount 가 한다.
      // 첫 단이 시작하면 곧바로 `text-chosen` 이 와서 화면을 다시 짓는다.
      codePanel?.clearHighlight?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = fields(event.payload);

      switch (event.type) {
        case 'text-chosen': {
          const level = num(p?.['level']);
          const pattern = str(p?.['pattern']);
          const separator = str(p?.['separator']);
          const text = str(p?.['text']);
          const joined = str(p?.['joined']);
          if (level === null || pattern === null || separator === null) return;
          if (text === null || joined === null) return;
          stage?.rebuild?.({ level, pattern, separator, text, joined });
          return;
        }

        case 'whole-prefix': {
          const index = num(p?.['index']);
          const value = num(p?.['value']);
          if (index === null || value === null) return;
          await stage?.showWhole?.({ index, value });
          return;
        }

        case 'mirror': {
          const index = num(p?.['index']);
          const from = num(p?.['from']);
          const value = num(p?.['value']);
          if (index === null || from === null || value === null) return;
          await stage?.borrow?.({ index, from, value });
          return;
        }

        case 'scan': {
          const index = num(p?.['index']);
          const start = num(p?.['start']);
          const value = num(p?.['value']);
          if (index === null || start === null || value === null) return;
          await stage?.scan?.({
            index,
            start,
            value,
            mismatch: p?.['mismatch'] === true,
            inside: p?.['inside'] === true,
          });
          return;
        }

        case 'window': {
          const left = num(p?.['left']);
          const right = num(p?.['right']);
          if (left === null || right === null) return;
          await stage?.moveWindow?.({ left, right });
          return;
        }

        case 'match': {
          const at = num(p?.['at']);
          const index = num(p?.['index']);
          if (at === null || index === null) return;
          await stage?.markMatch?.({ at, index });
          return;
        }

        case 'summary': {
          const borrows = num(p?.['borrows']);
          const saved = num(p?.['saved']);
          const matches = num(p?.['matches']);
          if (borrows === null || saved === null || matches === null) return;
          stage?.showSummary?.({ borrows, saved, matches });
          return;
        }

        case 'done': {
          stage?.finish?.();
          return;
        }

        case 'phase': {
          const name = str(p?.['phase']);
          codePanel?.highlightPhase?.(name);
          return;
        }

        default:
          // 위 어휘 밖의 이벤트는 이 facet 이 내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
