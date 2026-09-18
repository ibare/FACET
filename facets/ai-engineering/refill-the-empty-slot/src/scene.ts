/**
 * 빈자리 채우기의 장면.
 *
 * 바탕 — `slots` · `requests` · `steps` (init 이 한 번 정한다)
 * 자취 — `queue`(남은 대기열) · `seats`(자리마다 앉은 요청) · `left`(요청마다 남은 토큰) · `cells`(칸-걸음 기록)
 * 이번 걸음 — `step` (채움 · 토큰 · 쉼 · 비움. 채움에는 대기열의 어디서 왔는지 `from` 을 싣는다)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type RefillCell = { slot: number; t: number; req: string | null };

export type RefillSceneStep = {
  t: number;
  /** `from` — 채우기 직전 대기열에서의 자리 (0 이 맨 앞) */
  fills: { slot: number; req: string; from: number }[];
  emits: { slot: number; req: string; left: number }[];
  idle: number[];
  finished: { slot: number; req: string }[];
};

export type RefillScene = {
  slots: number;
  requests: { id: string; tokens: number }[];
  steps: number;
  queue: string[];
  /** 자리 번호 - 1 → 앉은 요청 id 또는 null */
  seats: (string | null)[];
  left: Record<string, number>;
  cells: RefillCell[];
  step: RefillSceneStep | null;
};

function emptyScene(): RefillScene {
  return { slots: 0, requests: [], steps: 0, queue: [], seats: [], left: {}, cells: [], step: null };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readInit(p: unknown): Pick<RefillScene, 'slots' | 'requests' | 'steps'> | null {
  if (!isRecord(p)) return null;
  const { slots, requests, steps } = p;
  if (typeof slots !== 'number' || typeof steps !== 'number' || !Array.isArray(requests)) return null;
  const reqs: { id: string; tokens: number }[] = [];
  for (const r of requests) {
    if (!isRecord(r) || typeof r.id !== 'string' || typeof r.tokens !== 'number') return null;
    reqs.push({ id: r.id, tokens: r.tokens });
  }
  return { slots, requests: reqs, steps };
}

function readStep(p: unknown): Omit<RefillSceneStep, 'fills'> & { fills: { slot: number; req: string }[] } | null {
  if (!isRecord(p) || typeof p.t !== 'number') return null;
  const pairs = (v: unknown): { slot: number; req: string }[] => {
    const out: { slot: number; req: string }[] = [];
    if (!Array.isArray(v)) return out;
    for (const x of v) {
      if (isRecord(x) && typeof x.slot === 'number' && typeof x.req === 'string') {
        out.push({ slot: x.slot, req: x.req });
      }
    }
    return out;
  };
  const emits: RefillSceneStep['emits'] = [];
  if (Array.isArray(p.emits)) {
    for (const x of p.emits) {
      if (isRecord(x) && typeof x.slot === 'number' && typeof x.req === 'string' && typeof x.left === 'number') {
        emits.push({ slot: x.slot, req: x.req, left: x.left });
      }
    }
  }
  const idle = Array.isArray(p.idle) ? p.idle.filter((x): x is number => typeof x === 'number') : [];
  return { t: p.t, fills: pairs(p.fills), emits, idle, finished: pairs(p.finished) };
}

export const refillTheEmptySlotScene: ScenePlan<RefillScene> = {
  initial: () => emptyScene(),

  reduce(scene, event: FacetRuntimeEvent) {
    if (event.type === 'init') {
      const base = readInit(event.payload);
      if (base === null) return scene;
      const left: Record<string, number> = {};
      for (const r of base.requests) left[r.id] = r.tokens;
      return {
        ...base,
        queue: base.requests.map((r) => r.id),
        seats: Array.from({ length: base.slots }, () => null),
        left,
        cells: [],
        step: null,
      };
    }

    if (event.type === 'step') {
      const s = readStep(event.payload);
      if (s === null) return scene;
      const queue = [...scene.queue];
      const seats = [...scene.seats];
      const fills: RefillSceneStep['fills'] = [];
      for (const f of s.fills) {
        const from = queue.indexOf(f.req);
        if (from >= 0) queue.splice(from, 1);
        seats[f.slot - 1] = f.req;
        fills.push({ slot: f.slot, req: f.req, from: from < 0 ? 0 : from + fills.length });
      }
      const left = { ...scene.left };
      const cells = [...scene.cells];
      for (const e of s.emits) {
        left[e.req] = e.left;
        cells.push({ slot: e.slot, t: s.t, req: e.req });
      }
      for (const slot of s.idle) cells.push({ slot, t: s.t, req: null });
      for (const f of s.finished) seats[f.slot - 1] = null;
      return { ...scene, queue, seats, left, cells, step: { ...s, fills } };
    }

    return scene;
  },
};
