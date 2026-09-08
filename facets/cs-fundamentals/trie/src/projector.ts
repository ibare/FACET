/**
 * trie projector — 걸음을 stage 호출과 결과 HUD 로 옮긴다.
 *
 * 자동완성 결과는 낱말 목록이라 캡션에 담기지 않는다. `text-display` 하나를
 * 따로 두고 거기에 적는다 — 그것이 이 완제품이 조각 둘 위에 더하는 것이라,
 * 지나가는 캡션에 실어 보내면 사라진다.
 */

import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { StageNode, TrieStage } from './trie-stage.js';

type TextDisplay = { setText(text: string): void; reset?(): void };

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function strArray(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((s) => typeof s === 'string') ? (v as string[]) : null;
}

/** 자리 목록을 좁힌다 (C9). 캐스팅으로 넘기면 stage 안쪽에서 터진다. */
function readNodes(v: unknown): StageNode[] | null {
  if (!Array.isArray(v)) return null;
  const out: StageNode[] = [];
  for (const item of v) {
    const o = rec(item);
    if (!o) return null;
    if (typeof o.id !== 'string' || typeof o.ch !== 'string') return null;
    if (typeof o.end !== 'boolean') return null;
    if (o.parent !== null && typeof o.parent !== 'string') return null;
    out.push({ id: o.id, parent: o.parent, ch: o.ch, end: o.end });
  }
  return out;
}

export const trieProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as TrieStage;
  const resultHud = views.resultHud as unknown as TextDisplay | undefined;
  const sizeHud = views.sizeHud as unknown as TextDisplay | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();

  const clear = (): void => {
    resultHud?.setText('—');
    sizeHud?.setText('—');
  };

  return {
    onInit() {
      clear();
      stage.caption(t('caption.start', 'Adding words — matching letters reuse the same path.'));
    },

    onReset() {
      clear();
      stage.caption(t('caption.start', 'Adding words — matching letters reuse the same path.'));
    },

    onEvent(event) {
      switch (event.type) {
        case 'state-changed': {
          const p = rec(event.payload);
          if (!p) return;
          const list = readNodes(p.nodes);
          if (!list) return;
          stage.setNodes(list);
          return;
        }

        case 'ride': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string' || typeof p.ch !== 'string') return;
          stage.ride(p.id, t('caption.ride', "'{ch}' is already on the path — ride it.", { ch: p.ch }));
          return;
        }

        case 'grow': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string' || typeof p.ch !== 'string') return;
          stage.grow(p.id, t('caption.grow', "'{ch}' is new — a branch sprouts here.", { ch: p.ch }));
          return;
        }

        case 'highlight': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string' || typeof p.ch !== 'string') return;
          stage.ride(p.id, t('caption.step', "Follow '{ch}' — one step down.", { ch: p.ch }));
          return;
        }

        case 'mark': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string') return;
          stage.settle(p.id, t('caption.isWord', '"{w}" ends here — it is a word.', { w: p.id }));
          return;
        }

        case 'miss': {
          const p = rec(event.payload);
          if (!p || typeof p.id !== 'string') return;
          const ch = typeof p.ch === 'string' ? p.ch : '';
          // 두 종류의 "없다" 를 갈라 말한다 — 길이 끊긴 것과, 길은 있는데
          // 낱말이 아닌 것. trie 에서만 갈리는 구분이다.
          stage.miss(
            p.id,
            ch === ''
              ? t('caption.notWord', 'The path exists, but no word ends here.')
              : t('caption.noBranch', "No '{ch}' branch — it stops here.", { ch }),
          );
          return;
        }

        case 'collect': {
          const p = rec(event.payload);
          if (!p || typeof p.prefix !== 'string') return;
          const found = strArray(p.found);
          if (!found) return;
          resultHud?.setText(
            found.length === 0
              ? t('hud.none', 'none')
              : found.join(', '),
          );
          stage.caption(
            t('caption.collect', '{n} words start with "{p}".', { n: found.length, p: p.prefix }),
          );
          return;
        }

        case 'prune': {
          const p = rec(event.payload);
          if (!p || typeof p.word !== 'string') return;
          const removed = strArray(p.removed);
          if (!removed) return;
          // 지운 자리가 0 인 경우가 요점이다 — 다른 낱말이 그 길을 쓰고 있어서다.
          stage.caption(
            t('caption.prune', '"{w}" removed; {n} seats freed — the rest are shared.', {
              w: p.word,
              n: removed.length,
            }),
          );
          return;
        }

        case 'done': {
          const p = rec(event.payload);
          if (!p) return;
          const words = typeof p.words === 'number' ? p.words : 0;
          const nodes = typeof p.nodes === 'number' ? p.nodes : 0;
          // 낱말보다 자리가 훨씬 덜 는다는 것이 조용한 논증이다.
          sizeHud?.setText(t('hud.size', '{w} words / {n} seats', { w: words, n: nodes }));
          return;
        }

        default:
          // 그 밖의 어휘는 무시한다.
          return;
      }
    },
  };
};
