/**
 * skipList 의 Projector — algorithm 이 내는 여덟 이벤트를 stage 메서드 호출로
 * 옮긴다. 그림도 문안도 여기서 짓지 않는다: 좌표는 stage 가 캔버스에서 역산하고
 * 문안은 `FacetJson.messages` 에 있다 (C10). 여기 남는 것은 키와 en 원본뿐이다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { ProjectorFactory, ProjectorInstance, ProjectorRuntime, ProjectorViews } from '@ffacet/core/runtime';

/** stage 의 구조적 계약. 전부 optional 이고 호출은 `?.()` 로 한다 (C9). */
type SkipStage = {
  setShape?(shape: { n: number; maxLevels: number; values: number[]; heights: number[] }): void;
  fillLevel?(level: number, count: number): void;
  setTarget?(index: number, value: number): void;
  probe?(level: number, index: number, verdict: 'less' | 'greater'): void;
  laneEnd?(level: number): void;
  found?(level: number, index: number): void;
  setContrast?(points: Array<{ n: number; skip: number; flat: number; log2: number }>, current: number): void;
  setCaption?(text: string): void;
  setVerdict?(text: string): void;
  clear?(): void;
};

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asNumbers(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  for (const x of v) if (typeof x !== 'number') return null;
  return v as number[];
}

function asPoints(v: unknown): Array<{ n: number; skip: number; flat: number; log2: number }> | null {
  if (!Array.isArray(v)) return null;
  const out: Array<{ n: number; skip: number; flat: number; log2: number }> = [];
  for (const raw of v) {
    const p = asObject(raw);
    if (!p) return null;
    const n = asNumber(p.n);
    const skip = asNumber(p.skip);
    const flat = asNumber(p.flat);
    const log2 = asNumber(p.log2);
    if (n === null || skip === null || flat === null || log2 === null) return null;
    out.push({ n, skip, flat, log2 });
  }
  return out;
}

/** 화면에 적는 수. 정수면 그대로, 아니면 소수 한 자리. */
function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export const skipListProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as SkipStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 지금 찾고 있는 값. 캡션이 매번 되뇌므로 들고 있는다. */
  let target = 0;

  return {
    /**
     * 되돌리기 뒤에도 다시 불린다 (`ReactiveMechanism.reset`). stage 를 마운트
     * 직후의 빈 틀로 돌리는 것이 전부다 — `initialData` 를 여기서 다시 좁혀
     * 밀어 넣지 않는다. 그 일은 stage 의 `mount` 가 이미 했고, 되돌린 데이터는
     * 마운트 때의 그것과 같다.
     */
    onInit(): void {
      target = 0;
      stage?.clear?.();
    },

    async onEvent(event): Promise<void> {
      const p = asObject(event.payload);

      switch (event.type) {
        case 'built': {
          if (!p) return;
          const n = asNumber(p.n);
          const maxLevels = asNumber(p.maxLevels);
          const values = asNumbers(p.values);
          const heights = asNumbers(p.heights);
          if (n === null || maxLevels === null || !values || !heights) return;
          stage?.setShape?.({ n, maxLevels, values, heights });
          stage?.setVerdict?.('');
          stage?.setCaption?.(
            tr('caption.build', 'Levels fill in from the top. Each one keeps about half.'),
          );
          return;
        }

        case 'level-filled': {
          if (!p) return;
          const level = asNumber(p.level);
          const count = asNumber(p.count);
          const ratio = asNumber(p.ratio);
          if (level === null || count === null || ratio === null) return;
          stage?.fillLevel?.(level, count);
          // ratio 는 count / n 이므로 n 을 되짚을 수 있다. 캡션이 "전체 중 몇" 을
          // 말해야 하는데 이 이벤트에 n 이 따로 오지 않는다.
          const total = ratio > 0 ? Math.round(count / ratio) : 0;
          stage?.setCaption?.(
            tr('caption.level', 'Level {level} holds {count} of {n}.', {
              level,
              count,
              n: total,
            }),
          );
          return;
        }

        case 'search-begin': {
          if (!p) return;
          const value = asNumber(p.target);
          const index = asNumber(p.targetIndex);
          if (value === null || index === null) return;
          target = value;
          stage?.setTarget?.(index, value);
          stage?.setCaption?.(
            tr('caption.start', 'Looking for {target} — the value that takes the most looks.', {
              target: value,
            }),
          );
          return;
        }

        case 'probe': {
          if (!p) return;
          const level = asNumber(p.level);
          const index = asNumber(p.index);
          const value = asNumber(p.value);
          const verdict = p.verdict === 'less' || p.verdict === 'greater' ? p.verdict : null;
          if (level === null || index === null || value === null || verdict === null) return;
          stage?.probe?.(level, index, verdict);
          stage?.setCaption?.(
            verdict === 'less'
              ? tr('caption.leap', '{v} is below {target} — leap over to it.', { v: value, target })
              : tr('caption.overshoot', '{v} is past {target} — overshot, so step down one level.', {
                  v: value,
                  target,
                }),
          );
          return;
        }

        case 'lane-end': {
          if (!p) return;
          const level = asNumber(p.level);
          if (level === null) return;
          stage?.laneEnd?.(level);
          stage?.setCaption?.(tr('caption.laneEnd', 'Nothing more on this level — step down one.'));
          return;
        }

        case 'found': {
          if (!p) return;
          const level = asNumber(p.level);
          const index = asNumber(p.index);
          const steps = asNumber(p.steps);
          if (level === null || index === null || steps === null) return;
          stage?.found?.(level, index);
          stage?.setCaption?.(tr('caption.found', 'Found it after {steps} looks.', { steps }));
          return;
        }

        case 'contrast': {
          if (!p) return;
          const points = asPoints(p.points);
          const current = asNumber(p.current);
          if (!points || current === null) return;
          stage?.setContrast?.(points, current);
          return;
        }

        case 'done': {
          if (!p) return;
          const n = asNumber(p.n);
          const skip = asNumber(p.skip);
          const flat = asNumber(p.flat);
          if (n === null || skip === null || flat === null) return;
          // 작을 때는 층이 값을 못 한다. 그 사실을 화면이 말하게 한다.
          stage?.setCaption?.(
            skip >= flat - 1
              ? tr(
                  'caption.tie',
                  'At {n} the two are nearly the same — {skip} against {flat}. Levels cannot earn their keep yet.',
                  { n, skip: fmt(skip), flat: fmt(flat) },
                )
              : tr(
                  'caption.done',
                  'Over all {n} values: {skip} looks on average, {flat} on a single level.',
                  { n, skip: fmt(skip), flat: fmt(flat) },
                ),
          );
          stage?.setVerdict?.(
            tr(
              'caption.wait',
              'Nobody managed the shape. Move the handle and watch the looks grow like log n.',
            ),
          );
          return;
        }

        default:
          // 그 밖의 어휘는 조용히 버린다 — 이 facet 의 algorithm 은 위 여덟만 낸다.
          return;
      }
    },
  };
};
