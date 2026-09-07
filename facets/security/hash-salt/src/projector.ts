/**
 * HashSalt Projector — algorithm 이벤트를 salt-stage 호출로 번역.
 *
 * 조각 facet 이라 네 걸음이 네 메서드에 1:1 로 대응한다.
 * 문안은 전부 FacetJson.messages 에서 온다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type SaltStage = {
  reset(): void;
  init(payload: unknown, headers: { password: string; salt: string; stored: string }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(text: string): void;
  revealUsers(): void;
  hashUnsalted(verdictLabel: string): void;
  addSalt(): void;
  hashSalted(verdictLabel: string): void;
};

export const hashSaltProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as SaltStage | undefined;

  const baseCaption = (): string =>
    tr(
      'caption.base',
      'Two people picked the same password, but what gets stored is not the same.',
    );

  const note = (): string =>
    tr(
      'label.note',
      'The salt is stored in the clear next to the hash — it is not a secret, only a way to make every stored value unique.',
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
            password: tr('label.password', 'password'),
            salt: tr('label.salt', 'salt'),
            stored: tr('label.stored', 'what gets stored'),
          });
          stage.setBaseCaption(baseCaption());
          stage.setNote(note());
          break;
        }

        case 'reveal-users': {
          stage.revealUsers();
          stage.setCaption(tr('caption.samePassword', 'Both chose the same password.'));
          break;
        }

        case 'hash-unsalted': {
          stage.hashUnsalted(tr('label.identical', 'identical'));
          stage.setCaption(
            tr(
              'caption.unsalted',
              'Hashed as they are, both rows store the same value — cracking one cracks the other.',
            ),
          );
          break;
        }

        case 'add-salt': {
          stage.addSalt();
          stage.setCaption(
            tr('caption.salting', 'Each account gets its own salt, put in front of the password.'),
          );
          break;
        }

        case 'hash-salted': {
          stage.hashSalted(tr('label.different', 'different'));
          stage.setCaption(
            tr(
              'caption.salted',
              'The same password now stores two unrelated values.',
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
      stage.setNote(note());
    },
  };
};
