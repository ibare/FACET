/**
 * skipALayerProjector — 걸음 이벤트를 stage 의 움직임으로 옮긴다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다. `event.payload` 를 그대로 전달하지
 * 않는다 (C9). 문안은 `facet.ts` 의 `messages` 에서 오고 코드에는 키와 en 원본만
 * 남는다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 내주는 메서드 계약. 없는 메서드는 부르지 않는다 (C9). */
type SkipALayerStage = {
  place?(level: number, column: number | null): void;
  leap?(level: number, column: number): Promise<void>;
  overshoot?(level: number, overColumn: number, toLevel: number): Promise<void>;
  descend?(level: number, toLevel: number): Promise<void>;
  found?(level: number, column: number): Promise<void>;
  ghostRoute?(column: number): Promise<void>;
  setCaption?(text: string): void;
  reset?(): void;
};

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const skipALayerProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as SkipALayerStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = payloadOf(event);

      switch (event.type) {
        case 'seek-begin': {
          const level = num(p.level) ?? 0;
          const target = num(p.target) ?? 0;
          stage?.place?.(level, null);
          stage?.setCaption?.(
            tr('caption.start', 'Looking for {target}. Start on the highest level.', { target }),
          );
          break;
        }

        case 'leap': {
          const level = num(p.level);
          const column = num(p.column);
          if (level === null || column === null) break;
          stage?.setCaption?.(
            tr('caption.leap', '{v} is below {target} — leap over to it.', {
              v: num(p.value) ?? 0,
              target: num(p.target) ?? 0,
            }),
          );
          await stage?.leap?.(level, column);
          break;
        }

        case 'step-down': {
          const level = num(p.level);
          const toLevel = num(p.toLevel);
          if (level === null || toLevel === null) break;
          const overColumn = num(p.overColumn);
          if (overColumn === null) {
            stage?.setCaption?.(tr('caption.laneEnd', 'Nothing more on this level — step down one.'));
            await stage?.descend?.(level, toLevel);
            break;
          }
          stage?.setCaption?.(
            tr('caption.overshoot', '{v} is past {target} — overshot, so step down one level.', {
              v: num(p.overValue) ?? 0,
              target: num(p.target) ?? 0,
            }),
          );
          await stage?.overshoot?.(level, overColumn, toLevel);
          break;
        }

        case 'found': {
          const level = num(p.level);
          const column = num(p.column);
          if (level === null || column === null) break;
          stage?.setCaption?.(
            tr('caption.found', 'Found {v} on level {level}.', { v: num(p.value) ?? 0, level }),
          );
          await stage?.found?.(level, column);
          break;
        }

        case 'done': {
          const flatColumn = num(p.flatColumn);
          stage?.setCaption?.(
            tr('caption.done', '{looks} looks. On a single-level list it would have taken {flat}.', {
              looks: num(p.looks) ?? 0,
              flat: num(p.flatLooks) ?? 0,
            }),
          );
          if (flatColumn !== null) await stage?.ghostRoute?.(flatColumn);
          break;
        }

        case 'rewind': {
          stage?.reset?.();
          break;
        }

        default:
          // 이 알고리즘은 위 여섯만 발신한다. 그 밖은 조용히 흘린다 (C2).
          break;
      }
    },

    onReset(): void {
      stage?.reset?.();
    },
  };
};
