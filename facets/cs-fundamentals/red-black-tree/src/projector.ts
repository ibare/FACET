/**
 * red-black-tree projector — 걸음을 stage 호출과 두 HUD 로 옮긴다.
 *
 * 흑색 높이 HUD 가 조각 `blackHeightEqual` 의 주장을 누적으로 잇는다. 조각은
 * 한 순간에 같다는 것을 보이고, 여기서는 넣고 빼기를 되풀이해도 **계속** 같다는
 * 것이 수로 남는다. 길마다 다르면 algorithm 이 `ok: false` 를 보내므로 그때는
 * 깨졌다고 말한다 — 화면이 거짓을 말하지 않게 하는 장치다.
 */

import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { RedBlackTreeStage, StageNode } from './red-black-tree-stage.js';

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
    if (!o || typeof o.id !== 'string' || typeof o.key !== 'number') return null;
    if (o.color !== 'red' && o.color !== 'black') return null;
    if (o.left !== null && typeof o.left !== 'string') return null;
    if (o.right !== null && typeof o.right !== 'string') return null;
    out.push({ id: o.id, key: o.key, color: o.color, left: o.left, right: o.right });
  }
  return out;
}

function readChanges(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    const o = rec(item);
    if (!o || typeof o.id !== 'string') return null;
    out.push(o.id);
  }
  return out;
}

export const redBlackTreeProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RedBlackTreeStage;
  const blackHud = views.blackHud as unknown as TextDisplay | undefined;
  const shapeHud = views.shapeHud as unknown as TextDisplay | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();

  /** 위반 종류마다 무엇을 할지 말한다 — 이 말이 곧 이 자료구조의 규칙이다. */
  const violationText = (kind: string): string => {
    switch (kind) {
      case 'uncle-red':
        return t('caption.uncleRed', 'The uncle is red too — recolor, and the problem moves up.');
      case 'triangle':
        return t('caption.triangle', 'Bent inward — turn once to straighten it first.');
      case 'line':
        return t('caption.line', 'Straight now — recolor and turn, and it ends here.');
      case 'sibling-red':
        return t('caption.siblingRed', 'The sibling is red — turn to make it black first.');
      case 'both-black':
        return t('caption.bothBlack', "Both of the sibling's children are black — recolor, and the problem moves up.");
      case 'nearRed':
      case 'near-red':
        return t('caption.nearRed', 'Only the near child is red — turn the sibling so the far one is.');
      default:
        return t('caption.farRed', 'The far child is red — turn and recolor, and it ends here.');
    }
  };

  const clear = (): void => {
    blackHud?.setText('—');
    shapeHud?.setText('—');
    codePanel?.clearHighlight();
  };

  return {
    onInit() {
      clear();
      stage.caption(t('caption.start', 'Adding keys — each arrives red, then the tree fixes itself.'));
    },

    onReset() {
      clear();
      stage.caption(t('caption.start', 'Adding keys — each arrives red, then the tree fixes itself.'));
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
          if (!p) return;
          const list = readNodes(p.nodes);
          if (!list) return;
          stage.setTree(list, typeof p.rootId === 'string' ? p.rootId : null);
          return;
        }

        case 'compare': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string' || typeof p.key !== 'number') return;
          const cmp = p.cmp;
          stage.compare(
            p.id,
            cmp === 'lt'
              ? t('caption.goLeft', 'Smaller than {k} — go left.', { k: p.key })
              : cmp === 'gt'
                ? t('caption.goRight', 'Bigger than {k} — go right.', { k: p.key })
                : t('caption.same', '{k} is already here.', { k: p.key }),
          );
          return;
        }

        case 'append': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string' || typeof p.key !== 'number') return;
          // 빨강으로 들어오는 것이 규칙이다 — 검정으로 넣으면 그 길만 검은 수가
          // 늘어 곧바로 깨진다.
          stage.settle(p.id, t('caption.placed', '{k} arrives red — black would break the counts.', { k: p.key }));
          return;
        }

        case 'violation': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string' || typeof p.kind !== 'string') return;
          stage.violation(p.id, violationText(p.kind));
          return;
        }

        case 'recolor': {
          const p = rec(event.payload);
          if (!p) return;
          const ids = readChanges(p.changes);
          if (!ids) return;
          stage.recolored(ids, t('caption.recolor', '{n} seats change color.', { n: ids.length }));
          return;
        }

        case 'rotate': {
          const p = rec(event.payload);
          if (!p || typeof p.pivot !== 'string' || typeof p.newRoot !== 'string') return;
          stage.rotated(
            p.pivot,
            p.newRoot,
            t('caption.rotate', 'The pivot goes down, the child comes up.'),
          );
          return;
        }

        case 'bubble': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string') return;
          // 색칠은 문제를 없애지 않는다. 이 말이 이 완제품의 논증이다.
          stage.bubbled(p.id, t('caption.bubble', 'Not fixed — just moved up here. Check again.'));
          return;
        }

        case 'mark': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string' || typeof p.key !== 'number') return;
          stage.settle(p.id, t('caption.found', '{k} is here.', { k: p.key }));
          return;
        }

        case 'miss': {
          const p = rec(event.payload);
          const k = p && typeof p.key === 'number' ? p.key : 0;
          stage.caption(t('caption.miss', '{k} is not in the tree.', { k }));
          return;
        }

        case 'done': {
          codePanel?.clearHighlight();
          const p = rec(event.payload);
          if (!p) return;
          const keys = typeof p.keys === 'number' ? p.keys : 0;
          const h = typeof p.height === 'number' ? p.height : 0;
          const bh = typeof p.blackHeight === 'number' ? p.blackHeight : 0;
          const ok = p.ok === true;
          blackHud?.setText(
            ok
              ? t('hud.black', '{n} on every path', { n: bh })
              : t('hud.broken', 'paths disagree'),
          );
          shapeHud?.setText(t('hud.shape', '{h} tall · {k} keys', { h, k: keys }));
          return;
        }

        default:
          // 다루지 않는 어휘는 무시한다.
          return;
      }
    },
  };
};
