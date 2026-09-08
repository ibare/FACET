/**
 * boundAndCut projector — 이벤트를 판 위의 동작으로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다. stage 는 정형 객체만 받는다 (C9).
 * 화면 문안은 키로만 다루고 문안 자체는 facet.ts 의 messages 에 있다 (C10).
 */

import type { ProjectorFactory, ProjectorInstance, ProjectorViews, ProjectorRuntime } from '@ffacet/core/runtime';

type Decision = 'in' | 'out' | 'open';

type StagePlan = { columns: number; scaleMax: number; order: string[] };

type StageBranch = {
  order: number;
  decisions: Decision[];
  value: number;
  weight: number;
  bound: number;
  splitItem: string | null;
  splitNum: number;
  splitDen: number;
  complete: boolean;
};

type StageCut = { order: number; bound: number; best: number };

type BoundStage = {
  plan?(spec: StagePlan): void;
  measure?(branch: StageBranch): Promise<void> | void;
  raiseBest?(best: number): Promise<void> | void;
  cut?(info: StageCut): Promise<void> | void;
  finish?(answerOrder: number): void;
  setCaption?(text: string): void;
  rewind?(): void;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function readDecisions(v: unknown): Decision[] | null {
  if (!Array.isArray(v)) return null;
  const out: Decision[] = [];
  for (const d of v) {
    if (d !== 'in' && d !== 'out' && d !== 'open') return null;
    out.push(d);
  }
  return out;
}

function readStrings(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const s of v) {
    if (typeof s !== 'string') return null;
    out.push(s);
  }
  return out;
}

/** 한계는 쪼갠 값이라 소수 한 자리, 실제로 담은 값은 정수로 적는다. */
const bound1 = (n: number): string => n.toFixed(1);

export const boundAndCutProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as BoundStage | undefined;
  const tr = runtime?.t;
  const say = (key: string, fallback: string, vars?: Record<string, string | number>): void => {
    if (!tr) return;
    stage?.setCaption?.(tr(key, fallback, vars));
  };

  return {
    async onEvent(event): Promise<void> {
      const p = event.payload as Record<string, unknown> | undefined;

      switch (event.type) {
        case 'plan': {
          const columns = num(p?.columns);
          const scaleMax = num(p?.scaleMax);
          const order = readStrings(p?.order);
          if (columns === null || scaleMax === null || order === null) return;
          stage?.plan?.({ columns, scaleMax, order });
          return;
        }

        case 'branch-measured': {
          const order = num(p?.order);
          const value = num(p?.value);
          const weight = num(p?.weight);
          const bound = num(p?.bound);
          const splitNum = num(p?.splitNum);
          const splitDen = num(p?.splitDen);
          const decisions = readDecisions(p?.decisions);
          if (order === null || value === null || weight === null || bound === null) return;
          if (splitNum === null || splitDen === null || decisions === null) return;
          const complete = p?.complete === true;
          const splitItem = typeof p?.splitItem === 'string' ? p.splitItem : null;

          if (complete) {
            say('caption.settled', 'Every item is decided — value {value}', { value });
          } else if (order === 0) {
            say('caption.root', 'If items could be split, at most {bound}', {
              bound: bound1(bound),
            });
          } else {
            say('caption.measure', 'This branch tops out at {bound}', { bound: bound1(bound) });
          }

          await stage?.measure?.({
            order,
            decisions,
            value,
            weight,
            bound,
            splitItem,
            splitNum,
            splitDen,
            complete,
          });
          return;
        }

        case 'best-raised': {
          const best = num(p?.best);
          if (best === null) return;
          say('caption.newBest', 'New best: {best}', { best });
          await stage?.raiseBest?.(best);
          return;
        }

        case 'branch-cut': {
          const order = num(p?.order);
          const bound = num(p?.bound);
          const best = num(p?.best);
          if (order === null || bound === null || best === null) return;
          say('caption.cut', '{bound} cannot beat {best} — cut this branch', {
            bound: bound1(bound),
            best,
          });
          await stage?.cut?.({ order, bound, best });
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        case 'done': {
          const cuts = num(p?.cuts);
          const best = num(p?.best);
          const answerOrder = num(p?.answerOrder);
          if (cuts === null || best === null) return;
          if (answerOrder !== null && answerOrder >= 0) stage?.finish?.(answerOrder);
          say('caption.done', 'Cut {cuts} branches and the best is still {best}', { cuts, best });
          return;
        }

        default:
          // 그 밖의 이벤트는 조용히 버린다 — 이 facet 은 위 여섯만 발신한다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
