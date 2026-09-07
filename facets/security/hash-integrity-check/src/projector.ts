/**
 * HashIntegrityCheck Projector — algorithm 이벤트를 integrity-stage 호출로 번역.
 *
 * 조각 facet 이라 네 걸음이 네 메서드에 1:1 로 대응한다.
 * 문안은 전부 FacetJson.messages 에서 온다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 그리는 데 필요한 형태. projector 가 경계에서 이 모양으로 좁힌다. */
type Item = { content: string; hash: string };
type StageInit = {
  referenceHash: string;
  intact: Item;
  tampered: Item;
  diffIndex: number;
};

type IntegrityStage = {
  reset(): void;
  init(payload: StageInit, labels: { intact: string; tampered: string }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(text: string): void;
  revealReference(label: string): void;
  checkIntact(mark: string): void;
  checkTampered(mark: string): void;
  markDifference(): void;
};


/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function item(v: unknown): Item {
  const i = (v ?? {}) as { content?: unknown; hash?: unknown };
  return { content: str(i.content), hash: str(i.hash) };
}
function narrowInit(raw: unknown): StageInit {
  const p = (raw ?? {}) as {
    referenceHash?: unknown;
    intact?: unknown;
    tampered?: unknown;
    diffIndex?: unknown;
  };
  return {
    referenceHash: str(p.referenceHash),
    intact: item(p.intact),
    tampered: item(p.tampered),
    diffIndex: num(p.diffIndex),
  };
}

export const hashIntegrityCheckProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as IntegrityStage | undefined;

  const baseCaption = (): string =>
    tr(
      'caption.base',
      'The original publishes its hash, so anyone can check what they received against it.',
    );

  const note = (): string =>
    tr(
      'label.note',
      'The file can come from anywhere as long as the hash came from somewhere trusted.',
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
            intact: tr('label.intact', 'received (untouched)'),
            tampered: tr('label.tampered', 'received (altered)'),
          });
          stage.setBaseCaption(baseCaption());
          stage.setNote(note());
          break;
        }

        case 'reveal-reference': {
          stage.revealReference(tr('label.published', 'published hash'));
          break;
        }

        case 'check-intact': {
          stage.checkIntact(tr('label.match', '✓'));
          stage.setCaption(tr('caption.match', 'Identical to the published hash.'));
          break;
        }

        case 'check-tampered': {
          stage.checkTampered(tr('label.mismatch', '✗'));
          stage.setCaption(
            tr('caption.mismatch', 'Nothing like it — this one was changed on the way.'),
          );
          break;
        }

        case 'mark-difference': {
          stage.markDifference();
          stage.setCaption(
            tr('caption.oneChar', 'One character was enough to break the match.'),
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
