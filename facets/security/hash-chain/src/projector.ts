/**
 * HashChain Projector — algorithm 이벤트를 chain-stage 호출로 번역.
 *
 * 조각 facet 이라 네 걸음이 네 메서드에 1:1 로 대응한다.
 * 문안은 전부 FacetJson.messages 에서 온다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 그리는 데 필요한 형태. projector 가 경계에서 이 모양으로 좁힌다. */
type Block = { data: string; prev: string; hash: string };
type StageInit = {
  blocks: Block[];
  tamper: { index: number; data: string; blocks: Block[] };
};

type ChainStage = {
  reset(): void;
  init(payload: StageInit, labels: { prev: string; hash: string }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(text: string): void;
  revealChain(): void;
  tamper(): void;
  breakLink(): void;
  cascade(): void;
};


/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function block(v: unknown): Block {
  const b = (v ?? {}) as { data?: unknown; prev?: unknown; hash?: unknown };
  return { data: str(b.data), prev: str(b.prev), hash: str(b.hash) };
}
function blocks(v: unknown): Block[] {
  return Array.isArray(v) ? v.map(block) : [];
}
function narrowInit(raw: unknown): StageInit {
  const p = (raw ?? {}) as { blocks?: unknown; tamper?: unknown };
  const t = (p.tamper ?? {}) as { index?: unknown; data?: unknown; blocks?: unknown };
  return {
    blocks: blocks(p.blocks),
    tamper: { index: num(t.index), data: str(t.data), blocks: blocks(t.blocks) },
  };
}

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
          stage.init(narrowInit(event.payload), {
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
