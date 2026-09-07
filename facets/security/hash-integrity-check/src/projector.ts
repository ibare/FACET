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

type Labels = {
  origin: string;
  target: string;
  filePath: string;
  hashPath: string;
  file: string;
  hash: string;
};

type IntegrityStage = {
  reset(): void;
  init(payload: StageInit, labels: Labels): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(text: string): void;
  splitPaths(): void;
  deliver(mark: string): void;
  tamper(markLabel: string): void;
  detect(mark: string): void;
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
    tr('caption.base', 'The file and its hash travel by different routes.');

  const note = (): string =>
    tr(
      'label.note',
      'If both came down the same route, whoever changed the file could have changed the hash too.',
    );

  const labels = (): Labels => ({
    origin: tr('label.origin', 'origin'),
    target: tr('label.target', 'you'),
    filePath: tr('label.filePath', 'any route'),
    hashPath: tr('label.hashPath', 'a route you trust'),
    file: tr('label.file', 'file'),
    hash: tr('label.hash', 'hash'),
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
          stage.init(narrowInit(event.payload), labels());
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

        case 'split-paths': {
          stage.splitPaths();
          stage.setCaption(
            tr('caption.split', 'Two routes leave the origin — the file, and its hash.'),
          );
          break;
        }

        case 'deliver': {
          stage.deliver(tr('label.match', '✓'));
          stage.setCaption(tr('caption.match', 'Both arrive and the two agree.'));
          break;
        }

        case 'tamper': {
          stage.tamper(tr('label.scissors', '✂'));
          stage.setCaption(
            tr('caption.tampered', 'Someone edits the file on the way — one digit.'),
          );
          break;
        }

        case 'detect': {
          stage.detect(tr('label.mismatch', '✗'));
          stage.setCaption(
            tr(
              'caption.detected',
              'They never touched the lower route, so the hash still tells on them.',
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
