/**
 * HashChain Projector — algorithm 이벤트를 chain-stage 호출로 번역.
 *
 * 조각 facet 이라 네 걸음이 네 메서드에 1:1 로 대응한다.
 * 문안은 전부 FacetJson.messages 에서 온다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type ChainStage = {
  reset(): void;
  init(payload: unknown, labels: { prev: string; hash: string }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(text: string): void;
  revealChain(): void;
  tamper(): void;
  breakLink(): void;
  cascade(): void;
};

export const hashChainProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as ChainStage | undefined;

  const baseCaption = (): string =>
    tr('caption.base', 'Each entry carries the hash of the one before it.');

  const note = (): string =>
    tr(
      'label.note',
      'Rewriting one entry means rewriting every entry after it — and anyone holding the last hash would still notice.',
    );

  return {
    onInit() {
      if (!stage) return;
      stage.setBaseCaption(baseCaption());
      stage.setNote(note());
    },

    async onEvent(event) {
      if (!stage) return;

      switch (event.type) {
        case 'init': {
          stage.init(event.payload, {
            prev: tr('label.prev', 'prev'),
            hash: tr('label.hash', 'hash'),
          });
          stage.setBaseCaption(baseCaption());
          stage.setNote(note());
          break;
        }

        case 'reveal-chain': {
          stage.revealChain();
          stage.setCaption(
            tr('caption.linked', 'Every entry holds the hash of the one before it.'),
          );
          break;
        }

        case 'tamper': {
          stage.tamper();
          stage.setCaption(tr('caption.tampered', 'Someone edits an old entry.'));
          break;
        }

        case 'break-link': {
          stage.breakLink();
          stage.setCaption(
            tr(
              'caption.broken',
              'Its hash changes, and the next entry is holding the old one.',
            ),
          );
          break;
        }

        case 'cascade': {
          stage.cascade();
          stage.setCaption(
            tr('caption.cascaded', 'The mismatch runs all the way to the end.'),
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
      stage.setNote(note());
    },
  };
};
