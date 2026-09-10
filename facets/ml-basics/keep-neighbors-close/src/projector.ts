/**
 * keepNeighborsClose projector — 걸음을 무대의 메서드로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). 화면 문안은 키로만 부르고 문장은
 * `facet.ts` 의 `messages` 에 있다 (C10). 무대가 그리는 숫자는 문안이 아니라
 * 표식이므로 키를 만들지 않는다 — 조사도 어순도 붙지 않는 수 그 자체다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type Stage = {
  setCaption?(text: string): void;
  showRing?(gaps: number[]): Promise<void>;
  cut?(): Promise<void>;
  unroll?(positions: number[]): Promise<void>;
  markKept?(pairs: number[], dists: number[]): Promise<void>;
  showTorn?(label: string): Promise<void>;
  showFar?(a: number, b: number, before: number, after: number): Promise<void>;
  reset?(): void;
};

function fields(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nums(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item)) return null;
    out.push(item);
  }
  return out;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export const keepNeighborsCloseProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();
  const fmt = (value: number): string => value.toFixed(2);

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = fields(event.payload);

      switch (event.type) {
        case 'ring': {
          const gaps = nums(p.gaps);
          if (!gaps) return;
          stage.setCaption?.(
            tr('caption.ring', 'Ten points on a ring: every neighboring pair sits the same distance apart, {d}.', {
              d: fmt(mean(gaps)),
            }),
          );
          await stage.showRing?.(gaps);
          return;
        }

        case 'cut': {
          const a = num(p.a);
          const b = num(p.b);
          if (a === null || b === null) return;
          stage.setCaption?.(
            tr('caption.cut', 'A ring is closed, a line is open. So one link has to go: {a}-{b}.', {
              a,
              b,
            }),
          );
          await stage.cut?.();
          return;
        }

        case 'unroll': {
          const positions = nums(p.positions);
          if (!positions) return;
          stage.setCaption?.(
            tr(
              'caption.unroll',
              'The ring straightens into a line. Every neighbor gap is carried over as it was.',
            ),
          );
          await stage.unroll?.(positions);
          return;
        }

        case 'kept': {
          const pairs = nums(p.pairs);
          const dists = nums(p.dists);
          if (!pairs || !dists) return;
          stage.setCaption?.(
            tr('caption.kept', 'Nine of the ten neighbor pairs keep their distance exactly.'),
          );
          await stage.markKept?.(pairs, dists);
          return;
        }

        case 'torn': {
          const before = num(p.before);
          const after = num(p.after);
          const ratio = num(p.ratio);
          if (before === null || after === null || ratio === null) return;
          const vars = { before: fmt(before), after: fmt(after), ratio: ratio.toFixed(1) };
          stage.setCaption?.(
            tr(
              'caption.torn',
              'The cut pair pays for all of it: {before} becomes {after}, a factor of {ratio}.',
              vars,
            ),
          );
          await stage.showTorn?.(tr('label.torn', '{before} - {after} ({ratio}x)', vars));
          return;
        }

        case 'far': {
          const a = num(p.a);
          const b = num(p.b);
          const before = num(p.before);
          const after = num(p.after);
          if (a === null || b === null || before === null || after === null) return;
          stage.setCaption?.(
            tr('caption.far', 'Distant pairs are not exact either. {a} and {b}: was {before}, now {after}.', {
              a,
              b,
              before: fmt(before),
              after: fmt(after),
            }),
          );
          await stage.showFar?.(a, b, before, after);
          return;
        }

        case 'done': {
          stage.setCaption?.(
            tr('caption.done', 'You can choose where to cut. You cannot choose not to cut.'),
          );
          return;
        }

        case 'rewind': {
          stage.reset?.();
          return;
        }

        default:
          // 위에 없는 이벤트는 이 조각이 내보내지 않는다 — 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.reset?.();
    },
  };
};
