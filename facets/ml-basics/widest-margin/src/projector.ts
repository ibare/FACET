/**
 * widest-margin projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 열린 타입이므로 여기서 한 번 좁히고, stage 는 좁혀진 것만 본다 (C9).
 * 문안은 algorithm 이 보내지 않는다 — 어느 걸음이 무슨 말을 할지는 여기서 정하고
 * 문안 자체는 `facet.ts` 의 `messages` 에 있다 (C10).
 */

import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';

import {
  formatSlope,
  formatThickness,
  readWidestMarginModel,
} from './widest-margin-stage.js';
import type { BandSpec, LockSpec, WidestMarginModel } from './widest-margin-stage.js';

type Line = { slope: number; intercept: number };

type Stage = {
  setCaption?(text: string): void;
  setModel?(model: WidestMarginModel): void;
  placePoints?(): Promise<void>;
  drawCandidates?(lines: Line[]): Promise<void>;
  growBand?(spec: BandSpec): Promise<void>;
  pivotLine?(spec: Line): Promise<void>;
  lockContacts?(spec: LockSpec): Promise<void>;
  crownRow?(row: number): Promise<void>;
  rewind?(): void;
};

/** payload 필드 하나를 수로 읽는다. 없거나 수가 아니면 fallback. */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readLines(v: unknown): Line[] {
  if (!Array.isArray(v)) return [];
  const out: Line[] = [];
  for (const item of v) {
    const o = item as { slope?: unknown; intercept?: unknown };
    if (typeof o?.slope !== 'number' || typeof o?.intercept !== 'number') continue;
    out.push({ slope: o.slope, intercept: o.intercept });
  }
  return out;
}

export const widestMarginProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      stage?.setModel?.(readWidestMarginModel(initialData));
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = event.payload as
        | {
            lines?: unknown;
            row?: unknown;
            slope?: unknown;
            intercept?: unknown;
            thickness?: unknown;
            best?: unknown;
          }
        | undefined;

      switch (event.type) {
        case 'points-placed': {
          stage?.setCaption?.(tr('caption.points', 'Points carrying two different labels.'));
          await stage?.placePoints?.();
          break;
        }

        case 'candidates-drawn': {
          stage?.setCaption?.(tr('caption.candidates', 'Every one of these lines separates the two groups.'));
          await stage?.drawCandidates?.(readLines(p?.lines));
          break;
        }

        case 'band-grow': {
          const slope = num(p?.slope, 0);
          const best = p?.best === true;
          stage?.setCaption?.(tr(
            best ? 'caption.growBest' : 'caption.grow',
            best
              ? 'Slope {slope}: this band opens wider than any candidate.'
              : 'Slope {slope}: the band widens until it touches a point, then stops.',
            { slope: formatSlope(slope) },
          ));
          await stage?.growBand?.({
            row: Math.max(0, Math.trunc(num(p?.row, 0))),
            slope,
            intercept: num(p?.intercept, 0),
            thickness: Math.max(0, num(p?.thickness, 0)),
            contacts: toIndexArray(event.target),
            best,
          });
          break;
        }

        case 'line-pivot': {
          stage?.setCaption?.(tr('caption.pivot', 'Turning to the slope that lets the band open widest.'));
          await stage?.pivotLine?.({
            slope: num(p?.slope, 0),
            intercept: num(p?.intercept, 0),
          });
          break;
        }

        case 'contacts-locked': {
          stage?.setCaption?.(tr('caption.contacts', 'The points the band touched are what fix this line.'));
          await stage?.lockContacts?.({
            contacts: toIndexArray(event.target),
            slope: num(p?.slope, 0),
            intercept: num(p?.intercept, 0),
          });
          break;
        }

        case 'done': {
          stage?.setCaption?.(tr('caption.done', 'The widest gap wins. Thickness: {thickness}', {
            thickness: formatThickness(Math.max(0, num(p?.thickness, 0))),
          }));
          await stage?.crownRow?.(Math.max(0, Math.trunc(num(p?.row, 0))));
          break;
        }

        case 'rewind': {
          stage?.rewind?.();
          break;
        }

        default:
          // 이 facet 의 algorithm 이 내보내는 것은 위가 전부다. 그 밖의 이벤트가
          // 들어오면 조용히 흘린다 (C2).
          break;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
