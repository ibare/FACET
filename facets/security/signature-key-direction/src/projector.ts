/**
 * SignatureKeyDirection Projector — algorithm 이벤트를 key-direction-stage 로 번역.
 *
 * 조각 facet 이라 네 걸음이 네 메서드에 1:1 로 대응한다.
 * 문안은 전부 FacetJson.messages 에서 온다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type KeyDirectionStage = {
  reset(): void;
  init(labels: Record<string, string>): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(text: string): void;
  showEncryption(): void;
  showSignature(): void;
  markKeys(): void;
  markWho(): void;
};

export const signatureKeyDirectionProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as KeyDirectionStage | undefined;

  const baseCaption = (): string =>
    tr('caption.base', 'The same key pair, used in opposite directions.');

  const note = (): string =>
    tr(
      'label.note',
      'Encryption narrows who can read; signing narrows who could have made it. The private key stands wherever the narrowing happens.',
    );

  const labels = (): Record<string, string> => ({
    encryption: tr('label.encryption', 'encrypting'),
    signature: tr('label.signature', 'signing'),
    anyone: tr('label.anyone', 'anyone'),
    ownerOnly: tr('label.ownerOnly', 'the owner'),
    publicKey: tr('label.publicKey', '🔒 public key'),
    privateKey: tr('label.privateKey', '🔑 private key'),
    sealed: tr('label.sealed', 'sealed message'),
    signed: tr('label.signed', 'signature'),
    reads: tr('label.reads', 'reads'),
    verifies: tr('label.verifies', 'verifies'),
  });

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
          stage.init(labels());
          stage.setBaseCaption(baseCaption());
          stage.setNote(note());
          break;
        }

        case 'encryption-flow': {
          stage.showEncryption();
          stage.setCaption(
            tr('caption.encryption', 'Anyone can seal it; only the owner can open it.'),
          );
          break;
        }

        case 'signature-flow': {
          stage.showSignature();
          stage.setCaption(
            tr('caption.signature', 'Only the owner can sign it; anyone can check it.'),
          );
          break;
        }

        case 'mark-keys': {
          stage.markKeys();
          stage.setCaption(
            tr('caption.crossed', 'The two keys have swapped places.'),
          );
          break;
        }

        case 'mark-who': {
          stage.markWho();
          stage.setCaption(
            tr(
              'caption.who',
              'And so has the one person — at the end when encrypting, at the start when signing.',
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
