/**
 * PigeonholeCollision Projector — algorithm 이벤트를 pigeonhole-stage 호출로 번역.
 *
 * 조각 facet 이라 번역이 단순하다. 네 걸음이 네 메서드에 1:1 로 대응하고
 * 분기도 상태도 거의 없다.
 *
 * 문안은 전부 FacetJson.messages 에서 온다 (C10). 코드에는 키와 en 원본만 있다.
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 그리는 데 필요한 형태. projector 가 경계에서 이 모양으로 좁힌다. */
type Entry = { input: string; slot: number };
type StageInit = { slotCount: number; fillers: Entry[]; overflow: Entry };

type PigeonholeStage = {
  reset(): void;
  init(payload: StageInit): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(scaleLine: string, arrangementLine: string): void;
  revealSlots(arrowLabel: string): void;
  fillSlots(): void;
  revealOverflow(): void;
  placeOverflow(): void;
};

type InitPayload = { slotCount?: unknown; fillers?: unknown; overflow?: unknown };

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function entry(v: unknown): Entry {
  const e = (v ?? {}) as { input?: unknown; slot?: unknown };
  return { input: str(e.input), slot: num(e.slot) };
}
function narrowInit(p: InitPayload): StageInit {
  return {
    slotCount: num(p.slotCount),
    fillers: Array.isArray(p.fillers) ? p.fillers.map(entry) : [],
    overflow: entry(p.overflow),
  };
}

export const pigeonholeCollisionProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as PigeonholeStage | undefined;

  let slotCount = 0;
  let occupantInput = '';
  let overflowInput = '';

  return {
    onInit() {
      if (!stage) return;
    },

    async onEvent(event) {
      if (!stage) return;

      switch (event.type) {
        case 'init': {
          const init = narrowInit((event.payload ?? {}) as InitPayload);
          slotCount = init.slotCount;
          overflowInput = init.overflow.input;
          occupantInput =
            init.fillers.find((f) => f.slot === init.overflow.slot)?.input ?? '';
          stage.init(init);
          break;
        }

        case 'rewind': {
          // 손으로 짚기 시작 — 화면만 처음으로 돌린다. 데이터는 그대로다.
          stage.reset();
          break;
        }

        case 'reveal-slots': {
          stage.revealSlots(
            tr('label.places', '{count} places', { count: String(slotCount) }),
          );
          break;
        }

        case 'fill-slots': {
          stage.fillSlots();
          stage.setCaption(
            tr(
              'caption.filled',
              'Spread as evenly as possible — one per place — all {count} are taken.',
              { count: String(slotCount) },
            ),
          );
          break;
        }

        case 'reveal-overflow': {
          stage.revealOverflow();
          stage.setCaption(
            tr('caption.oneMore', 'One more input arrives — input {n} for {count} places.', {
              n: String(slotCount + 1),
              count: String(slotCount),
            }),
          );
          break;
        }

        case 'place-overflow': {
          stage.placeOverflow();
          stage.setCaption(
            tr(
              'caption.collide',
              'It has nowhere of its own — {overflow} sits where {occupant} already is.',
              { overflow: overflowInput, occupant: occupantInput },
            ),
          );
          break;
        }

        default:
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
    },
  };
};
