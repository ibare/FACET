/**
 * merge-sort Projector — 알고리즘 이벤트를 stage 와 코드 패널로 번역한다.
 *
 * stage 는 재귀의 마디를 구간 덩이로 그리고, 코드 패널은 `phase` 를 받아
 * 지금 실행 중인 줄을 짚는다. `phase` 는 silent 이벤트라 걸음이 멈추지 않지만
 * projector 에는 그대로 들어온다 — 여기서 코드 패널로 넘기지 않으면 코드가
 * 재생을 따라오지 않는다 (C3).
 *
 * 화면 문안은 키만 쓴다. 문장은 `facet.ts` 의 `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';
import type { MergeSortStage } from './merge-sort-stage.js';

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

/** 재귀 마디를 짚는 payload 의 공통 모양. */
type SpanPayload = {
  lo?: number;
  hi?: number;
  mid?: number;
  depth?: number;
  side?: string;
  values?: number[];
  left?: number[];
  right?: number[];
};

type TakePayload = {
  side?: string;
  from?: number;
  to?: number;
  value?: number;
  drain?: boolean;
};

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isNumArray = (x: unknown): x is number[] => Array.isArray(x) && x.every(isNum);

export const mergeSortProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as MergeSortStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  // 러너는 언제나 `t` 를 주입한다. 러너 밖 마운트에서도 en 원본은 살아 있어야
  // 하므로 fallback 을 둔다 (C10 조회 3층).
  const tr: Translate = runtime?.t ?? makeTranslator();

  const say = (key: string, en: string, vars?: Record<string, string | number>): void => {
    if (!stage) return;
    stage.setCaption(tr(key, en, vars));
  };

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[] } | undefined;
      if (stage && isNumArray(data?.values)) stage.init([...data.values]);
      codePanel?.clearHighlight();
      say('caption.start', 'Split all the way down, then merge back up.');
    },

    onEvent(event) {
      switch (event.type) {
        case 'split': {
          const p = event.payload as SpanPayload | undefined;
          if (!isNum(p?.lo) || !isNum(p?.hi) || !isNum(p?.mid) || !isNum(p?.depth)) break;
          stage?.split(p.lo, p.hi, p.mid, p.depth);
          say('caption.split', 'Cut [{lo}..{hi}] in two at {mid}.', {
            lo: p.lo,
            hi: p.hi,
            mid: p.mid,
          });
          break;
        }

        case 'descend': {
          const p = event.payload as SpanPayload | undefined;
          if (!isNum(p?.lo) || !isNum(p?.depth)) break;
          stage?.descend(p.lo, p.depth);
          if (p.side === 'L') {
            say('caption.goLeft', 'Go down the left half first.');
          } else {
            say('caption.goRight', 'The left half is done — now the right.');
          }
          break;
        }

        case 'base': {
          const p = event.payload as SpanPayload | undefined;
          if (!isNum(p?.lo) || !isNum(p?.depth)) break;
          stage?.markBase(p.lo, p.depth);
          say('caption.base', 'One item on its own is already sorted.');
          break;
        }

        case 'merge-begin': {
          const p = event.payload as SpanPayload | undefined;
          if (!isNum(p?.lo) || !isNum(p?.mid) || !isNum(p?.hi) || !isNum(p?.depth)) break;
          stage?.mergeBegin(p.lo, p.mid, p.depth);
          say('caption.merge', 'Both halves are sorted — merge [{lo}..{hi}].', {
            lo: p.lo,
            hi: p.hi,
          });
          break;
        }

        case 'copy-out': {
          const p = event.payload as SpanPayload | undefined;
          if (!isNumArray(p?.left) || !isNumArray(p?.right)) break;
          stage?.copyOut([...p.left], [...p.right]);
          say('caption.copy', 'Both halves are copied aside — the room they borrow.');
          break;
        }

        case 'highlight': {
          const [l, r] = toIndexArray(event.target);
          if (!isNum(l) || !isNum(r)) break;
          stage?.showFronts(l, r);
          say('caption.compare', 'Only the two fronts are compared.');
          break;
        }

        case 'take': {
          const p = event.payload as TakePayload | undefined;
          if (!isNum(p?.from) || !isNum(p?.to) || !isNum(p?.value)) break;
          const side = p.side === 'right' ? 'right' : 'left';
          const drain = p.drain === true;
          stage?.take(side, p.from, p.to, p.value, drain);
          if (drain) {
            say('caption.drain', 'One side is empty — {v} just slides over.', { v: p.value });
          } else if (side === 'left') {
            say('caption.takeLeft', '{v} wins from the left.', { v: p.value });
          } else {
            say('caption.takeRight', '{v} wins from the right.', { v: p.value });
          }
          break;
        }

        case 'merge-end': {
          const p = event.payload as SpanPayload | undefined;
          if (!isNum(p?.lo) || !isNum(p?.hi) || !isNumArray(p?.values)) break;
          stage?.mergeEnd([...p.values]);
          say('caption.merged', '[{lo}..{hi}] is one sorted run now.', { lo: p.lo, hi: p.hi });
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase;
          codePanel?.highlightPhase(typeof phase === 'string' ? phase : null);
          break;
        }

        case 'done': {
          stage?.finish();
          codePanel?.clearHighlight();
          say('caption.done', 'The topmost merge was the last one to run.');
          break;
        }

        default:
          // 그 밖의 이벤트는 이 facet 이 발신하지 않는다. 조용히 흘린다.
          break;
      }
    },

    onReset() {
      // stage 의 시각 복원은 러너가 reset 뒤 onInit 을 다시 부르며 일괄 처리한다.
      codePanel?.clearHighlight();
    },
  };
};
