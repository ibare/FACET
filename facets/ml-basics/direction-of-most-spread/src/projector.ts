/**
 * 가장 넓게 퍼진 방향 — 번역기.
 *
 * algorithm 이 보내는 것은 재어 낸 수뿐이고, 그것을 어느 메서드로 어떤 문안과
 * 함께 무대에 올릴지는 여기서 정한다. payload 는 그대로 넘기지 않고 정형 객체로
 * 좁혀 넘긴다 (C9).
 */

import type { ProjectorFactory, ProjectorInstance, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type SpreadStage = {
  showCenter(cx: number, cy: number): Promise<void>;
  turnTo(deg: number, variance: number, across: number, total: number): Promise<void>;
  narrowTo(
    deg: number,
    variance: number,
    across: number,
    total: number,
    angles: number[],
    values: number[],
  ): Promise<void>;
  settle(deg: number, variance: number, across: number, total: number): Promise<void>;
  setCaption(text: string): void;
  rewind(): void;
};

/** 걸음마다 오는 네 수. */
type Reading = { deg: number; variance: number; across: number; total: number };

function readReading(payload: unknown): Reading | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.angleDeg !== 'number' ||
    typeof p.variance !== 'number' ||
    typeof p.across !== 'number' ||
    typeof p.total !== 'number'
  ) {
    return null;
  }
  return { deg: p.angleDeg, variance: p.variance, across: p.across, total: p.total };
}

function readNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const v of value) if (typeof v === 'number') out.push(v);
  return out;
}

export const directionOfMostSpreadProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as SpreadStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      switch (event.type) {
        case 'center-found': {
          const p = (event.payload ?? {}) as Record<string, unknown>;
          if (typeof p.cx !== 'number' || typeof p.cy !== 'number') return;
          stage.setCaption(tr('caption.center', 'The axis will pivot through the center of the cloud.'));
          await stage.showCenter(p.cx, p.cy);
          return;
        }
        case 'axis-turn': {
          const r = readReading(event.payload);
          if (!r) return;
          stage.setCaption(tr('caption.turn', 'Turning the axis, measuring how far the marks spread.'));
          await stage.turnTo(r.deg, r.variance, r.across, r.total);
          return;
        }
        case 'narrow': {
          const r = readReading(event.payload);
          if (!r) return;
          const p = (event.payload ?? {}) as Record<string, unknown>;
          const angles = readNumbers(p.curveAngles);
          const values = readNumbers(p.curveValues);
          stage.setCaption(tr('caption.stop', 'It comes back and stops where the spread is widest.'));
          await stage.narrowTo(r.deg, r.variance, r.across, r.total, angles, values);
          return;
        }
        case 'done': {
          const r = readReading(event.payload);
          if (!r) return;
          const p = (event.payload ?? {}) as Record<string, unknown>;
          const share = typeof p.share === 'number' ? p.share : (r.variance / r.total) * 100;
          stage.setCaption(
            tr('caption.done', 'The widest direction holds this much of the total: {share}%.', {
              share: share.toFixed(1),
            }),
          );
          await stage.settle(r.deg, r.variance, r.across, r.total);
          return;
        }
        case 'rewind': {
          stage.rewind();
          return;
        }
        default:
          // 그 밖의 이벤트는 이 조각이 내보내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind();
    },
  };
};
