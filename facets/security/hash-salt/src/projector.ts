/**
 * HashSalt Projector — algorithm 이벤트를 salt-stage 호출로 번역.
 *
 * 조각 facet 이라 네 걸음이 네 메서드에 1:1 로 대응한다.
 * 문안은 전부 FacetJson.messages 에서 온다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 그리는 데 필요한 형태. projector 가 경계에서 이 모양으로 좁힌다. */
type User = { name: string; salt: string; hash: string };
type StageInit = { password: string; unsaltedHash: string; users: User[] };

type SaltStage = {
  reset(): void;
  init(payload: StageInit, headers: { password: string; salt: string; stored: string }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(text: string): void;
  revealUsers(): void;
  hashUnsalted(verdictLabel: string): void;
  addSalt(): void;
  hashSalted(verdictLabel: string): void;
};


/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function user(v: unknown): User {
  const u = (v ?? {}) as { name?: unknown; salt?: unknown; hash?: unknown };
  return { name: str(u.name), salt: str(u.salt), hash: str(u.hash) };
}
function narrowInit(raw: unknown): StageInit {
  const p = (raw ?? {}) as { password?: unknown; unsaltedHash?: unknown; users?: unknown };
  return {
    password: str(p.password),
    unsaltedHash: str(p.unsaltedHash),
    users: Array.isArray(p.users) ? p.users.map(user) : [],
  };
}

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
          stage.init(narrowInit(event.payload), {
            password: tr('label.password', 'password'),
            salt: tr('label.salt', 'salt'),
            stored: tr('label.stored', 'what gets stored'),
          });
          stage.setBaseCaption(baseCaption());
          stage.setNote(note());
          break;
        }

        case 'rewind': {
          // 손으로 짚기 시작 — 화면만 처음으로 돌린다. 데이터는 그대로다.
          stage.reset();
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
