/**
 * MerkleTree Projector — algorithm 이벤트를 merkle-stage 호출로 번역.
 *
 * 조각 facet 이라 네 걸음이 네 메서드에 1:1 로 대응한다.
 * 문안은 전부 FacetJson.messages 에서 온다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type MerkleStage = {
  reset(): void;
  init(payload: unknown): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(text: string): void;
  buildLeaves(): void;
  foldUp(): void;
  changeLeaf(): void;
  markPath(): void;
};

export const merkleTreeProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as MerkleStage | undefined;

  const baseCaption = (): string =>
    tr('caption.base', 'Hashes folded in pairs leave one value at the top.');

  const note = (): string =>
    tr(
      'label.note',
      'With a thousand files the path from a leaf to the top is about ten steps, not a thousand.',
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
          stage.init(event.payload);
          stage.setBaseCaption(baseCaption());
          stage.setNote(note());
          break;
        }

        case 'build-leaves': {
          stage.buildLeaves();
          stage.setCaption(tr('caption.leaves', 'Each file gets its own hash.'));
          break;
        }

        case 'fold-up': {
          stage.foldUp();
          stage.setCaption(
            tr('caption.folded', 'Folded in pairs, all of it comes down to one value.'),
          );
          break;
        }

        case 'change-leaf': {
          stage.changeLeaf();
          stage.setCaption(tr('caption.changed', 'One file changes.'));
          break;
        }

        case 'mark-path': {
          stage.markPath();
          stage.setCaption(
            tr(
              'caption.pathOnly',
              'Only the path up to the top changes — the other branch is untouched.',
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
