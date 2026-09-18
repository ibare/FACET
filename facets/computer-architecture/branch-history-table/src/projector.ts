/**
 * branch-history-table projector — 알고리즘 이벤트를 stage 호출과 캡션으로 옮긴다.
 *
 * payload 는 typeof 가드로 읽는다 (C9). 문안은 키와 en 원본을 둘 다 리터럴로 적어 tr 에 넘기고, en 원본은
 * facet.ts 의 messages.en 과 글자까지 같다.
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { BranchHistoryTableStage } from './branch-history-table-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

const num = (p: Record<string, unknown>, key: string): number => {
  const x = p[key];
  return typeof x === 'number' ? x : 0;
};

const binary = (value: number, bits: number): string =>
  bits <= 0 ? '—' : value.toString(2).padStart(bits, '0');

// 'T' · 'N' 은 분기 예측의 통용 표식이라 번역 대상이 아니다 (어셈블리 글처럼 자료 표기)
const side = (bit: number): string => (bit === 1 ? 'T' : 'N');

/** 결과 열이 되풀이하는 가장 짧은 마디를 T · N 글자로. 되풀이가 없으면 열 전체. */
const repeatingUnit = (outcomes: number[]): string => {
  for (let len = 1; len < outcomes.length; len += 1) {
    if (outcomes.every((o, i) => o === outcomes[i % len])) return outcomes.slice(0, len).map(side).join('');
  }
  return outcomes.map(side).join('');
};

export const branchHistoryTableProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BranchHistoryTableStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onEvent(event) {
      const raw = event.payload;
      const p: Record<string, unknown> = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

      switch (event.type) {
        case 'phase': {
          const name = p.phase;
          if (typeof name === 'string') code?.highlightPhase?.(name);
          return;
        }
        case 'round-start': {
          const outcomes = Array.isArray(p.outcomes)
            ? (p.outcomes as unknown[]).map((x) => (x === 1 ? 1 : 0))
            : [];
          const bits = num(p, 'historyBits');
          const size = num(p, 'size');
          // 열의 이름은 식별자 → 문안 키. 무늬 글자는 자료에서 셈한다.
          const id = typeof p.trace === 'string' ? p.trace : '';
          let trace = id;
          switch (id) {
            case 'pattern':
              trace = tr('trace.pattern', 'Pattern {unit}', { unit: repeatingUnit(outcomes) });
              break;
            case 'random':
              trace = tr('trace.random', 'Random');
              break;
            default:
              break;
          }
          stage?.startRound({ historyBits: bits, size, outcomes, trace });
          stage?.setCaption(
            tr('caption.round', '{trace} · history {bits} bits → {size} cells. Every counter starts at 2 (weakly taken).', {
              trace,
              bits,
              size,
            }),
          );
          return;
        }
        case 'lookup': {
          const step = num(p, 'step');
          const index = num(p, 'index');
          const bits = num(p, 'historyBits');
          const vars = { n: step + 1, hist: binary(index, bits), counter: num(p, 'counter'), guess: side(num(p, 'guess')) };
          stage?.lookup(step, index);
          stage?.setCaption(
            bits === 0
              ? tr('caption.lookupNone', 'Branch {n}: no history, one shared cell — counter {counter}, so guess {guess}.', vars)
              : tr('caption.lookup', 'Branch {n}: history {hist} picks its cell — counter {counter}, so guess {guess}.', vars),
          );
          return;
        }
        case 'resolve': {
          const step = num(p, 'step');
          const index = num(p, 'index');
          const taken = num(p, 'taken');
          const hit = p.hit === true;
          const counter = num(p, 'counter');
          stage?.resolve(step, index, taken, hit, counter);
          const vars = { taken: side(taken), counter, misses: num(p, 'misses') };
          stage?.setCaption(
            hit
              ? tr('caption.hit', 'Actual {taken} — hit. The counter moves to {counter}.', vars)
              : tr('caption.miss', 'Actual {taken} — miss (#{misses}). The counter moves to {counter}.', vars),
          );
          return;
        }
        case 'shift': {
          const taken = num(p, 'taken');
          const history = num(p, 'history');
          const bits = num(p, 'historyBits');
          stage?.shift(taken, history);
          stage?.setCaption(
            bits === 0
              ? tr('caption.shiftNone', 'No history to shift — the next branch reads the same cell.')
              : tr('caption.shift', '{taken} slides into the history — the next branch reads cell {cell}.', {
                  taken: side(taken),
                  cell: binary(history, bits),
                }),
          );
          return;
        }
        case 'round-end': {
          stage?.finish();
          code?.highlightPhase?.(null);
          stage?.setCaption(
            tr('caption.end', '{misses} of {total} missed → {percent}% hit with {size} cells. Turn a knob to replay.', {
              misses: num(p, 'misses'),
              total: num(p, 'total'),
              percent: num(p, 'percent'),
              size: num(p, 'size'),
            }),
          );
          return;
        }
        default:
          return;
      }
    },
  };
};
