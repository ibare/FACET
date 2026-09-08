/**
 * b-tree projector — 걸음을 stage 호출과 두 HUD 로 옮긴다.
 *
 * 층수 HUD 가 조각 `heightStaysLow` 의 주장을 누적으로 잇는다 — 키를 계속
 * 넣어도 층은 좀처럼 늘지 않고, 지우다 뿌리가 비는 순간에만 줄어든다.
 */

import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { BTreeStage, StageNode } from './b-tree-stage.js';

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

type TextDisplay = { setText(text: string): void; reset?(): void };

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

/** 자리 목록을 좁힌다 (C9). 캐스팅으로 넘기면 stage 안쪽에서 터진다. */
function readNodes(v: unknown): StageNode[] | null {
  if (!Array.isArray(v)) return null;
  const out: StageNode[] = [];
  for (const item of v) {
    const o = rec(item);
    if (!o || typeof o.id !== 'string') return null;
    if (!Array.isArray(o.keys) || !o.keys.every((k) => typeof k === 'number')) return null;
    if (!Array.isArray(o.children) || !o.children.every((c) => typeof c === 'string')) return null;
    out.push({ id: o.id, keys: o.keys as number[], children: o.children as string[] });
  }
  return out;
}

export const bTreeProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BTreeStage;
  const heightHud = views.heightHud as unknown as TextDisplay | undefined;
  const sizeHud = views.sizeHud as unknown as TextDisplay | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();

  const clear = (): void => {
    heightHud?.setText('—');
    sizeHud?.setText('—');
    codePanel?.clearHighlight();
  };

  return {
    onInit() {
      clear();
      stage.caption(t('caption.start', 'Adding keys — a full seat splits before we pass it.'));
    },

    onReset() {
      clear();
      stage.caption(t('caption.start', 'Adding keys — a full seat splits before we pass it.'));
    },

    onEvent(event) {
      switch (event.type) {
        // phase 는 silent 다 — 걸음의 경계가 아니라는 뜻이지, 여기 오지 않는다는
        // 뜻이 아니다. mechanism 은 projector 갱신을 마친 뒤에야 silent 를 보고
        // 후처리를 건너뛴다. 코드 패널의 줄은 이 이벤트로만 짚힌다 (C3).
        case 'phase': {
          const p = rec(event.payload);
          const name = p && typeof p.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase(name);
          return;
        }

        case 'state-changed': {
          const p = rec(event.payload);
          if (!p || typeof p.rootId !== 'string') return;
          const list = readNodes(p.nodes);
          if (!list) return;
          stage.setTree(list, p.rootId);
          return;
        }

        case 'highlight': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string') return;
          stage.enter(p.id, t('caption.enter', 'Scanning this seat.'));
          return;
        }

        case 'compare': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string') return;
          if (typeof p.keyIndex !== 'number' || typeof p.key !== 'number') return;
          const cmp = p.cmp;
          stage.compare(
            p.id,
            p.keyIndex,
            cmp === 'gt'
              ? t('caption.cmpGt', 'Bigger than {k} — keep scanning.', { k: p.key })
              : cmp === 'lt'
                ? t('caption.cmpLt', 'Smaller than {k} — go down the gap before it.', { k: p.key })
                : t('caption.cmpEq', 'Equal to {k}.', { k: p.key }),
          );
          return;
        }

        case 'descend': {
          const p = rec(event.payload);
          if (!p || typeof p.to !== 'string' || typeof p.gapIndex !== 'number') return;
          stage.enter(p.to, t('caption.descend', 'Down through gap {i}.', { i: p.gapIndex }));
          return;
        }

        case 'mark': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string' || typeof p.keyIndex !== 'number') return;
          if (typeof p.key !== 'number') return;
          stage.settle(p.id, p.keyIndex, t('caption.here', '{k} is here.', { k: p.key }));
          return;
        }

        case 'split': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string' || typeof p.middle !== 'number') return;
          stage.restructure(
            p.id,
            t('caption.split', 'Full — {k} goes up and the rest splits in two.', { k: p.middle }),
          );
          return;
        }

        case 'borrow': {
          const p = rec(event.payload);
          if (!p || typeof p.to !== 'string' || typeof p.key !== 'number') return;
          // 형제에게서 곧장 오는 것이 아니라 부모를 거쳐 온다 — 그 사실이 요점이다.
          stage.restructure(
            p.to,
            t('caption.borrow', 'Too few — {k} comes down from the parent, and a sibling key goes up.', {
              k: p.key,
            }),
          );
          return;
        }

        case 'merge': {
          const p = rec(event.payload);
          if (!p || typeof p.left !== 'string' || typeof p.key !== 'number') return;
          stage.restructure(
            p.left,
            t('caption.merge', 'No spare next door — {k} comes down and the two become one.', {
              k: p.key,
            }),
          );
          return;
        }

        case 'shrink': {
          const p = rec(event.payload);
          const n = p && typeof p.height === 'number' ? p.height : 0;
          // B-트리에서 층이 줄어드는 유일한 길이다.
          stage.caption(t('caption.shrink', 'The root emptied — the tree is now {n} levels.', { n }));
          return;
        }

        case 'miss': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string' || typeof p.key !== 'number') return;
          stage.miss(p.id, t('caption.miss', '{k} is not here.', { k: p.key }));
          return;
        }

        case 'done': {
          codePanel?.clearHighlight();
          const p = rec(event.payload);
          if (!p) return;
          const keys = typeof p.keys === 'number' ? p.keys : 0;
          const nodes = typeof p.nodes === 'number' ? p.nodes : 0;
          const height = typeof p.height === 'number' ? p.height : 0;
          heightHud?.setText(t('hud.height', '{n} levels', { n: height }));
          sizeHud?.setText(t('hud.size', '{k} keys / {n} seats', { k: keys, n: nodes }));
          return;
        }

        default:
          // 다루지 않는 어휘는 무시한다.
          return;
      }
    },
  };
};
