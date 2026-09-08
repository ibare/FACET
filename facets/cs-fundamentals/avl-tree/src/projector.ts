/**
 * avl-tree projector — 걸음을 stage 호출과 두 HUD 로 옮긴다.
 *
 * 회전 HUD 가 이 완제품의 논증을 진다 — 마지막에 어느 경우(LL·LR·RL·RR)가
 * 일어났는지를 남긴다. 지나가는 캡션에만 실으면 사라져서, 이중 회전을 만났다는
 * 사실이 화면에 남지 않는다.
 */

import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { AvlTreeStage, StageNode } from './avl-tree-stage.js';

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
    if (typeof o.height !== 'number') return null;
    if (o.left !== null && typeof o.left !== 'string') return null;
    if (o.right !== null && typeof o.right !== 'string') return null;
    out.push({ id: o.id, key: o.key, left: o.left, right: o.right, height: o.height });
  }
  return out;
}

export const avlTreeProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as AvlTreeStage;
  const heightHud = views.heightHud as unknown as TextDisplay | undefined;
  const rotationHud = views.rotationHud as unknown as TextDisplay | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();

  const clear = (): void => {
    heightHud?.setText('—');
    rotationHud?.setText('—');
  };

  return {
    onInit() {
      clear();
      stage.caption(t('caption.start', 'Adding keys — measured on the way back up.'));
    },

    onReset() {
      clear();
      stage.caption(t('caption.start', 'Adding keys — measured on the way back up.'));
    },

    onEvent(event) {
      switch (event.type) {
        case 'state-changed': {
          const p = rec(event.payload);
          if (!p) return;
          const list = readNodes(p.nodes);
          if (!list) return;
          const rootId = typeof p.rootId === 'string' ? p.rootId : null;
          stage.setTree(list, rootId);
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
          stage.settle(p.id, t('caption.placed', '{k} sits here — now measure on the way up.', { k: p.key }));
          return;
        }

        case 'measure': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string') return;
          if (typeof p.height !== 'number' || typeof p.balance !== 'number') return;
          const ok = p.ok === true;
          stage.measure(
            p.id,
            p.height,
            p.balance,
            ok,
            ok
              ? t('caption.ok', 'Off by {n} — still in range.', { n: p.balance })
              : t('caption.off', 'Off by {n} — out of range.', { n: p.balance }),
          );
          return;
        }

        case 'imbalance': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string' || typeof p.kind !== 'string') return;
          const single = p.kind === 'LL' || p.kind === 'RR';
          rotationHud?.setText(p.kind);
          stage.imbalance(
            p.id,
            single
              ? t('caption.caseSingle', '{kind} — leaning the same way twice, so one turn fixes it.', { kind: p.kind })
              : t('caption.caseDouble', '{kind} — the lean bends, so turn the inner one first.', { kind: p.kind }),
          );
          return;
        }

        case 'rotate': {
          const p = rec(event.payload);
          if (!p || typeof p.pivot !== 'string' || typeof p.newRoot !== 'string') return;
          const inner = p.inner === true;
          stage.rotate(
            p.pivot,
            p.newRoot,
            inner
              ? t('caption.rotateInner', 'First the inner turn — now both lean the same way.')
              : t('caption.rotateOuter', 'Now the outer turn — the pivot goes down, the child comes up.'),
          );
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
          stage.miss(t('caption.miss', '{k} is not in the tree.', { k }));
          return;
        }

        case 'done': {
          const p = rec(event.payload);
          if (!p) return;
          const keys = typeof p.keys === 'number' ? p.keys : 0;
          const height = typeof p.height === 'number' ? p.height : 0;
          const ideal = typeof p.ideal === 'number' ? p.ideal : 0;
          // 이 나무가 얼마나 낮은지를 이론 최소와 나란히 둔다 — AVL 이 지키는
          // 것이 "가장 낮다" 가 아니라 "그것에서 멀지 않다" 임이 여기서 보인다.
          heightHud?.setText(
            t('hud.height', '{h} of {i} ({k} keys)', { h: height, i: ideal, k: keys }),
          );
          return;
        }

        default:
          // phase 는 silent 라 여기 오지 않는다. 그 밖의 어휘는 무시한다.
          return;
      }
    },
  };
};
