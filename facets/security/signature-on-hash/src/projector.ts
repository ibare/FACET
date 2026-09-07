/**
 * SignatureOnHash Projector — algorithm 이벤트를 sign-hash-stage 로 번역.
 *
 * 조각 facet 이라 네 걸음이 네 메서드에 1:1 로 대응한다.
 * 문안은 전부 FacetJson.messages 에서 온다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type SignHashStage = {
  reset(): void;
  init(
    payload: unknown,
    labels: {
      document: string;
      digest: string;
      signature: string;
      bytes: (n: number) => string;
    },
  ): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(text: string): void;
  showDocument(): void;
  hashIt(): void;
  signIt(): void;
  compare(): void;
};

/** 바이트 수를 사람이 읽는 단위로. 화면 폭이 좁아 소수점은 한 자리까지만. */
function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export const signatureOnHashProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as SignHashStage | undefined;

  const baseCaption = (): string =>
    tr('caption.base', 'The signature is made on the digest, not on the document.');

  const note = (): string =>
    tr(
      'label.note',
      'Drawn to scale except the two small bars, which would be invisible. RSA cannot sign anything larger than its key at all.',
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
            document: tr('label.document', 'document'),
            digest: tr('label.digest', 'digest'),
            signature: tr('label.signature', 'signature'),
            bytes: formatBytes,
          });
          stage.setBaseCaption(baseCaption());
          stage.setNote(note());
          break;
        }

        case 'show-document': {
          stage.showDocument();
          stage.setCaption(
            tr('caption.document', 'The document can be any size at all.'),
          );
          break;
        }

        case 'hash-it': {
          stage.hashIt();
          stage.setCaption(tr('caption.hashed', 'Hashing folds it into 32 bytes.'));
          break;
        }

        case 'sign-it': {
          stage.signIt();
          stage.setCaption(tr('caption.signed', 'The private key signs those 32 bytes.'));
          break;
        }

        case 'compare': {
          stage.compare();
          stage.setCaption(
            tr(
              'caption.compare',
              'The signature stays this size no matter how large the document grows.',
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
