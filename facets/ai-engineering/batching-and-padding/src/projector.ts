/**
 * 배치와 패딩 — projector.
 *
 * 알고리즘 이벤트로 판의 상태(대기열 · 자리 · 끝난 걸음 · 칸)를 따라 적고, 바뀔 때마다
 * stage 에 통째로 넘긴다. 흐름의 길이는 걸음 간격과 재생 속도에서 셈한다.
 * `phase` 는 코드 패널로 넘긴다.
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  BatchStage,
  BatchStageCaption,
  BatchStageLane,
  BatchStageRequest,
  BatchStageState,
} from './batching-and-padding-stage.js';

type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
  clearHighlight?: () => void;
};

// ── payload 좁히개 (C9) ─────────────────────────────────────────────────────

function rec(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : null;
}
function num(x: unknown, fallback = 0): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}
function nums(x: unknown): number[] {
  return Array.isArray(x) ? x.map((v) => num(v)) : [];
}
function moves(x: unknown): { req: number; slot: number }[] {
  if (!Array.isArray(x)) return [];
  const out: { req: number; slot: number }[] = [];
  for (const m of x) {
    const r = rec(m);
    if (r && typeof r.req === 'number' && typeof r.slot === 'number') out.push({ req: r.req, slot: r.slot });
  }
  return out;
}
function finishes(x: unknown): { req: number; slot: number; finish: number }[] {
  if (!Array.isArray(x)) return [];
  const out: { req: number; slot: number; finish: number }[] = [];
  for (const m of x) {
    const r = rec(m);
    if (r && typeof r.req === 'number' && typeof r.slot === 'number' && typeof r.finish === 'number') {
      out.push({ req: r.req, slot: r.slot, finish: r.finish });
    }
  }
  return out;
}
function lanes(x: unknown): BatchStageLane[] {
  if (!Array.isArray(x)) return [];
  return x.map((l) => {
    const r = rec(l);
    return { req: num(r?.req, -1), done: num(r?.done), pad: num(r?.pad) };
  });
}
function readRequests(x: unknown): BatchStageRequest[] {
  if (!Array.isArray(x)) return [];
  const out: BatchStageRequest[] = [];
  for (const q of x) {
    const r = rec(q);
    if (r && typeof r.tokens === 'number' && typeof r.prompt === 'string') {
      out.push({ tokens: r.tokens, prompt: r.prompt });
    }
  }
  return out;
}

const emptyLanes = (slots: number): BatchStageLane[] =>
  Array.from({ length: slots }, () => ({ req: -1, done: 0, pad: 0 }));

export const batchingAndPaddingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BatchStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;

  let stepMs = 400;
  let state: BatchStageState = {
    requests: [],
    slots: 0,
    lanes: [],
    queue: [],
    finish: [],
    ghost: [],
    step: 0,
    idle: 0,
    used: 0,
    cells: 0,
    pct: 0,
    caption: null,
  };

  /** 흐름의 길이 — 걸음 간격의 70 %, 재생 속도로 나눈다. */
  const flowMs = (): number => {
    const speed = runtime?.getSpeed?.() ?? 1;
    return Math.max(60, Math.round((stepMs * 0.7) / Math.max(0.01, speed)));
  };

  const push = (next: BatchStageState, caption: BatchStageCaption | null, ms = flowMs()) => {
    state = { ...next, caption };
    stage?.show?.(state, ms);
  };

  /** 한 판의 처음 — 요청은 모두 대기열에. */
  const fresh = (slots: number, ghost: number[]): BatchStageState => ({
    ...state,
    slots,
    lanes: emptyLanes(slots),
    queue: state.requests.map((_, i) => i),
    finish: state.requests.map(() => 0),
    ghost,
    step: 0,
    idle: 0,
    used: 0,
    cells: 0,
    pct: 0,
  });

  return {
    onInit(initialData) {
      const d = rec(initialData);
      stepMs = num(d?.stepMs, 400);
      state = { ...state, requests: readRequests(d?.requests) };
      push(fresh(num(d?.slots, 0), []), null, 0);
    },

    onEvent(event) {
      const p = rec(event.payload);
      switch (event.type) {
        case 'phase': {
          const name = typeof p?.phase === 'string' ? p.phase : null;
          panel?.highlightPhase?.(name);
          return;
        }
        case 'setup': {
          const slots = num(p?.slots);
          push(fresh(slots, nums(p?.ghost)), { kind: 'setup', policy: num(p?.policy), slots });
          return;
        }
        case 'batch-formed':
        case 'refill': {
          const ms = moves(p?.moves);
          const nextLanes = event.type === 'batch-formed' ? emptyLanes(state.slots) : [...state.lanes];
          const taken = new Set(ms.map((m) => m.req));
          for (const m of ms) nextLanes[m.slot] = { req: m.req, done: 0, pad: 0 };
          const next = { ...state, lanes: nextLanes, queue: state.queue.filter((r) => !taken.has(r)) };
          if (event.type === 'refill' || ms.length === 0) {
            push(next, { kind: 'refill', moves: ms });
            return;
          }
          push(next, {
            kind: 'form',
            batch: num(p?.batch) + 1,
            first: ms[0]!.req,
            last: ms[ms.length - 1]!.req,
            longest: num(p?.longest),
            len: num(p?.len),
          });
          return;
        }
        case 'step': {
          const step = num(p?.step);
          push(
            {
              ...state,
              lanes: lanes(p?.lanes),
              step,
              idle: num(p?.idle),
              used: num(p?.used),
              cells: num(p?.cells),
              pct: num(p?.pct),
            },
            { kind: 'step', step, active: num(p?.active), slots: state.slots },
          );
          return;
        }
        case 'batch-returned':
        case 'release': {
          const items = finishes(p?.items);
          const finish = [...state.finish];
          const nextLanes = [...state.lanes];
          for (const it of items) {
            finish[it.req] = it.finish;
            nextLanes[it.slot] = { req: -1, done: 0, pad: 0 };
          }
          const step = num(p?.step);
          const reqs = items.map((it) => it.req);
          push(
            {
              ...state,
              finish,
              // 묶어서 기다림은 돌려받은 뒤에도 그 묶음의 칸(빈칸까지)을 흐리게 남긴다 — 다음 묶음이 앉을 때 지워진다.
              lanes: event.type === 'batch-returned' ? state.lanes.map((l) => ({ ...l, gone: true })) : nextLanes,
            },
            event.type === 'batch-returned' ? { kind: 'return', step, reqs } : { kind: 'release', step, reqs },
          );
          return;
        }
        case 'done': {
          push(state, { kind: 'done', steps: num(p?.steps), idle: num(p?.idle), cells: num(p?.cells) });
          return;
        }
        default:
          return;
      }
    },

    onReset() {
      panel?.clearHighlight?.();
    },
  };
};
