/**
 * pivot-choice-matters projector — 가르는 사건을 저울 위의 운동으로 옮긴다.
 *
 * 캡션은 payload 의 사실에서 고른다 (판 번호가 아니라). 기준이 줄의 맨 앞이면
 * "맨 앞 값을 고른다", 한쪽 팔이 비면 "전부 한쪽에 쌓인다", 남는 일이 절반
 * 이하면 "일이 반으로 줄었다" — 문안 자체는 FacetJson.messages 에 있고 여기엔
 * 키와 en 원본만 남는다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
} from '@ffacet/core/runtime';

type ArmSide = 'left' | 'right';

/** stage view 의 구조적 계약 (C9). */
type PivotStage = {
  liftPivot?(p: { lane: number; index: number }): Promise<void> | void;
  moveToArm?(p: {
    lane: number;
    index: number;
    side: ArmSide;
    slot: number;
  }): Promise<void> | void;
  settleBeam?(p: {
    lane: number;
    leftCount: number;
    rightCount: number;
  }): Promise<void> | void;
  markRemaining?(p: {
    lane: number;
    leftCount: number;
    rightCount: number;
    remaining: number;
    total: number;
  }): void;
  compareLanes?(): void;
  rewind?(): void;
  setCaption?(text: string): void;
};

type LiftPayload = { lane: number; index: number; value: number };
type MovePayload = { lane: number; index: number; side: ArmSide; slot: number };
type SettlePayload = { lane: number; pivot: number; leftCount: number; rightCount: number };
type MeasurePayload = {
  lane: number;
  leftCount: number;
  rightCount: number;
  remaining: number;
  total: number;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readLift(payload: unknown): LiftPayload | null {
  const p = payload as { lane?: unknown; index?: unknown; value?: unknown } | undefined;
  const lane = num(p?.lane);
  const index = num(p?.index);
  const value = num(p?.value);
  if (lane === null || index === null || value === null) return null;
  return { lane, index, value };
}

function readMove(payload: unknown): MovePayload | null {
  const p = payload as
    | { lane?: unknown; index?: unknown; side?: unknown; slot?: unknown }
    | undefined;
  const lane = num(p?.lane);
  const index = num(p?.index);
  const slot = num(p?.slot);
  const side = p?.side === 'left' || p?.side === 'right' ? p.side : null;
  if (lane === null || index === null || slot === null || side === null) return null;
  return { lane, index, side, slot };
}

function readSettle(payload: unknown): SettlePayload | null {
  const p = payload as
    | { lane?: unknown; pivot?: unknown; leftCount?: unknown; rightCount?: unknown }
    | undefined;
  const lane = num(p?.lane);
  const pivot = num(p?.pivot);
  const leftCount = num(p?.leftCount);
  const rightCount = num(p?.rightCount);
  if (lane === null || pivot === null || leftCount === null || rightCount === null) return null;
  return { lane, pivot, leftCount, rightCount };
}

function readMeasure(payload: unknown): MeasurePayload | null {
  const p = payload as
    | {
        lane?: unknown;
        leftCount?: unknown;
        rightCount?: unknown;
        remaining?: unknown;
        total?: unknown;
      }
    | undefined;
  const lane = num(p?.lane);
  const leftCount = num(p?.leftCount);
  const rightCount = num(p?.rightCount);
  const remaining = num(p?.remaining);
  const total = num(p?.total);
  if (
    lane === null ||
    leftCount === null ||
    rightCount === null ||
    remaining === null ||
    total === null
  ) {
    return null;
  }
  return { lane, leftCount, rightCount, remaining, total };
}

export const pivotChoiceMattersProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as PivotStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(): void {
      stage?.rewind?.();
    },

    onReset(): void {
      stage?.rewind?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'pivot-lift': {
          const p = readLift(event.payload);
          if (!p) return;
          stage?.setCaption?.(
            p.index === 0
              ? tr(
                  'caption.pickFirst',
                  'Now take the first value {pivot} as the pivot — the input is already sorted.',
                  { pivot: p.value },
                )
              : tr('caption.pickMiddle', 'Take the middle value {pivot} as the pivot.', {
                  pivot: p.value,
                }),
          );
          await stage?.liftPivot?.({ lane: p.lane, index: p.index });
          return;
        }

        case 'partition-move': {
          const p = readMove(event.payload);
          if (!p) return;
          await stage?.moveToArm?.(p);
          return;
        }

        case 'beam-settle': {
          const p = readSettle(event.payload);
          if (!p) return;
          const empty = p.leftCount === 0 || p.rightCount === 0;
          stage?.setCaption?.(
            empty
              ? tr(
                  'caption.pileOneSide',
                  'Nothing is smaller than {pivot} — all {loaded} pile onto one side.',
                  { pivot: p.pivot, loaded: Math.max(p.leftCount, p.rightCount) },
                )
              : tr(
                  'caption.splitEven',
                  '{left} slide left, {right} slide right. The beam stays level.',
                  { left: p.leftCount, right: p.rightCount },
                ),
          );
          await stage?.settleBeam?.({
            lane: p.lane,
            leftCount: p.leftCount,
            rightCount: p.rightCount,
          });
          return;
        }

        case 'trial-measure': {
          const p = readMeasure(event.payload);
          if (!p) return;
          const halved = p.remaining * 2 <= p.total;
          stage?.setCaption?.(
            halved
              ? tr(
                  'caption.workHalved',
                  'The biggest part left holds {remaining} of {total} — the work halved.',
                  { remaining: p.remaining, total: p.total },
                )
              : tr(
                  'caption.workBarelySmaller',
                  'The biggest part left holds {remaining} of {total} — only the pivot is gone.',
                  { remaining: p.remaining, total: p.total },
                ),
          );
          stage?.markRemaining?.(p);
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        case 'done': {
          stage?.compareLanes?.();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각에 없다. 들어오면 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
