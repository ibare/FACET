/**
 * gap-shrink projector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀서 넘긴다 (C9). stage 는 좁혀진 숫자만 받고 이벤트를
 * 해석하지 않는다. 화면 문안은 키로 조회해 (C10) 문자열로 건넨다 — 문안 자체는
 * `facet.ts` 의 messages 에 있다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage view 의 계약. 열린 타입(ViewInstance) 을 여기서 한 번만 좁힌다. */
type GapShrinkStage = {
  setCaption?(text: string): void;
  showInitial?(values: number[]): void;
  beginRound?(round: number, gap: number): Promise<void>;
  showCompare?(left: number, right: number, comparisons: number): Promise<void>;
  showSwap?(left: number, right: number, round: number, moves: number): Promise<void>;
  showBaseline?(comparisons: number, moves: number): Promise<void>;
  finish?(): Promise<void>;
};

type RoundPayload = { round?: unknown; gap?: unknown };
type ComparePayload = { left?: unknown; right?: unknown; comparisons?: unknown };
type SwapPayload = { left?: unknown; right?: unknown; round?: unknown; moves?: unknown };
type TallyPayload = { comparisons?: unknown; moves?: unknown; baseMoves?: unknown };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const gapShrinkProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as GapShrinkStage;
  const tr = runtime?.t ?? makeTranslator();

  let values: number[] = [];

  const redraw = (): void => {
    stage.showInitial?.([...values]);
    stage.setCaption?.('');
  };

  return {
    onInit(initialData: unknown): void {
      const raw = (initialData as { values?: unknown } | undefined)?.values;
      values = Array.isArray(raw) ? raw.filter((v): v is number => isNum(v)) : [];
      redraw();
    },

    onReset(): void {
      redraw();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'round-begin': {
          const p = event.payload as RoundPayload | undefined;
          if (!isNum(p?.round) || !isNum(p?.gap)) return;
          stage.setCaption?.(
            p.gap > 1
              ? tr('caption.roundFar', 'Round {round} — compare pairs {gap} cells apart', {
                  round: p.round + 1,
                  gap: p.gap,
                })
              : tr('caption.roundNear', 'Round {round} — compare neighbours', {
                  round: p.round + 1,
                }),
          );
          await stage.beginRound?.(p.round, p.gap);
          return;
        }

        case 'stride-compare': {
          const p = event.payload as ComparePayload | undefined;
          if (!isNum(p?.left) || !isNum(p?.right) || !isNum(p?.comparisons)) return;
          await stage.showCompare?.(p.left, p.right, p.comparisons);
          return;
        }

        case 'stride-swap': {
          const p = event.payload as SwapPayload | undefined;
          if (!isNum(p?.left) || !isNum(p?.right) || !isNum(p?.round) || !isNum(p?.moves)) return;
          await stage.showSwap?.(p.left, p.right, p.round, p.moves);
          return;
        }

        case 'baseline-reveal': {
          const p = event.payload as TallyPayload | undefined;
          if (!isNum(p?.comparisons) || !isNum(p?.moves)) return;
          stage.setCaption?.(
            tr('caption.baseline', 'The same input, neighbours only from the start:'),
          );
          await stage.showBaseline?.(p.comparisons, p.moves);
          return;
        }

        case 'done': {
          const p = event.payload as TallyPayload | undefined;
          if (!isNum(p?.moves) || !isNum(p?.baseMoves)) return;
          stage.setCaption?.(
            tr(
              'caption.result',
              'Shrinking the stride: {moves} moves. Neighbours only: {baseMoves}.',
              { moves: p.moves, baseMoves: p.baseMoves },
            ),
          );
          await stage.finish?.();
          return;
        }

        case 'rewind': {
          redraw();
          return;
        }

        default:
          // 이 algorithm 이 내는 이벤트는 위가 전부다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
