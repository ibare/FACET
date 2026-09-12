/**
 * 각도로 재는 닮음 — 이벤트를 그림의 메서드로 옮긴다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다 (C9). `event.payload` 를 그대로
 * 흘려보내지 않는다 — stage 는 필수 필드 타입으로 받는다.
 *
 * 화면 문안은 `facet.ts` 의 `messages` 에 있고 여기에는 키와 en 원본만 남는다 (C10).
 * 도형에 새겨지는 값(`26.6°` · `cos = 0.89` · `|A| = 1.41` · 순위 번호)은 문안이
 * 아니라 수식 표기와 데이터라 stage 가 직접 적는다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type AngleStage = {
  setCaption(value: string): void;
  place(): Promise<void>;
  showLengths(items: Array<{ id: string; len: number }>): Promise<void>;
  sweep(id: string, deg: number, cos: number): Promise<void>;
  rankByAngle(order: string[]): Promise<void>;
  showChords(items: Array<{ id: string; dist: number }>): Promise<void>;
  rankByDistance(order: string[]): Promise<void>;
  highlightFlip(id: string): Promise<void>;
  reset(): void;
};

function fields(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) if (typeof v === 'string') out.push(v);
  return out;
}

function numbersOf(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const v of value) if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  return out;
}

/** 나란한 두 배열을 자리 맞춰 묶는다. 길이가 어긋나면 짧은 쪽까지만. */
function zip<T>(ids: string[], values: number[], make: (id: string, value: number) => T): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.min(ids.length, values.length); i += 1) {
    out.push(make(ids[i], values[i]));
  }
  return out;
}

export const angleNotLengthProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as AngleStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = fields(event.payload);

      switch (event.type) {
        case 'place': {
          stage?.setCaption(tr('caption.place', 'Query q and three candidates from the origin.'));
          await stage?.place();
          return;
        }

        case 'length-shown': {
          const items = zip(stringsOf(p.ids), numbersOf(p.lengths), (id, len) => ({ id, len }));
          stage?.setCaption(tr('caption.lengths', 'Their lengths are far apart.'));
          await stage?.showLengths(items);
          return;
        }

        case 'sweep': {
          const id = typeof p.id === 'string' ? p.id : '';
          const deg = typeof p.deg === 'number' ? p.deg : 0;
          const cos = typeof p.cos === 'number' ? p.cos : 0;
          if (id === '') return;
          stage?.setCaption(
            tr('caption.sweep', 'q to {id} — the angle opens to {deg}°.', {
              id,
              deg: deg.toFixed(1),
            }),
          );
          await stage?.sweep(id, deg, cos);
          return;
        }

        case 'angle-ranked': {
          const order = stringsOf(p.order);
          if (order.length === 0) return;
          stage?.setCaption(
            tr('caption.angleRank', 'By angle: {order}. Narrower means more alike.', {
              order: order.join(' > '),
            }),
          );
          await stage?.rankByAngle(order);
          return;
        }

        case 'chord-shown': {
          const items = zip(stringsOf(p.ids), numbersOf(p.dists), (id, dist) => ({ id, dist }));
          stage?.setCaption(tr('caption.chords', 'Now the straight-line gap between the tips.'));
          await stage?.showChords(items);
          return;
        }

        case 'dist-ranked': {
          const order = stringsOf(p.order);
          if (order.length === 0) return;
          stage?.setCaption(
            tr('caption.distRank', 'By distance: {order}.', { order: order.join(' > ') }),
          );
          await stage?.rankByDistance(order);
          return;
        }

        case 'done': {
          // 뒤집힘이 없는 좌표라면 id 가 빈 문자열이다. 그때는 앞 캡션을 그대로
          // 두고 아무 말도 보태지 않는다 — 화면이 없는 말을 하지 않게.
          const id = typeof p.id === 'string' ? p.id : '';
          if (id === '') return;
          stage?.setCaption(tr('caption.flip', '{id}: first by angle, last by distance.', { id }));
          await stage?.highlightFlip(id);
          return;
        }

        case 'rewind': {
          stage?.reset();
          return;
        }

        default:
          // 이 조각이 내보내는 것은 위가 전부다. 그 밖의 type 은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.reset();
    },
  };
};
