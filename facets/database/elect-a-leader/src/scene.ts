/**
 * elect-a-leader 장면.
 *
 * 바탕 — 노드 다섯과 각자의 타이머 값 (initialData 에서 베낀다).
 * 자취 — 지금 시각 · 노드마다 역할 · term · 마감, 후보와 그에게 닿은 표, 주고서 아직 닿지 않은 표.
 * 이번 걸음 — `step`. 시계가 흐르기 시작한 시각(`was`)과 다시 채우기 전의 마감(`before`)을 계기값으로 싣는다.
 *
 * 셈(누가 먼저 바닥나는가 · 과반에 닿았는가)은 알고리즘이 했다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type ElectRole = 'follower' | 'candidate' | 'leader';

export type ElectNodeState = {
  id: string;
  timeoutMs: number;
  role: ElectRole;
  term: number;
  /** 선출 타이머의 마감 시각. 리더에게는 없다. */
  deadline: number | null;
};

export type Refill = { node: string; before: number; deadline: number };

export type ElectStep =
  | { kind: 'start' }
  | { kind: 'timeout'; at: number; was: number; node: string; term: number; beforeTerm: number }
  | { kind: 'grant'; at: number; was: number; from: string; refills: Refill[] }
  | { kind: 'vote'; at: number; was: number; from: string; to: string; votes: number }
  | { kind: 'leader'; at: number; was: number; from: string; to: string; votes: number; term: number; before: number }
  | { kind: 'extra'; at: number; was: number; froms: string[]; to: string; votes: number; term: number }
  | { kind: 'heartbeat'; at: number; was: number; leader: string; refills: Refill[] };

export type ElectScene = {
  now: number;
  nodes: ElectNodeState[];
  candidate: string | null;
  majority: number | null;
  /** 후보에게 닿은 표, 닿은 차례 (제 표가 첫째) */
  ballots: string[];
  /** 주었지만 아직 후보에게 닿지 않은 표 — 준 노드 식별자 */
  inFlight: string[];
  step: ElectStep;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`elect-a-leader 장면: ${what} 이 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`elect-a-leader 장면: ${key} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`elect-a-leader 장면: ${key} 가 글자가 아니다`);
  return v;
}

function list(o: Record<string, unknown>, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`elect-a-leader 장면: ${key} 가 목록이 아니다`);
  return v;
}

function findNode(scene: ElectScene, id: string): ElectNodeState {
  const n = scene.nodes.find((x) => x.id === id);
  if (n === undefined) throw new Error(`elect-a-leader 장면: 모르는 노드 ${id}`);
  return n;
}

function withNode(scene: ElectScene, id: string, patch: Partial<ElectNodeState>): ElectNodeState[] {
  findNode(scene, id);
  return scene.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
}

function refillsOf(scene: ElectScene, items: unknown[]): Refill[] {
  return items.map((item) => {
    const o = rec(item, '다시 채우기');
    const node = str(o, 'node');
    const before = findNode(scene, node).deadline;
    if (before === null) throw new Error(`elect-a-leader 장면: ${node} 에게 채울 타이머가 없다`);
    return { node, before, deadline: num(o, 'deadline') };
  });
}

function applyRefills(nodes: ElectNodeState[], refills: Refill[], term: number | null): ElectNodeState[] {
  return nodes.map((n) => {
    const r = refills.find((x) => x.node === n.id);
    if (r === undefined) return n;
    return { ...n, role: 'follower', deadline: r.deadline, term: term ?? n.term };
  });
}

/** initialData 를 좁혀 걸음 0 을 세운다 — 모두 팔로워, 마감은 0 ms + 제 타이머 값. */
export function electInitial(initialData: unknown): ElectScene {
  const d = rec(initialData, 'initialData');
  const term = num(d, 'term');
  const nodes = list(d, 'nodes').map((item) => {
    const o = rec(item, '노드');
    const timeoutMs = num(o, 'timeoutMs');
    return { id: str(o, 'id'), timeoutMs, role: 'follower' as const, term, deadline: timeoutMs };
  });
  return { now: 0, nodes, candidate: null, majority: null, ballots: [], inFlight: [], step: { kind: 'start' } };
}

export const electALeaderScene: ScenePlan<ElectScene> = {
  initial: electInitial,
  reduce(scene: ElectScene, event: FacetRuntimeEvent): ElectScene {
    const p = rec(event.payload, `${event.type} 의 payload`);
    const at = num(p, 'at');
    const was = scene.now;
    switch (event.type) {
      case 'timeout': {
        const node = str(p, 'node');
        const term = num(p, 'term');
        const beforeTerm = findNode(scene, node).term;
        return {
          ...scene,
          now: at,
          nodes: withNode(scene, node, { role: 'candidate', term, deadline: num(p, 'deadline') }),
          candidate: node,
          majority: num(p, 'majority'),
          ballots: [node],
          inFlight: [],
          step: { kind: 'timeout', at, was, node, term, beforeTerm },
        };
      }
      case 'grant': {
        const from = str(p, 'from');
        const term = num(p, 'term');
        const refills = refillsOf(scene, list(p, 'voters'));
        return {
          ...scene,
          now: at,
          nodes: applyRefills(scene.nodes, refills, term),
          inFlight: [...scene.inFlight, ...refills.map((r) => r.node)],
          step: { kind: 'grant', at, was, from, refills },
        };
      }
      case 'vote': {
        const from = str(p, 'from');
        const to = str(p, 'to');
        return {
          ...scene,
          now: at,
          ballots: [...scene.ballots, from],
          inFlight: scene.inFlight.filter((x) => x !== from),
          step: { kind: 'vote', at, was, from, to, votes: num(p, 'votes') },
        };
      }
      case 'leader': {
        const from = str(p, 'from');
        const to = str(p, 'to');
        const before = findNode(scene, to).deadline;
        if (before === null) throw new Error(`elect-a-leader 장면: 후보 ${to} 에게 타이머가 없다`);
        return {
          ...scene,
          now: at,
          nodes: withNode(scene, to, { role: 'leader', deadline: null }),
          ballots: [...scene.ballots, from],
          inFlight: scene.inFlight.filter((x) => x !== from),
          step: { kind: 'leader', at, was, from, to, votes: num(p, 'votes'), term: num(p, 'term'), before },
        };
      }
      case 'extra': {
        const froms = list(p, 'froms').map((x) => {
          if (typeof x !== 'string') throw new Error('elect-a-leader 장면: froms 에 글자 아닌 것');
          return x;
        });
        return {
          ...scene,
          now: at,
          ballots: [...scene.ballots, ...froms],
          inFlight: scene.inFlight.filter((x) => !froms.includes(x)),
          step: { kind: 'extra', at, was, froms, to: str(p, 'to'), votes: num(p, 'votes'), term: num(p, 'term') },
        };
      }
      case 'heartbeat': {
        const leader = str(p, 'leader');
        const term = num(p, 'term');
        const refills = refillsOf(scene, list(p, 'receivers'));
        return {
          ...scene,
          now: at,
          nodes: applyRefills(scene.nodes, refills, term),
          step: { kind: 'heartbeat', at, was, leader, refills },
        };
      }
      default:
        throw new Error(`elect-a-leader 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
