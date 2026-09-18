/**
 * top-k / top-p projector — 알고리즘 이벤트를 stage 메서드와 코드 패널 하이라이트로 옮긴다.
 *
 * 움직임의 길이는 재생 속도로 나눈다 — 한 걸음(stepMs) 안에 끝나게.
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { ContextFrame, CutterName, RankStatus, TopKTopPStage } from './top-k-top-p-stage.js';

/** 속도 1 에서의 움직임 길이. stepMs(900) 안에 들어간다. */
const MOTION_MS = 640;

type CodePanel = { highlightPhase?: (phase: string | null) => void };

function record(x: unknown): Record<string, unknown> {
  return typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {};
}

function nums(x: unknown): number[] {
  return Array.isArray(x) ? x.filter((v): v is number => typeof v === 'number') : [];
}

function frames(x: unknown): ContextFrame[] {
  if (!Array.isArray(x)) return [];
  return x.map((raw) => {
    const r = record(raw);
    return {
      share: nums(r.share),
      cutPermille: typeof r.cutPermille === 'number' ? r.cutPermille : 0,
      total: typeof r.total === 'number' ? r.total : 0,
      cutPercent: typeof r.cutPercent === 'number' ? r.cutPercent : 0,
    };
  });
}

function statuses(x: unknown): RankStatus[] {
  if (!Array.isArray(x)) return [];
  return x.map((v) => (v === 'stay' || v === 'reach' ? v : 'closed'));
}

function cutters(x: unknown): CutterName[] {
  if (!Array.isArray(x)) return [];
  return x.map((v) => (v === 'k' || v === 'p' || v === 'renorm-p' ? v : 'none'));
}

export const topKTopPProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Partial<TopKTopPStage> | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const motion = () => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onEvent(event: FacetRuntimeEvent) {
      const p = record(event.payload);
      switch (event.type) {
        case 'phase': {
          code?.highlightPhase?.(typeof p.phase === 'string' ? p.phase : null);
          return;
        }
        case 'round': {
          const k = typeof p.topK === 'number' ? p.topK : 0;
          const pp = typeof p.topP === 'number' ? p.topP : 0;
          const label = typeof p.topPLabel === 'string' ? p.topPLabel : '';
          stage?.round?.(k, pp, label, frames(p.frames), motion());
          stage?.setCaption?.(
            t('caption.round', 'Set — top-k: {k} · top-p: {p}. Both contexts start from the full distribution.', {
              k,
              p: label,
            }),
          );
          return;
        }
        case 'k-cut': {
          const kept = nums(p.kept);
          const k = typeof p.topK === 'number' ? p.topK : 0;
          stage?.cutK?.(kept, nums(p.mass), frames(p.frames), motion());
          const n = kept[0] ?? 0;
          const cutsNothing = nums(p.dropped).every((x) => x === 0);
          stage?.setCaption?.(
            cutsNothing
              ? t('caption.kNone', 'top-k {k} cuts nothing — every candidate stays. Kept: {n}.', { k, n })
              : t(
                  'caption.kCut',
                  'top-k keeps the same number in both contexts — kept: {n}. The rest falls and the survivors swell to fill the column.',
                  { n },
                ),
          );
          return;
        }
        case 'p-check': {
          const rank = typeof p.rank === 'number' ? p.rank : 0;
          stage?.check?.(rank, statuses(p.status), nums(p.run), frames(p.frames), motion());
          stage?.setCaption?.(
            t('caption.check', 'Rank {rank} — add its share to the running total and compare it with the p line.', {
              rank: rank + 1,
            }),
          );
          return;
        }
        case 'p-cut': {
          const kept = nums(p.kept);
          stage?.settle?.(nums(p.keptSum), frames(p.frames), motion());
          stage?.setCaption?.(
            t('caption.settle', 'Kept — peaked: {a} · flat: {b}. What is left is rescaled to fill the column.', {
              a: kept[0] ?? 0,
              b: kept[1] ?? 0,
            }),
          );
          return;
        }
        case 'measure': {
          const cut = nums(p.cutPercent);
          stage?.verdict?.(cutters(p.cutter));
          stage?.setCaption?.(
            t('caption.measure', 'Cut share — peaked: {a}% · flat: {b}%.', { a: cut[0] ?? 0, b: cut[1] ?? 0 }),
          );
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      code?.highlightPhase?.(null);
      stage?.reset?.();
    },
  };
};
