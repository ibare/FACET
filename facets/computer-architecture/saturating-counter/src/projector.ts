/**
 * 포화 카운터 projector — 알고리즘 이벤트를 stage 호출과 캡션으로 옮긴다.
 *
 * 캡션의 수는 전부 payload 에서 온다. 결론(몇 번 틀렸는가, 몇 % 맞혔는가)도 셈한
 * 값으로 말하고 문안에 박지 않는다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { SaturatingCounterStage } from './saturating-counter-stage.js';

type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
  clearHighlight?: () => void;
};

const num = (p: Record<string, unknown>, key: string): number | null => {
  const value = p[key];
  return typeof value === 'number' ? value : null;
};

export const saturatingCounterProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SaturatingCounterStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  let threshold = 1;
  let bits = 1;
  let steps = 0;

  return {
    onEvent(event: FacetRuntimeEvent) {
      const raw = event.payload;
      const p: Record<string, unknown> =
        typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

      switch (event.type) {
        case 'phase': {
          const phase = p.phase;
          if (typeof phase === 'string') panel?.highlightPhase?.(phase);
          return;
        }

        case 'counter-set': {
          const b = num(p, 'bits');
          const top = num(p, 'top');
          const th = num(p, 'threshold');
          const state = num(p, 'state');
          const n = num(p, 'steps');
          const turnAt = num(p, 'turnAt');
          if (b === null || top === null || th === null || state === null || n === null || turnAt === null) return;
          bits = b;
          threshold = th;
          steps = n;
          stage?.setCounter?.(top, th, state, n, turnAt);
          stage?.setCaption?.(
            tr('caption.set', '{bits} bits: states 0–{top}, taken from {threshold} up. The needle starts at {state}.', {
              bits: b,
              top,
              threshold: th,
              state,
            }),
          );
          return;
        }

        case 'guess': {
          const step = num(p, 'step');
          const state = num(p, 'state');
          const guess = num(p, 'guess');
          if (step === null || state === null || guess === null) return;
          stage?.showGuess?.(step, state, guess);
          stage?.setCaption?.(
            guess === 1
              ? tr('caption.guessTaken', 'Step {n}: needle at {state} ≥ {threshold}, so guess taken.', {
                  n: step + 1,
                  state,
                  threshold,
                })
              : tr('caption.guessNotTaken', 'Step {n}: needle at {state} < {threshold}, so guess not taken.', {
                  n: step + 1,
                  state,
                  threshold,
                }),
          );
          return;
        }

        case 'check': {
          const step = num(p, 'step');
          const outcome = num(p, 'outcome');
          const loopMisses = num(p, 'loopMisses');
          const turnMisses = num(p, 'turnMisses');
          const hit = p.hit;
          if (step === null || outcome === null || loopMisses === null || turnMisses === null || typeof hit !== 'boolean') return;
          stage?.showCheck?.(step, outcome, hit, loopMisses, turnMisses);
          const text = hit
            ? outcome === 1
              ? tr('caption.hitTaken', 'Step {n}: taken. The guess was right.', { n: step + 1 })
              : tr('caption.hitNotTaken', 'Step {n}: not taken. The guess was right.', { n: step + 1 })
            : outcome === 1
              ? tr('caption.missTaken', 'Step {n}: taken. The guess was wrong.', { n: step + 1 })
              : tr('caption.missNotTaken', 'Step {n}: not taken. The guess was wrong.', { n: step + 1 });
          stage?.setCaption?.(text);
          return;
        }

        case 'move': {
          const step = num(p, 'step');
          const from = num(p, 'from');
          const to = num(p, 'to');
          const th = num(p, 'threshold');
          if (step === null || from === null || to === null || th === null) return;
          stage?.moveNeedle?.(step, from, to, th);
          const crossed = (from >= th) !== (to >= th);
          // 마지막 걸음 뒤에는 짐작이 없다 — "다음 짐작이 뒤바뀐다" 를 말하지 않는다.
          const last = step === steps - 1;
          stage?.setCaption?.(
            from === to
              ? tr('caption.stay', 'Needle stays at {to}: the counter is saturated.', { to })
              : crossed && last
                ? tr('caption.crossLast', 'Needle {from} → {to}: it crossed the threshold on the last step.', { from, to })
              : crossed
                ? tr('caption.cross', 'Needle {from} → {to}: it crossed the threshold, so the next guess flips.', { from, to })
                : tr('caption.move', 'Needle {from} → {to}: still on the same side of the threshold.', { from, to }),
          );
          return;
        }

        case 'done': {
          const loop = num(p, 'loopMisses');
          const turn = num(p, 'turnMisses');
          const percent = num(p, 'percent');
          if (loop === null || turn === null || percent === null) return;
          panel?.clearHighlight?.();
          stage?.setCaption?.(
            tr('caption.done', '{bits} bits: {loop} wrong in the loop, {turn} after the flip, {percent}% right.', {
              bits,
              loop,
              turn,
              percent,
            }),
          );
          return;
        }

        default:
          return;
      }
    },

    onReset() {
      stage?.clear?.();
      panel?.clearHighlight?.();
    },
  };
};
