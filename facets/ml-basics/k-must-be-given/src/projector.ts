/**
 * k-must-be-given projector — 알고리즘이 낸 답을 화면의 손짓으로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). stage 는 이미 정형이 된 값만 받는다.
 * 화면 문안은 키로만 들고 en 원본은 호출부에 리터럴로 둔다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type Spot = { x: number; y: number };

type SettleStep = {
  k: number;
  assign: number[];
  sizes: number[];
  centers: Spot[];
  scatter: number;
};

type Stage = {
  showCloud?(scatterMax: number): Promise<void>;
  chooseK?(k: number, seeds: number[]): Promise<void>;
  settle?(step: SettleStep): Promise<void>;
  markDrops?(drops: number[]): Promise<void>;
  drawChord?(): Promise<void>;
  overlayAll?(): Promise<void>;
  rewind?(): void;
  setCaption?(text: string): void;
};

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function toSpots(value: unknown): Spot[] {
  if (!Array.isArray(value)) return [];
  const out: Spot[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.x !== 'number' || typeof c.y !== 'number') continue;
    out.push({ x: c.x, y: c.y });
  }
  return out;
}

/** 무리 크기를 화면에 얹는 표기. 수와 가운뎃점뿐이라 표식이다 (C10). */
function sizeMark(sizes: number[]): string {
  return sizes.join(' · ');
}

export const kMustBeGivenProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
) => {
  const tr = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as Stage | undefined;

  /**
   * 갈림의 캡션은 k 마다 다르다 — 같은 문장을 세 번 되풀이하면 걸음이 논증이
   * 아니라 나열이 된다. 키와 en 원본은 호출부에 리터럴로 남긴다 (C10).
   */
  const splitCaption = (k: number, sizes: string): string => {
    if (k <= 2) return tr('caption.split2', 'It cuts top from bottom. Group sizes: {sizes}.', { sizes });
    if (k === 3) {
      return tr('caption.split3', 'Run it again and the lower half cuts in two. Group sizes: {sizes}.', {
        sizes,
      });
    }
    return tr('caption.split4', 'Again, into four — this cut is real too. Group sizes: {sizes}.', { sizes });
  };

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const raw = event.payload;
      const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

      switch (event.type) {
        case 'points-placed': {
          stage?.setCaption?.(tr('caption.cloud', 'Twelve points, one cloud. Nothing is cut yet.'));
          await stage?.showCloud?.(toNumber(p.scatterMax, 1));
          return;
        }
        case 'k-chosen': {
          const k = toNumber(p.k, 2);
          stage?.setCaption?.(
            tr('caption.chosen', 'Pick starting centres, farthest first. k = {k}.', { k }),
          );
          await stage?.chooseK?.(k, toNumbers(p.seeds));
          return;
        }
        case 'split-settled': {
          const step: SettleStep = {
            k: toNumber(p.k, 2),
            assign: toNumbers(p.assign),
            sizes: toNumbers(p.sizes),
            centers: toSpots(p.centers),
            scatter: toNumber(p.scatter, 0),
          };
          stage?.setCaption?.(splitCaption(step.k, sizeMark(step.sizes)));
          await stage?.settle?.(step);
          return;
        }
        case 'elbow-tested': {
          const drops = toNumbers(p.drops);
          stage?.setCaption?.(
            tr('caption.drops', 'Measure how far the scatter fell: {d1}, then {d2}.', {
              d1: (drops[0] ?? 0).toFixed(2),
              d2: (drops[1] ?? 0).toFixed(2),
            }),
          );
          await stage?.markDrops?.(drops);
          return;
        }
        case 'no-kink': {
          stage?.setCaption?.(
            tr('caption.noKink', 'The later fall is the bigger one. There is no kink to pick.'),
          );
          await stage?.drawChord?.();
          return;
        }
        case 'all-alive': {
          stage?.setCaption?.(
            tr('caption.allAlive', 'All three cuts stand. How many groups is given, not found.'),
          );
          await stage?.overlayAll?.();
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        case 'done': {
          // 마지막 걸음(all-alive)이 이미 완결된 화면이다. 따로 그릴 것이 없다.
          return;
        }
        default:
          // 위에 없는 type 은 이 facet 이 발신하지 않는다. 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
