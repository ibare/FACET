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

type PigeonholeStage = {
  reset(): void;
  init(payload: unknown): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(scaleLine: string, arrangementLine: string): void;
  revealSlots(arrowLabel: string): void;
  fillSlots(): void;
  revealOverflow(): void;
  placeOverflow(): void;
};

type InitPayload = {
  slotCount?: number;
  fillers?: { input: string; slot: number }[];
  overflow?: { input: string; slot: number };
};

export const pigeonholeCollisionProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as PigeonholeStage | undefined;

  /** 상시 캡션. init 과 reset 두 곳에서 쓰이므로 en 원본은 여기 한 번만 둔다. */
  const baseCaption = (): string =>
    tr(
      'caption.base',
      'There are only so many places an output can land, so two inputs must eventually share one.',
    );

  /** 축척을 밝히는 각주. 줄여 보이는 것이지 실제 크기가 아니다. */
  const noteScale = (): string =>
    tr(
      'label.noteScale',
      'Shown with 16 places. SHA-256 has 2^256 — a larger number, the same counting.',
    );

  /**
   * 이 배치가 최선의 경우임을 밝히는 각주.
   *
   * 자리마다 정확히 하나씩 앉는 일은 실제로는 백만 번에 한 번쯤 일어난다.
   * 감추면 화면이 "해시는 고르게 퍼진다" 는 거짓을 말하게 되고, 밝히면 논증이
   * 오히려 강해진다 — 가장 잘 나눠 담아도 실패한다는 뜻이 되므로.
   */
  const noteArrangement = (): string =>
    tr(
      'label.noteArrangement',
      'This is the luckiest arrangement — one per place. In practice a collision shows up around the sixth input.',
    );

  let slotCount = 0;
  let occupantInput = '';
  let overflowInput = '';

  return {
    onInit() {
      if (!stage) return;
      stage.setBaseCaption(baseCaption());
      stage.setNote(noteScale(), noteArrangement());
    },

    async onEvent(event) {
      if (!stage) return;

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as InitPayload;
          slotCount = p.slotCount ?? 0;
          overflowInput = p.overflow?.input ?? '';
          const taken = p.fillers?.find((f) => f.slot === p.overflow?.slot);
          occupantInput = taken?.input ?? '';
          stage.init(event.payload);
          stage.setBaseCaption(baseCaption());
          stage.setNote(noteScale(), noteArrangement());
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
      stage.setBaseCaption(baseCaption());
      stage.setNote(noteScale(), noteArrangement());
    },
  };
};
