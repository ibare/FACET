/**
 * 정적 예측 projector — 알고리즘 이벤트를 stage 호출과 캡션으로 옮긴다.
 *
 * 문안은 facet.ts 의 messages 에 있고 여기에는 키와 en 원본만 남는다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { StaticPredictionStage } from './static-prediction-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void };

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined;
  return (payload as Record<string, unknown>)[key];
}

function int(payload: unknown, key: string): number | null {
  const v = field(payload, key);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const staticPredictionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as StaticPredictionStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const pace = () => stage?.setPace?.(runtime?.getSpeed() ?? 1);

  const branchName = (backward: number) =>
    backward
      ? tr('label.backward', 'backward branch')
      : tr('label.forward', 'forward branch');

  const direction = (taken: number) =>
    taken ? tr('label.taken', 'taken') : tr('label.notTaken', 'not taken');

  const ruleName = (policy: number) => {
    switch (policy) {
      case 0: return tr('policy.never', 'never taken');
      case 1: return tr('policy.always', 'always taken');
      default: return tr('policy.backward', 'backward taken');
    }
  };

  return {
    onEvent(event) {
      const p = event.payload;
      switch (event.type) {
        case 'phase': {
          const phase = field(p, 'phase');
          panel?.highlightPhase?.(typeof phase === 'string' ? phase : null);
          return;
        }
        case 'policy': {
          const policy = int(p, 'policy');
          const fg = int(p, 'forwardGuess');
          const bg = int(p, 'backwardGuess');
          if (policy === null || fg === null || bg === null) return;
          pace();
          stage?.setPolicy?.(policy, fg, bg);
          stage?.setCaption?.(
            tr('caption.policy', 'Rule: {rule}. The needles turn to where this rule guesses.', {
              rule: ruleName(policy),
            }),
          );
          return;
        }
        case 'approach': {
          const k = int(p, 'k');
          const backward = int(p, 'backward');
          if (k === null || backward === null) return;
          pace();
          stage?.approach?.(k, backward);
          stage?.setCaption?.(
            tr('caption.approach', 'Pass {pass}, {branch}: the result is not known yet, so the rule guesses.', {
              pass: k + 1,
              branch: branchName(backward),
            }),
          );
          return;
        }
        case 'branch': {
          const k = int(p, 'k');
          const backward = int(p, 'backward');
          const guess = int(p, 'guess');
          const taken = int(p, 'taken');
          const miss = field(p, 'miss');
          if (k === null || backward === null || guess === null || taken === null || typeof miss !== 'boolean') return;
          pace();
          stage?.showBranch?.(k, backward, guess, taken, miss);
          const vars = {
            pass: k + 1,
            branch: branchName(backward),
            guess: direction(guess),
            actual: direction(taken),
          };
          stage?.setCaption?.(
            miss
              ? tr('caption.miss', 'Pass {pass}, {branch}: guessed {guess}, it was {actual}. Miss.', vars)
              : tr('caption.hit', 'Pass {pass}, {branch}: guessed {guess}, it was {actual}. Hit.', vars),
          );
          return;
        }
        case 'loss': {
          const k = int(p, 'k');
          const backward = int(p, 'backward');
          const cycles = int(p, 'cycles');
          if (k === null || backward === null || cycles === null) return;
          pace();
          stage?.addLoss?.(k, backward, cycles);
          stage?.setCaption?.(
            tr('caption.loss', 'The miss throws away {cycles} cycles. They pile up under the {branch}.', {
              cycles,
              branch: branchName(backward),
            }),
          );
          return;
        }
        case 'tally': {
          const policy = int(p, 'policy');
          const misses = int(p, 'misses');
          const fwd = int(p, 'forwardMisses');
          const back = int(p, 'backwardMisses');
          const total = int(p, 'total');
          const lost = int(p, 'lost');
          const hit = int(p, 'hitPercent');
          const penalty = int(p, 'penalty');
          if (
            policy === null || misses === null || fwd === null || back === null ||
            total === null || lost === null || hit === null || penalty === null
          ) return;
          pace();
          stage?.showTally?.(policy, fwd * penalty, back * penalty);
          stage?.setCaption?.(
            tr(
              'caption.tally',
              'Missed {misses} of {total}: {forward} forward, {backward} backward. {lost} cycles lost, {hit}% right.',
              { misses, total, forward: fwd, backward: back, lost, hit },
            ),
          );
          return;
        }
        default:
          return;
      }
    },
  };
};
