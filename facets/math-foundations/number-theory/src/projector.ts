/**
 * number-theory projector — 알고리즘 이벤트를 stage 호출과 캡션 두 줄로 옮긴다.
 *
 * 운동의 길이는 round payload 의 motionMs 를 걸음마다 `runtime.getSpeed()` 로 나눠 정한다.
 * 캡션의 수는 전부 payload 에서 온다 — 다음 자리 · 밟은 칸 · gcd · m ÷ gcd 를 여기서 셈하지 않는다.
 * 밟은 칸 목록은 payload 의 visited(작은 수부터)를 `{0, 3, 6, 9}` 꼴로 적기만 한다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { NumberTheoryStage } from './number-theory-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

const num = (p: Record<string, unknown>, key: string): number => {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`number-theory projector: payload.${key} 가 정수가 아니다`);
  return v;
};
const intList = (p: Record<string, unknown>, key: string): number[] => {
  const v = p[key];
  if (!Array.isArray(v) || v.length === 0) throw new Error(`number-theory projector: payload.${key} 가 빈 목록이다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) throw new Error(`number-theory projector: payload.${key} 에 정수가 아닌 값이 있다`);
    return x;
  });
};

export const numberTheoryProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as NumberTheoryStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();
  let motionMs = 0;
  /** 이번 걸음에 쓸 운동 길이 — 부를 때마다 속도를 새로 읽는다. */
  const moveMs = (): number => motionMs / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onInit() {
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
        case 'round': {
          motionMs = num(p, 'motionMs');
          const m = num(p, 'm');
          const a = num(p, 'a');
          code?.highlightPhase?.(null);
          stage?.beginRound(m, moveMs());
          stage?.setCaption(tr('caption.round', 'Cells: {m} · Stride: {a}', { m, a }), '');
          return;
        }
        case 'start': {
          const pos = num(p, 'pos');
          stage?.start(pos, moveMs());
          stage?.setCaption(
            tr('caption.start', 'Start: {pos}', { pos }),
            tr('caption.visited', 'Visited: {count}', { count: num(p, 'count') }),
          );
          return;
        }
        case 'jump':
        case 'back': {
          const from = num(p, 'from');
          const a = num(p, 'a');
          const m = num(p, 'm');
          const to = num(p, 'to');
          if (e.type === 'jump') stage?.jump(from, to, a, moveMs());
          else stage?.back(from, a, moveMs());
          stage?.setCaption(
            tr('caption.jump', '({from} + {a}) mod {m} = {to}', { from, a, m, to }),
            tr('caption.visited', 'Visited: {count}', { count: num(p, 'count') }),
          );
          return;
        }
        case 'gcd': {
          const a = num(p, 'a');
          const m = num(p, 'm');
          const g = num(p, 'g');
          const len = num(p, 'len');
          const visited = intList(p, 'visited');
          stage?.finish(visited, moveMs());
          stage?.setCaption(
            tr('caption.gcd', 'gcd({a}, {m}) = {g} · {m} ÷ {g} = {len}', { a, m, g, len }),
            tr('caption.visitedList', 'Visited: {list}', { list: `{${visited.join(', ')}}` }),
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
