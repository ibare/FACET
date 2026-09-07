/**
 * MerkleTree Projector — algorithm 이벤트를 merkle-stage 호출로 번역.
 *
 * 조각 facet 이라 네 걸음이 네 메서드에 1:1 로 대응한다.
 * 문안은 전부 FacetJson.messages 에서 온다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 그리는 데 필요한 형태. projector 가 경계에서 이 모양으로 좁힌다. */
type Leaf = { label: string; hash: string };
type Snapshot = { leaves: Leaf[]; left: string; right: string; root: string };
type StageInit = { before: Snapshot; after: Snapshot; changedLeaf: number };

type MerkleStage = {
  reset(): void;
  init(payload: StageInit): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(text: string): void;
  buildLeaves(): void;
  combineUp(): void;
  changeLeaf(): void;
  markPath(): void;
};


/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function leaf(v: unknown): Leaf {
  const l = (v ?? {}) as { label?: unknown; hash?: unknown };
  return { label: str(l.label), hash: str(l.hash) };
}
function snapshot(v: unknown): Snapshot {
  const s = (v ?? {}) as { leaves?: unknown; left?: unknown; right?: unknown; root?: unknown };
  return {
    leaves: Array.isArray(s.leaves) ? s.leaves.map(leaf) : [],
    left: str(s.left),
    right: str(s.right),
    root: str(s.root),
  };
}
function narrowInit(raw: unknown): StageInit {
  const p = (raw ?? {}) as { before?: unknown; after?: unknown; changedLeaf?: unknown };
  return {
    before: snapshot(p.before),
    after: snapshot(p.after),
    changedLeaf: num(p.changedLeaf),
  };
}

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
          stage.init(narrowInit(event.payload));
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

        case 'build-leaves': {
          stage.buildLeaves();
          stage.setCaption(tr('caption.leaves', 'Each file gets its own hash.'));
          break;
        }

        case 'combine-up': {
          stage.combineUp();
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
