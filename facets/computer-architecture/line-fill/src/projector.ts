/**
 * line-fill projector — 걸음마다 오는 payload 를 좁혀 stage 로 넘긴다 (C9).
 *
 * `event.payload` 를 그대로 흘려보내지 않는다. 필드마다 `typeof` 로 거른 뒤
 * 정형 객체를 새로 조립해 넘기고, stage 는 필수 필드 타입으로 받는다.
 *
 * 문안은 여기서 `runtime.t` 로 해석한다 — 코드에는 키와 en 원본만 남고 문안은
 * `facet.ts` 의 선언에 있다 (C10).
 *
 * `initialData` 는 stage 의 `mount` 가 받으므로 `onInit` 을 두지 않는다 (S-piece).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type LineFillStage = {
  ask?(p: { index: number; addr: number; line: number }): Promise<void> | void;
  rise?(p: { line: number; first: number; count: number; asked: number }): Promise<void> | void;
  setCaption?(text: string): void;
  reset?(): void;
};

/** 단언 뒤에 필드마다 검사가 뒤따르는 좁히개다 (C9). */
function fields(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export const lineFillProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as LineFillStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = fields(event.payload);

      switch (event.type) {
        case 'ask': {
          if (p === null) return;
          const index = num(p.index);
          const addr = num(p.addr);
          const line = num(p.line);
          if (index === null || addr === null || line === null) return;
          stage?.setCaption?.(
            tr('caption.ask', 'You name one cell: a[{i}], at byte {addr}.', { i: index, addr }),
          );
          await stage?.ask?.({ index, addr, line });
          return;
        }

        case 'line-rise': {
          if (p === null) return;
          const line = num(p.line);
          const first = num(p.first);
          const count = num(p.count);
          const asked = num(p.asked);
          const lo = num(p.lo);
          const hi = num(p.hi);
          if (line === null || first === null || count === null || asked === null) return;
          if (lo === null || hi === null) return;
          stage?.setCaption?.(
            tr('caption.rise', 'The whole line comes — bytes {lo}–{hi}. Three neighbours tag along.', { lo, hi }),
          );
          await stage?.rise?.({ line, first, count, asked });
          return;
        }

        case 'tally': {
          if (p === null) return;
          const asked = num(p.asked);
          const arrived = num(p.arrived);
          if (asked === null || arrived === null) return;
          stage?.setCaption?.(
            tr('caption.tally', 'Cells named: {asked}. Cells arrived: {arrived}.', { asked, arrived }),
          );
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        default:
          // 이 알고리즘은 위 넷만 발신한다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
    },
  };
};
