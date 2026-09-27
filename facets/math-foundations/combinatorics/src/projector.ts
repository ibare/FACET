/**
 * combinatorics projector — 알고리즘 이벤트를 stage 호출과 캡션으로 옮긴다.
 *
 * 운동 길이 = 판 머리 payload 의 motionMs ÷ 재생 속도 — 속도는 걸음마다 새로 읽는다.
 * 캡션의 수는 전부 payload 에서 온다. 무대도 projector 도 셈하지 않는다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { CombinatoricsStage } from './combinatorics-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

const num = (p: Record<string, unknown>, key: string): number => {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`combinatorics projector: payload.${key} 가 수가 아니다`);
  return v;
};
const nums = (p: Record<string, unknown>, key: string): number[] => {
  const v = p[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number')) {
    throw new Error(`combinatorics projector: payload.${key} 가 수 배열이 아니다`);
  }
  return v as number[];
};
const strs = (p: Record<string, unknown>, key: string): string[] => {
  const v = p[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new Error(`combinatorics projector: payload.${key} 가 글자 배열이 아니다`);
  }
  return v as string[];
};
const str = (p: Record<string, unknown>, key: string): string => {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`combinatorics projector: payload.${key} 가 글자가 아니다`);
  return v;
};
const bool = (p: Record<string, unknown>, key: string): boolean => {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`combinatorics projector: payload.${key} 가 참거짓이 아니다`);
  return v;
};

export const combinatoricsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CombinatoricsStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();
  let motionMs: number | null = null;
  const moveMs = (): number => {
    if (motionMs === null) throw new Error('combinatorics projector: 판 머리(round) 전에 걸음이 왔다');
    return motionMs / Math.max(0.01, runtime?.getSpeed() ?? 1);
  };

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
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round': {
          motionMs = num(p, 'motionMs');
          code?.highlightPhase?.(null);
          stage?.beginRound(num(p, 'columns'), num(p, 'colCap'), moveMs());
          return;
        }
        case 'start': {
          const total = num(p, 'total');
          stage?.start(nums(p, 'sizes'), nums(p, 'rows'), nums(p, 'counts'), moveMs());
          stage?.setCaption(tr('caption.start', 'Subsets: {total}', { total }), '');
          return;
        }
        case 'split': {
          const j = num(p, 'j');
          const before = num(p, 'before');
          const total = num(p, 'total');
          const x = str(p, 'element');
          stage?.split(j, before, nums(p, 'sizes'), nums(p, 'rows'), nums(p, 'keep'), nums(p, 'move'), nums(p, 'counts'), moveMs());
          stage?.setCaption(tr('caption.split', 'New element: {x} · Subsets: {before} → {total}', { x, before, total }), '');
          return;
        }
        case 'pick': {
          const n = num(p, 'n');
          const k = num(p, 'k');
          const count = num(p, 'count');
          const within = bool(p, 'within');
          stage?.pick(n, k, within, nums(p, 'picked'), strs(p, 'members'), moveMs());
          const main = tr('caption.pick', 'Size {k}: {count}', { k, count });
          const line = within
            ? tr('caption.pickRatio', 'P({n}, {k}) ÷ {k}! = {p} ÷ {f} = {count}', { n, k, p: num(p, 'p'), f: num(p, 'f'), count })
            : '';
          stage?.setCaption(main, line);
          return;
        }
        default:
          throw new Error(`combinatorics projector: 모르는 이벤트 ${e.type}`);
      }
    },
    onDestroy() {
      code?.clearHighlight?.();
    },
  };
};
