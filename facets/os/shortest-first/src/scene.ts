import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 바탕 — 프로세스 하나. 목록 차례가 곧 도착 차례다. */
export type ShortestFirstProcView = { id: string; arrive: number; burst: number };

export type ShortestFirstStep =
  | { kind: 'start' }
  | { kind: 'fcfs' }
  /** from: 당겨지기 전의 차례 — 운동의 출발점을 장면이 말한다 */
  | { kind: 'pull'; id: string; from: string[] }
  | { kind: 'compare' };

export type ShortestFirstScene = {
  /** 바탕 */
  procs: ShortestFirstProcView[];
  /** 자취 — 지금의 차례 (걸음 0 은 도착 목록 차례, 아직 차례로 서지 않았다) */
  order: string[];
  /** 자취 — 지금의 차례에서 각자의 대기. 걸음 0 은 null */
  waits: Record<string, number> | null;
  total: number | null;
  policy: 'none' | 'fcfs' | 'sjf';
  /** SJF 가 자리를 잡아 준 수 */
  placed: number;
  /** 도착 차례의 대기를 자리별로 — 마지막에 견준다 */
  fcfsBySlot: number[] | null;
  fcfsTotal: number | null;
  sjfTotal: number | null;
  /** 이번 걸음 */
  step: ShortestFirstStep;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function readIds(x: unknown, what: string): string[] {
  if (!Array.isArray(x)) throw new Error(`shortestFirstScene: ${what} 가 배열이 아니다`);
  return x.map((v) => {
    if (typeof v !== 'string') throw new Error(`shortestFirstScene: ${what} 에 문자열 아닌 것이 있다`);
    return v;
  });
}

function readNum(x: unknown, what: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`shortestFirstScene: ${what} 가 수가 아니다`);
  return x;
}

function readWaits(x: unknown, order: readonly string[]): Record<string, number> {
  if (!isRecord(x)) throw new Error('shortestFirstScene: waits 가 객체가 아니다');
  const out: Record<string, number> = {};
  for (const id of order) out[id] = readNum(x[id], `waits.${id}`);
  return out;
}

export const shortestFirstScene: ScenePlan<ShortestFirstScene> = {
  initial(initialData: unknown): ShortestFirstScene {
    if (!isRecord(initialData) || !Array.isArray(initialData.procs)) {
      throw new Error('shortestFirstScene: initialData.procs 가 없다');
    }
    const procs = initialData.procs.map((p, i): ShortestFirstProcView => {
      if (!isRecord(p) || typeof p.id !== 'string') throw new Error(`shortestFirstScene: procs[${i}] 의 모양이 틀렸다`);
      return { id: p.id, arrive: readNum(p.arrive, `procs[${i}].arrive`), burst: readNum(p.burst, `procs[${i}].burst`) };
    });
    return {
      procs,
      order: procs.map((p) => p.id),
      waits: null,
      total: null,
      policy: 'none',
      placed: 0,
      fcfsBySlot: null,
      fcfsTotal: null,
      sjfTotal: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: ShortestFirstScene, event: FacetRuntimeEvent): ShortestFirstScene {
    const p = event.payload;
    if (event.type === 'order') {
      if (!isRecord(p)) throw new Error('shortestFirstScene: order 의 payload 가 없다');
      const order = readIds(p.order, 'order');
      const waits = readWaits(p.waits, order);
      const total = readNum(p.total, 'total');
      return {
        ...scene,
        order,
        waits,
        total,
        policy: 'fcfs',
        fcfsBySlot: order.map((id) => waits[id] as number),
        fcfsTotal: total,
        step: { kind: 'fcfs' },
      };
    }
    if (event.type === 'pull') {
      if (!isRecord(p) || typeof p.id !== 'string') throw new Error('shortestFirstScene: pull 의 payload 가 틀렸다');
      const order = readIds(p.order, 'order');
      const slot = readNum(p.slot, 'slot');
      return {
        ...scene,
        order,
        waits: readWaits(p.waits, order),
        total: readNum(p.total, 'total'),
        policy: 'sjf',
        placed: slot + 1,
        step: { kind: 'pull', id: p.id, from: [...scene.order] },
      };
    }
    if (event.type === 'compare') {
      if (!isRecord(p)) throw new Error('shortestFirstScene: compare 의 payload 가 없다');
      return {
        ...scene,
        fcfsTotal: readNum(p.fcfsTotal, 'fcfsTotal'),
        sjfTotal: readNum(p.sjfTotal, 'sjfTotal'),
        step: { kind: 'compare' },
      };
    }
    throw new Error(`shortestFirstScene: 모르는 이벤트 ${event.type}`);
  },
};
