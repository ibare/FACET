/**
 * sieve 의 projector — 알고리즘이 셈한 것을 stage 메서드로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 만든 뒤 넘긴다 (C9). 문안은 키로만 다루고
 * 문장 자체는 `facet.ts` 의 messages 에 있다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 없는 메서드와도 견디게 전부 optional 이다 (C9). */
type SieveStage = {
  setBoard?(info: { limit: number }): void;
  probe?(info: { p: number; skipped: boolean }): void;
  strike?(frame: { p: number; marks: number[] }): void;
  halt?(): void;
  reveal?(frame: { limit: number; primes: number[]; erasers: number[] }): void;
  setCaption?(text: string): void;
  resetAll?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
}

export const sieveProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as SieveStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit() {
      codePanel?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      const p = asRecord(event.payload);
      switch (event.type) {
        case 'board-ready': {
          const limit = num(p?.limit);
          stage?.setBoard?.({ limit });
          stage?.setCaption?.(
            tr('caption.setup', 'Nothing is crossed out yet. The board runs from 2 to {n}.', {
              n: limit,
            }),
          );
          return;
        }

        case 'probe': {
          const value = num(p?.p);
          const skipped = p?.skipped === true;
          stage?.probe?.({ p: value, skipped });
          stage?.setCaption?.(
            skipped
              ? tr('caption.skip', '{p} is already crossed out, so it erases nothing.', { p: value })
              : tr('caption.pick', '{p} was never crossed out, so {p} becomes an eraser.', {
                  p: value,
                }),
          );
          return;
        }

        case 'strike': {
          const value = num(p?.p);
          const marks = numList(p?.marks);
          stage?.strike?.({ p: value, marks });
          stage?.setCaption?.(
            tr('caption.strike', 'Multiples of {p} from {from} on: {count} cells crossed out.', {
              p: value,
              from: num(p?.from),
              // 개수를 문안에 박지 않는다 — 한계를 밀면 이 수가 달라진다.
              count: marks.length,
            }),
          );
          return;
        }

        case 'halt': {
          stage?.halt?.();
          stage?.setCaption?.(
            tr('caption.halt', '{p} squared is already past {n}. No more erasers after this.', {
              p: num(p?.p),
              n: num(p?.limit),
            }),
          );
          return;
        }

        case 'sifted': {
          const primes = numList(p?.primes);
          const erasers = numList(p?.erasers);
          stage?.reveal?.({ limit: num(p?.limit), primes, erasers });
          stage?.setCaption?.(
            tr('caption.sifted', '{count} primes are left, and only {e} of them did any erasing.', {
              count: primes.length,
              e: erasers.length,
            }),
          );
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr('caption.push', 'Push the limit. The board grows, the erasers do not.'),
          );
          return;
        }

        case 'phase': {
          const name = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase?.(name);
          return;
        }

        default:
          // 그 밖의 이벤트는 이 facet 이 내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset() {
      stage?.resetAll?.();
      codePanel?.clearHighlight?.();
    },
  };
};
