/**
 * beam-search projector — 알고리즘 이벤트를 stage 호출과 캡션으로 옮긴다.
 *
 * 흐름의 길이는 재생 속도를 따라간다 — 이벤트마다 `getSpeed()` 로 다시 셈한다.
 * 문안은 러너가 준 `runtime.t` 로 조회하고, 없으면 core 의 `makeTranslator` 로 받는다.
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import { formatScore } from './beam-search-stage.js';

/** stage 의 구조적 표면 (C9). */
type Stage = {
  startRound?(width: number, dur: number): void;
  showErase?(
    items: { parent: number; word: string; prob: number; erased: boolean }[],
    dur: number,
  ): void;
  expand?(
    items: { parent: number; word: string; prob: number; score: number; carried: boolean }[],
    dur: number,
  ): void;
  prune?(kept: number[], dur: number): void;
  answer?(dur: number): void;
  setCaption?(text: string): void;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
};

function field(o: unknown, key: string): unknown {
  if (typeof o !== 'object' || o === null) return undefined;
  return (o as Record<string, unknown>)[key];
}

function num(o: unknown, key: string): number | null {
  const v = field(o, key);
  return typeof v === 'number' ? v : null;
}

function list(o: unknown, key: string): unknown[] {
  const v = field(o, key);
  return Array.isArray(v) ? v : [];
}

export const beamSearchProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let stepMs = 1000;

  /** 한 걸음 안에 흐름이 끝나게 — 걸음 간격의 0.7 배, 재생 속도로 나눈다. */
  const dur = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return Math.min(700, stepMs * 0.7) / Math.max(0.01, speed);
  };

  return {
    onInit(initialData) {
      const s = num(initialData, 'stepMs');
      if (s !== null && s > 0) stepMs = s;
      stage?.reset?.();
    },
    onReset() {
      stage?.reset?.();
      panel?.highlightPhase?.(null);
    },
    onEvent(event) {
      const p = event.payload;
      switch (event.type) {
        case 'phase': {
          const name = field(p, 'phase');
          panel?.highlightPhase?.(typeof name === 'string' ? name : null);
          return;
        }
        case 'round': {
          const width = num(p, 'width') ?? 1;
          const erase = num(p, 'erase') ?? 0;
          stage?.startRound?.(width, dur());
          stage?.setCaption?.(
            erase === 1
              ? t('caption.roundErase', 'Beam width {width}. Impossible words are erased before scoring.', { width })
              : t('caption.round', 'Beam width {width}. Every word the table offers is scored.', { width }),
          );
          return;
        }
        case 'erase': {
          const items: { parent: number; word: string; prob: number; erased: boolean }[] = [];
          for (const it of list(p, 'items')) {
            const parent = num(it, 'parent');
            const prob = num(it, 'prob');
            const word = field(it, 'word');
            const erased = field(it, 'erased');
            if (parent === null || prob === null || typeof word !== 'string') continue;
            items.push({ parent, word, prob, erased: erased === true });
          }
          stage?.showErase?.(items, dur());
          stage?.setCaption?.(
            t('caption.erase', 'Depth {depth}: erased before scoring — {n}. The article does not fit the sound that follows.', {
              depth: num(p, 'depth') ?? 0,
              n: items.filter((i) => i.erased).length,
            }),
          );
          return;
        }
        case 'expand': {
          const items: { parent: number; word: string; prob: number; score: number; carried: boolean }[] = [];
          for (const it of list(p, 'items')) {
            const parent = num(it, 'parent');
            const prob = num(it, 'prob');
            const score = num(it, 'score');
            const word = field(it, 'word');
            if (parent === null || prob === null || score === null || typeof word !== 'string') continue;
            items.push({ parent, word, prob, score, carried: field(it, 'carried') === true });
          }
          stage?.expand?.(items, dur());
          const stems = new Set(items.map((i) => i.parent)).size;
          const scored = items.filter((i) => !i.carried).length;
          const carried = items.length - scored;
          const depth = num(p, 'depth') ?? 0;
          stage?.setCaption?.(
            carried > 0
              ? t('caption.expandCarry', 'Depth {depth}: stems {stems}, new branches scored {n}; finished lines carried as is {c}.', {
                  depth,
                  stems,
                  n: scored,
                  c: carried,
                })
              : t('caption.expand', 'Depth {depth}: stems {stems}, new branches scored {n}.', {
                  depth,
                  stems,
                  n: scored,
                }),
          );
          return;
        }
        case 'prune': {
          const kept: number[] = [];
          for (const k of list(p, 'kept')) if (typeof k === 'number') kept.push(k);
          stage?.prune?.(kept, dur());
          stage?.setCaption?.(
            t('caption.prune', 'Only the top {kept} by score stay in the beam. Cut: {cut}.', {
              kept: kept.length,
              cut: Math.max(0, (num(p, 'total') ?? kept.length) - kept.length),
            }),
          );
          return;
        }
        case 'answer': {
          const words = list(p, 'words').filter((w): w is string => typeof w === 'string');
          const score = num(p, 'score') ?? 0;
          const rank = num(p, 'rank') ?? 0;
          stage?.answer?.(dur());
          const vars = { text: words.join(' '), score: formatScore(score), rank };
          stage?.setCaption?.(
            field(p, 'correct') === true
              ? t('caption.answerRight', 'Chosen: “{text}” · {score}. Grammatical — rank {rank} among grammatical sentences.', vars)
              : t('caption.answerWrong', 'Chosen: “{text}” · {score}. It breaks the article rule.', vars),
          );
          return;
        }
        default:
          // 이 facet 은 위 여섯 말고 다른 이벤트를 내지 않는다 — 들어와도 조용히 버린다.
          return;
      }
    },
  };
};
