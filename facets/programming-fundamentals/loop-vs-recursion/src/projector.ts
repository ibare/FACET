/**
 * loop-vs-recursion projector — 알고리즘 이벤트를 stage 호출과 캡션으로 옮긴다.
 *
 * 운동의 길이는 걸음마다 `runtime.getSpeed()` 를 읽어 정한다 — 걸음 경계를 넘지 않게 걸음 간격의 일부만 쓴다.
 * 캡션의 수는 전부 payload 에서 온다. 판 끝 캡션은 알고리즘이 두 답을 견준 결과(`same`)로 문안을 고른다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { LoopVsRecursionStage } from './loop-vs-recursion-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

const num = (p: Record<string, unknown>, key: string): number => {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`loop-vs-recursion projector: payload.${key} 가 수가 아니다`);
  return v;
};
const bool = (p: Record<string, unknown>, key: string): boolean => {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`loop-vs-recursion projector: payload.${key} 가 참거짓이 아니다`);
  return v;
};

export const loopVsRecursionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as LoopVsRecursionStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();
  let stepMs = 700;
  /** 이번 걸음에 쓸 운동 길이 — 부를 때마다 속도를 새로 읽는다. */
  const moveMs = (): number => (stepMs * 0.75) / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onInit(data) {
      const ms = (data as { stepMs?: unknown }).stepMs;
      if (typeof ms === 'number' && ms > 0) stepMs = ms;
      stage?.reset();
    },
    onReset() {
      stage?.reset();
      code?.clearHighlight?.();
    },
    onEvent(e) {
      const p = (typeof e.payload === 'object' && e.payload !== null ? e.payload : {}) as Record<string, unknown>;
      switch (e.type) {
        case 'phase': {
          const ph = p.phase;
          code?.highlightPhase?.(typeof ph === 'string' ? ph : null);
          return;
        }
        case 'round':
          stage?.startRound();
          return;
        case 'loop-init': {
          const acc = num(p, 'acc');
          const k = num(p, 'k');
          stage?.loopInit(num(p, 'n'), acc, k, moveMs());
          stage?.setCaption(tr('caption.loopInit', 'The loop frame stands: acc {acc}, k {k}', { acc, k }));
          return;
        }
        case 'loop-check': {
          const k = num(p, 'k');
          const n = num(p, 'n');
          const pass = bool(p, 'pass');
          const count = num(p, 'count');
          stage?.loopCheck(k, n, pass, count, bool(p, 'back'), num(p, 'backs'), moveMs());
          stage?.setCaption(
            pass
              ? tr('caption.loopCheckTrue', 'Check {count}: {k} <= {n} holds, into the body', { count, k, n })
              : tr('caption.loopCheckFalse', 'Check {count}: {k} <= {n} fails, out of the loop', { count, k, n }),
          );
          return;
        }
        case 'loop-add': {
          const square = num(p, 'square');
          const to = num(p, 'to');
          stage?.loopAdd(square, to, num(p, 'kNext'), moveMs());
          stage?.setCaption(tr('caption.loopAdd', 'acc: {from} + {sq} = {to}', { from: num(p, 'from'), sq: square, to }));
          return;
        }
        case 'loop-return': {
          const answer = num(p, 'answer');
          stage?.loopReturn(answer, moveMs());
          stage?.setCaption(tr('caption.loopReturn', 'The loop hands back {v}, its frame comes down', { v: answer }));
          return;
        }
        case 'rec-check': {
          const level = num(p, 'level');
          const arg = num(p, 'arg');
          const base = bool(p, 'base');
          const height = num(p, 'height');
          stage?.recCheck(level, arg, base, num(p, 'count'), height, moveMs());
          if (base) stage?.settlePeak(height, moveMs());
          stage?.setCaption(
            base
              ? tr('caption.recCheckTrue', 'Frame {level}: {arg} == 0 holds, the base', { level, arg })
              : tr('caption.recCheckFalse', 'Frame {level}: {arg} == 0 fails', { level, arg }),
          );
          return;
        }
        case 'rec-call': {
          const level = num(p, 'level');
          const square = num(p, 'square');
          const child = num(p, 'child');
          stage?.recCall(level, square, child, num(p, 'height'), moveMs());
          stage?.setCaption(
            tr('caption.recCall', 'Frame {level} waits on {sq} + □ and calls sumSquaresRec({child})', { level, sq: square, child }),
          );
          return;
        }
        case 'rec-base': {
          const level = num(p, 'level');
          stage?.recBase(level, num(p, 'height'), moveMs());
          stage?.setCaption(tr('caption.recBase', 'Frame {level} hands 0 down and comes off', { level }));
          return;
        }
        case 'rec-return': {
          const level = num(p, 'level');
          const square = num(p, 'square');
          const got = num(p, 'got');
          const result = num(p, 'result');
          const outside = bool(p, 'outside');
          stage?.recReturn(level, square, got, result, outside, num(p, 'height'), moveMs());
          stage?.setCaption(
            outside
              ? tr('caption.recReturnOut', 'Frame {level}: {sq} + {got} = {res}, handed to the outside', { level, sq: square, got, res: result })
              : tr('caption.recReturn', 'Frame {level}: {sq} + {got} = {res}, handed down', { level, sq: square, got, res: result }),
          );
          return;
        }
        case 'verdict': {
          const a = num(p, 'loop');
          const b = num(p, 'rec');
          stage?.setCaption(
            bool(p, 'same')
              ? tr('caption.verdictSame', 'Loop: {a}   Recursion: {b}   same answer', { a, b })
              : tr('caption.verdictDiffer', 'Loop: {a}   Recursion: {b}   different answers', { a, b }),
          );
          return;
        }
        default:
          return;
      }
    },
    onDestroy() {
      code?.clearHighlight?.();
    },
  };
};
