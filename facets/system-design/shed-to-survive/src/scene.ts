/**
 * shed-to-survive 의 장면 — 알고리즘의 틱 이벤트를 잇기만 한다. 셈은 다시 돌리지 않는다.
 *
 * 바탕  base    — 도착 묶음 · 받는 차례 · 기한 · 한도 · 거절 코드 (initialData)
 * 자취  counts · tick · arrived · accept · shed — 틱이 쌓는 것
 * 이번  step    — 이번 틱에 움직인 것 (몫을 받은 요청 · 떠난 손님 · 받은 것 · 거절한 것)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowShedData, requestOrder } from './algorithm';

export type AcceptState = 'run' | 'gone' | 'ok' | 'wasted';

export type AcceptRow = { id: string; done: number; state: AcceptState; age: number };
export type HoldRow = { id: string; done: number; state: 'run' | 'gone'; age: number };
export type Worked = { id: string; was: number; done: number };

export type SideStep = {
  split: number;
  worked: Worked[];
  finished: string[];
  wasted: string[];
  left: string[];
  took: string[];
  rejected: string[];
};

export type ShedStep = {
  tick: number;
  accept: SideStep;
  shed: SideStep;
};

export type ShedToSurviveScene = {
  base: {
    groups: { tick: number; ids: string[] }[];
    ids: string[];
    deadline: number;
    limit: number;
    code: string;
  };
  /** init 이 온 뒤에만 선다 */
  counts: {
    accept: { held: number; ok: number; gone: number };
    shed: { held: number; ok: number; rej: number };
  } | null;
  tick: number | null;
  last: boolean;
  /** 도착한 요청 (두 서버가 같은 도착을 받는다) */
  arrived: string[];
  /** 다 받는 쪽이 들고 있거나 들었던 요청 (받은 차례) */
  accept: AcceptRow[];
  /** 거절하는 쪽 */
  shed: { holding: HoldRow[]; finished: string[]; rejected: string[] };
  summary: { accept: number; shed: number; total: number } | null;
  step: ShedStep | null;
};

// ── 좁히개 ──────────────────────────────────────────────────────────

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`shed-to-survive 장면: ${path} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`shed-to-survive 장면: ${path} 가 수가 아니다`);
  return v;
}
function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`shed-to-survive 장면: ${path} 가 참거짓이 아니다`);
  return v;
}
function ids(v: unknown, path: string, known: Set<string>): string[] {
  if (!Array.isArray(v)) throw new Error(`shed-to-survive 장면: ${path} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string' || !known.has(x)) throw new Error(`shed-to-survive 장면: ${path}[${i}] 가 모르는 요청이다`);
    return x;
  });
}
function state(v: unknown, path: string): AcceptState {
  if (v === 'run' || v === 'gone' || v === 'ok' || v === 'wasted') return v;
  throw new Error(`shed-to-survive 장면: ${path} 가 모르는 상태다 (${String(v)})`);
}
function frac01(v: unknown, path: string): number {
  const n = num(v, path);
  if (n < 0 || n > 1) throw new Error(`shed-to-survive 장면: ${path} 가 0..1 밖이다 (${n})`);
  return n;
}
function rows(v: unknown, path: string, known: Set<string>): AcceptRow[] {
  if (!Array.isArray(v)) throw new Error(`shed-to-survive 장면: ${path} 가 배열이 아니다`);
  return v.map((x, i) => {
    const r = obj(x, `${path}[${i}]`);
    const [id] = ids([r.id], `${path}[${i}].id`, known);
    return {
      id: id as string,
      done: frac01(r.done, `${path}[${i}].done`),
      state: state(r.state, `${path}[${i}].state`),
      age: num(r.age, `${path}[${i}].age`),
    };
  });
}
function worked(v: unknown, path: string, known: Set<string>): Worked[] {
  if (!Array.isArray(v)) throw new Error(`shed-to-survive 장면: ${path} 가 배열이 아니다`);
  return v.map((x, i) => {
    const r = obj(x, `${path}[${i}]`);
    const [id] = ids([r.id], `${path}[${i}].id`, known);
    const was = frac01(r.was, `${path}[${i}].was`);
    const done = frac01(r.done, `${path}[${i}].done`);
    if (done <= was) throw new Error(`shed-to-survive 장면: ${path}[${i}] 의 누적이 늘지 않았다`);
    return { id: id as string, was, done };
  });
}
function side(p: Record<string, unknown>, path: string, known: Set<string>): SideStep {
  return {
    split: num(p.split, `${path}.split`),
    worked: worked(p.worked, `${path}.worked`, known),
    finished: ids(p.finished, `${path}.finished`, known),
    wasted: ids(p.wasted, `${path}.wasted`, known),
    left: ids(p.left, `${path}.left`, known),
    took: ids(p.took, `${path}.took`, known),
    rejected: ids(p.rejected, `${path}.rejected`, known),
  };
}

// ── 장면 ────────────────────────────────────────────────────────────

export const shedToSurviveScene: ScenePlan<ShedToSurviveScene> = {
  initial(initialData: unknown): ShedToSurviveScene {
    const data = narrowShedData(initialData);
    return {
      base: {
        groups: data.arrivals.map((g) => ({ tick: g.tick, ids: [...g.ids] })),
        ids: requestOrder(data),
        deadline: data.deadline,
        limit: data.limit,
        code: data.code,
      },
      counts: null,
      tick: null,
      last: false,
      arrived: [],
      accept: [],
      shed: { holding: [], finished: [], rejected: [] },
      summary: null,
      step: null,
    };
  },

  reduce(scene: ShedToSurviveScene, event: FacetRuntimeEvent): ShedToSurviveScene {
    const known = new Set(scene.base.ids);
    switch (event.type) {
      case 'init': {
        const p = obj(event.payload, 'init.payload');
        const a = obj(p.accept, 'init.payload.accept');
        const s = obj(p.shed, 'init.payload.shed');
        return {
          ...scene,
          counts: {
            accept: { held: num(a.held, 'init.accept.held'), ok: num(a.ok, 'init.accept.ok'), gone: num(a.gone, 'init.accept.gone') },
            shed: { held: num(s.held, 'init.shed.held'), ok: num(s.ok, 'init.shed.ok'), rej: num(s.rej, 'init.shed.rej') },
          },
          step: null,
        };
      }
      case 'tick': {
        if (scene.counts === null) throw new Error('shed-to-survive 장면: init 앞에 tick 이 왔다');
        if (scene.last) throw new Error('shed-to-survive 장면: 마지막 틱 뒤에 tick 이 왔다');
        const p = obj(event.payload, 'tick.payload');
        const tick = num(p.tick, 'tick.payload.tick');
        const expected = scene.tick === null ? 0 : scene.tick + 1;
        if (tick !== expected) throw new Error(`shed-to-survive 장면: tick.payload.tick 이 ${expected} 가 아니다 (${tick})`);
        const pa = obj(p.accept, 'tick.payload.accept');
        const ps = obj(p.shed, 'tick.payload.shed');
        const a = side(pa, 'tick.payload.accept', known);
        const s = side(ps, 'tick.payload.shed', known);

        // 두 서버는 같은 도착을 받는다
        const incoming = [...a.took, ...a.rejected].sort();
        const incomingB = [...s.took, ...s.rejected].sort();
        if (incoming.join(' ') !== incomingB.join(' ')) throw new Error('shed-to-survive 장면: 두 서버의 도착이 다르다');
        for (const id of incoming) {
          if (scene.arrived.includes(id)) throw new Error(`shed-to-survive 장면: ${id} 가 두 번 도착했다`);
        }
        if (a.rejected.length > 0) throw new Error('shed-to-survive 장면: 다 받는 쪽에 거절이 있다');

        const acceptRows = rows(pa.reqs, 'tick.payload.accept.reqs', known);
        const holdingAll = rows(ps.holding, 'tick.payload.shed.holding', known);
        const holding: HoldRow[] = holdingAll.map((r, i) => {
          if (r.state !== 'run' && r.state !== 'gone') throw new Error(`shed-to-survive 장면: tick.payload.shed.holding[${i}].state 가 들고 있는 상태가 아니다`);
          return { id: r.id, done: r.done, state: r.state, age: r.age };
        });
        if (holding.length > scene.base.limit) throw new Error('shed-to-survive 장면: 거절하는 쪽이 한도를 넘겨 들고 있다');

        const finished = [...scene.shed.finished, ...s.finished];
        const rejected = [...scene.shed.rejected, ...s.rejected];
        const ca = { held: num(pa.held, 'tick.accept.held'), ok: num(pa.ok, 'tick.accept.ok'), gone: num(pa.gone, 'tick.accept.gone') };
        const cs = { held: num(ps.held, 'tick.shed.held'), ok: num(ps.ok, 'tick.shed.ok'), rej: num(ps.rej, 'tick.shed.rej') };
        // 계기와 화면에 보일 것이 같은 수를 센다
        if (cs.ok !== finished.length) throw new Error('shed-to-survive 장면: tick.shed.ok 가 끝난 줄과 다르다');
        if (cs.rej !== rejected.length) throw new Error('shed-to-survive 장면: tick.shed.rej 가 거절 줄과 다르다');
        if (cs.held !== holding.length) throw new Error('shed-to-survive 장면: tick.shed.held 가 들고 있는 것과 다르다');
        const heldA = acceptRows.filter((r) => r.state === 'run' || r.state === 'gone').length;
        if (ca.held !== heldA) throw new Error('shed-to-survive 장면: tick.accept.held 가 들고 있는 것과 다르다');
        if (ca.ok !== acceptRows.filter((r) => r.state === 'ok').length) throw new Error('shed-to-survive 장면: tick.accept.ok');
        if (ca.gone !== acceptRows.filter((r) => r.state === 'gone' || r.state === 'wasted').length) {
          throw new Error('shed-to-survive 장면: tick.accept.gone');
        }

        const last = bool(p.last, 'tick.payload.last');
        let summary: ShedToSurviveScene['summary'] = null;
        if (last) {
          const sm = obj(p.summary, 'tick.payload.summary');
          summary = { accept: num(sm.accept, 'summary.accept'), shed: num(sm.shed, 'summary.shed'), total: num(sm.total, 'summary.total') };
        } else if (p.summary !== null) {
          throw new Error('shed-to-survive 장면: 마지막이 아닌 틱에 summary 가 있다');
        }

        return {
          ...scene,
          counts: { accept: ca, shed: cs },
          tick,
          last,
          arrived: [...scene.arrived, ...a.took],
          accept: acceptRows,
          shed: { holding, finished, rejected },
          summary,
          step: { tick, accept: a, shed: s },
        };
      }
      default:
        throw new Error(`shed-to-survive 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
