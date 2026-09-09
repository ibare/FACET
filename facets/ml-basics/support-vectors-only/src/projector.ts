/**
 * support-vectors-only projector — 이벤트를 무대의 동작으로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). 좁히는 규칙은 stage 가 한 벌만 들고 있고
 * mount(initialData)와 이 파일(payload)이 함께 쓴다.
 *
 * 화면 문안은 전부 키로만 다룬다 (C10). 어떤 문안을 고를지는 알고리즘이 보낸
 * 사실(verdict / wasSupport)이 정하고, 문장 자체는 facet.ts 의 messages 에 있다.
 */

import type { ProjectorFactory, ProjectorInstance, ProjectorRuntime, ProjectorViews } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

import {
  readIndexList,
  readStagePoints,
  readStageSolution,
  type StagePoint,
  type StageSolution,
} from './support-vectors-only-stage.js';

type Stage = {
  setCaption?(text: string): void;
  setPoints?(points: StagePoint[]): Promise<void>;
  solveBoundary?(sol: StageSolution): Promise<void>;
  pulseSupports?(): Promise<void>;
  dropPoints?(indices: number[]): Promise<void>;
  restorePoints?(points: StagePoint[]): Promise<void>;
  movePoint?(index: number, toX: number, toY: number): Promise<void>;
  conclude?(indices: number[]): Promise<void>;
  rewind?(): void;
};

type MovePayload = { index: number; toX: number; toY: number; steps: number; wasSupport: boolean };

function readMove(value: unknown): MovePayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const rec = value as Record<string, unknown>;
  if (
    typeof rec.index !== 'number' ||
    typeof rec.toX !== 'number' ||
    typeof rec.toY !== 'number' ||
    typeof rec.steps !== 'number'
  ) {
    return null;
  }
  return {
    index: rec.index,
    toX: rec.toX,
    toY: rec.toY,
    steps: rec.steps,
    wasSupport: rec.wasSupport === true,
  };
}

/** 칸 수는 정수로 떨어지는 것이 보통이라 꼬리 0 을 달지 않는다. */
function stepText(steps: number): string {
  return Number.isInteger(steps) ? String(steps) : steps.toFixed(2);
}

export const supportVectorsOnlyProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onReset(): void {
      stage.rewind?.();
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'points-placed': {
          const points = readStagePoints(
            (event.payload as { points?: unknown } | undefined)?.points,
          );
          stage.setCaption?.(
            tr('caption.place', 'Points on the board: {n}. Group A below, group B above.', {
              n: points.length,
            }),
          );
          await stage.setPoints?.(points);
          return;
        }

        case 'boundary-solved': {
          const sol = readStageSolution(event.payload);
          if (sol === null) return;
          stage.setCaption?.(
            sol.verdict === 'first'
              ? tr('caption.solve', 'Sweeping every direction for the widest gap between the groups.')
              : sol.verdict === 'same'
                ? tr('caption.same', 'Solved again — the line lands right back on its first place. Touching: {n}.', {
                    n: sol.supports.length,
                  })
                : tr('caption.moved', 'Solved again — the line followed, and the band narrowed. Touching: {n}.', {
                    n: sol.supports.length,
                  }),
          );
          await stage.solveBoundary?.(sol);
          return;
        }

        case 'supports-marked': {
          const payload = event.payload as { indices?: unknown; restCount?: unknown } | undefined;
          const indices = readIndexList(payload?.indices);
          const rest = typeof payload?.restCount === 'number' ? payload.restCount : 0;
          stage.setCaption?.(
            tr('caption.touching', 'Touching the edge: {n}. The other {rest} had no say.', {
              n: indices.length,
              rest,
            }),
          );
          await stage.pulseSupports?.();
          return;
        }

        case 'points-dropped': {
          const indices = readIndexList(
            (event.payload as { indices?: unknown } | undefined)?.indices,
          );
          stage.setCaption?.(
            tr('caption.drop', 'Throw away everything that was not touching: {n}.', {
              n: indices.length,
            }),
          );
          await stage.dropPoints?.(indices);
          return;
        }

        case 'points-restored': {
          const points = readStagePoints(
            (event.payload as { points?: unknown } | undefined)?.points,
          );
          await stage.restorePoints?.(points);
          return;
        }

        case 'point-moved': {
          const move = readMove(event.payload);
          if (move === null) return;
          const steps = stepText(move.steps);
          stage.setCaption?.(
            move.wasSupport
              ? tr('caption.moveSupport', 'Back to the start, then one touching point moves {n} steps.', {
                  n: steps,
                })
              : tr('caption.moveFree', 'Back to the start, then one non-touching point moves {n} steps.', {
                  n: steps,
                }),
          );
          await stage.movePoint?.(move.index, move.toX, move.toY);
          return;
        }

        case 'rewind': {
          stage.rewind?.();
          return;
        }

        case 'done': {
          const indices = readIndexList(
            (event.payload as { supports?: unknown } | undefined)?.supports,
          );
          stage.setCaption?.(
            tr('caption.done', 'Only the points sitting on the edge decide where the line goes.'),
          );
          await stage.conclude?.(indices);
          return;
        }

        default:
          // 위에 없는 type 은 이 facet 이 발신하지 않는다 — 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
