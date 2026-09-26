/**
 * split-brain 장면 — 알고리즘 이벤트를 이어 붙인다. 셈(과반 · 앞 칸 맞추기)은 다시 하지 않는다.
 *
 * 바탕: 노드 식별자와 차례 (initialData 에서 한 번)
 * 자취: 노드마다 역할 · term · 로그 · 확정 번호, 지금의 쪽 나눔
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SbEntry = { term: number; cmd: string };
export type SbRole = 'leader' | 'follower';
export type SbNode = { id: string; role: SbRole; term: number; log: SbEntry[]; commit: number };
export type SbLeader = { node: string; term: number };

export type SbStep =
  | { kind: 'start'; committed: { slot: number; entry: SbEntry; copies: number }[] }
  | { kind: 'partition'; at: number; majority: number }
  | {
      kind: 'elect';
      timeoutAt: number;
      candidate: string;
      term: number;
      voters: string[];
      leaderAt: number;
      majority: number;
    }
  | { kind: 'leaders'; leaders: SbLeader[] }
  | {
      kind: 'write';
      at: number;
      leader: string;
      term: number;
      cmd: string;
      index: number;
      holders: string[];
      majority: number;
      committed: boolean;
    }
  | { kind: 'heal'; at: number; leaders: SbLeader[]; was: number[] }
  | {
      kind: 'heartbeat';
      at: number;
      from: string;
      node: string;
      wasRole: SbRole;
      wasTerm: number;
      term: number;
      index: number;
      dropped: SbEntry[];
      written: SbEntry[];
    }
  | { kind: 'done'; leaders: string[]; same: number; commit: number; kept: SbEntry[] };

export type SplitBrainScene = {
  nodes: SbNode[];
  /** 노드 차례로 쪽 번호. 이어져 있으면 null */
  side: number[] | null;
  step: SbStep;
};

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function num(o: Rec, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`split-brain 장면: ${k} 가 수가 아니다`);
  return v;
}
function str(o: Rec, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`split-brain 장면: ${k} 가 글자가 아니다`);
  return v;
}
function bool(o: Rec, k: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Error(`split-brain 장면: ${k} 가 참거짓이 아니다`);
  return v;
}
function arr(o: Rec, k: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`split-brain 장면: ${k} 가 목록이 아니다`);
  return v;
}
function strs(o: Rec, k: string): string[] {
  return arr(o, k).map((v) => {
    if (typeof v !== 'string') throw new Error(`split-brain 장면: ${k} 에 글자 아닌 것`);
    return v;
  });
}
function nums(o: Rec, k: string): number[] {
  return arr(o, k).map((v) => {
    if (typeof v !== 'number') throw new Error(`split-brain 장면: ${k} 에 수 아닌 것`);
    return v;
  });
}
function entries(o: Rec, k: string): SbEntry[] {
  return arr(o, k).map((v) => {
    if (!isRec(v)) throw new Error(`split-brain 장면: ${k} 의 칸 모양이 틀렸다`);
    return { term: num(v, 'term'), cmd: str(v, 'cmd') };
  });
}
function leaders(o: Rec, k: string): SbLeader[] {
  return arr(o, k).map((v) => {
    if (!isRec(v)) throw new Error(`split-brain 장면: ${k} 의 리더 모양이 틀렸다`);
    return { node: str(v, 'node'), term: num(v, 'term') };
  });
}
function payloadOf(event: FacetRuntimeEvent): Rec {
  if (!isRec(event.payload)) throw new Error(`split-brain 장면: ${event.type} 에 payload 가 없다`);
  return event.payload;
}
function role(v: string): SbRole {
  if (v === 'leader' || v === 'follower') return v;
  throw new Error(`split-brain 장면: 모르는 역할 ${v}`);
}

/** 한 노드만 바꾼 새 목록. 모르는 노드면 던진다. */
function withNode(nodes: SbNode[], id: string, fn: (n: SbNode) => SbNode): SbNode[] {
  if (!nodes.some((n) => n.id === id)) throw new Error(`split-brain 장면: 모르는 노드 ${id}`);
  return nodes.map((n) => (n.id === id ? fn(n) : n));
}

export const splitBrainScene: ScenePlan<SplitBrainScene> = {
  initial(initialData: unknown): SplitBrainScene {
    // 자료 없이 마운트되는 자리(전수 검사)는 빈 장면
    if (!isRec(initialData) || initialData.nodes === undefined) return { nodes: [], side: null, step: { kind: 'start', committed: [] } };
    const ids = strs(initialData, 'nodes');
    const leader = str(initialData, 'leader');
    const term = num(initialData, 'term');
    const log = entries(initialData, 'log');
    const commit = num(initialData, 'commitIndex');
    return {
      nodes: ids.map((id) => ({
        id,
        role: id === leader ? 'leader' : 'follower',
        term,
        log: log.map((e) => ({ term: e.term, cmd: e.cmd })),
        commit,
      })),
      side: null,
      // 처음엔 모두가 같은 로그 · 같은 확정 번호를 든다 — 확정 칸마다 사본은 노드 수
      step: {
        kind: 'start',
        committed: log.slice(0, commit).map((e, j) => ({
          slot: j + 1,
          entry: { term: e.term, cmd: e.cmd },
          copies: ids.length,
        })),
      },
    };
  },

  reduce(scene: SplitBrainScene, event: FacetRuntimeEvent): SplitBrainScene {
    switch (event.type) {
      case 'partition': {
        const p = payloadOf(event);
        const side = nums(p, 'side');
        if (side.length !== scene.nodes.length) throw new Error('split-brain 장면: 쪽 수가 노드 수와 다르다');
        return { ...scene, side, step: { kind: 'partition', at: num(p, 'at'), majority: num(p, 'majority') } };
      }
      case 'elect': {
        const p = payloadOf(event);
        const candidate = str(p, 'candidate');
        const term = num(p, 'term');
        const voters = strs(p, 'voters');
        let nodes = withNode(scene.nodes, candidate, (n) => ({ ...n, role: 'leader', term }));
        for (const v of voters) nodes = withNode(nodes, v, (n) => ({ ...n, term }));
        return {
          ...scene,
          nodes,
          step: {
            kind: 'elect',
            timeoutAt: num(p, 'timeoutAt'),
            candidate,
            term,
            voters,
            leaderAt: num(p, 'leaderAt'),
            majority: num(p, 'majority'),
          },
        };
      }
      case 'leaders': {
        const p = payloadOf(event);
        return { ...scene, step: { kind: 'leaders', leaders: leaders(p, 'leaders') } };
      }
      case 'write': {
        const p = payloadOf(event);
        const leader = str(p, 'leader');
        const term = num(p, 'term');
        const cmd = str(p, 'cmd');
        const index = num(p, 'index');
        const holders = strs(p, 'holders');
        const committed = bool(p, 'committed');
        let nodes = scene.nodes;
        for (const h of holders) {
          nodes = withNode(nodes, h, (n) => ({
            ...n,
            log: [...n.log.slice(0, index - 1), { term, cmd }],
            commit: committed ? index : n.commit,
          }));
        }
        return {
          ...scene,
          nodes,
          step: { kind: 'write', at: num(p, 'at'), leader, term, cmd, index, holders, majority: num(p, 'majority'), committed },
        };
      }
      case 'heal': {
        const p = payloadOf(event);
        if (scene.side === null) throw new Error('split-brain 장면: 갈라지지 않았는데 이음이 붙는다');
        return {
          ...scene,
          side: null,
          step: { kind: 'heal', at: num(p, 'at'), leaders: leaders(p, 'leaders'), was: [...scene.side] },
        };
      }
      case 'heartbeat': {
        const p = payloadOf(event);
        const node = str(p, 'node');
        const term = num(p, 'term');
        const index = num(p, 'index');
        const written = entries(p, 'written');
        const commit = num(p, 'commit');
        const nodes = withNode(scene.nodes, node, (n) => ({
          ...n,
          role: 'follower',
          term,
          log: [...n.log.slice(0, index - 1), ...written],
          commit,
        }));
        return {
          ...scene,
          nodes,
          step: {
            kind: 'heartbeat',
            at: num(p, 'at'),
            from: str(p, 'from'),
            node,
            wasRole: role(str(p, 'wasRole')),
            wasTerm: num(p, 'wasTerm'),
            term,
            index,
            dropped: entries(p, 'dropped'),
            written,
          },
        };
      }
      case 'done': {
        const p = payloadOf(event);
        return {
          ...scene,
          step: {
            kind: 'done',
            leaders: strs(p, 'leaders'),
            same: num(p, 'same'),
            commit: num(p, 'commit'),
            kept: entries(p, 'kept'),
          },
        };
      }
      default:
        throw new Error(`split-brain 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
