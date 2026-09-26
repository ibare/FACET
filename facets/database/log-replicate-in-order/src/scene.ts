/**
 * log-replicate-in-order 장면 — 이벤트를 잇기만 한다. 앞 칸 맞추기는 알고리즘이 셈했다.
 *
 * 바탕: 두 식별자 · 리더 로그 (initialData 에서 베낀다)
 * 자취: 팔로워 로그 · nextIndex · 보낸 물음들 · 잘려 나간 칸
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowLogData } from './algorithm.js';

export type SceneEntry = { index: number; term: number; cmd: string };

export type Probe = {
  prev: number;
  prevTerm: number;
  carried: SceneEntry[];
  verdict: 'pending' | 'reject' | 'match';
};

export type LogStep =
  | { kind: 'init'; nextIndex: number | null }
  | { kind: 'send'; prev: number; term: number; carried: number }
  | { kind: 'reject'; prev: number; have: number | null; want: number; from: number; to: number }
  | { kind: 'match'; prev: number; term: number; from: number; cut: number }
  | { kind: 'write'; index: number; term: number; cmd: string }
  | {
      kind: 'done';
      through: number;
      sent: number;
      rejected: number;
      deleted: number;
      written: number;
    };

export type LogScene = {
  leaderId: string;
  followerId: string;
  leader: SceneEntry[];
  follower: SceneEntry[];
  nextIndex: number | null;
  probes: Probe[];
  cut: SceneEntry[];
  written: number[];
  done: boolean;
  step: LogStep;
};

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`log-replicate-in-order 장면: ${type}.${key} 가 수가 아니다`);
  }
  return v;
}

function obj(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`log-replicate-in-order 장면: ${event.type} 에 payload 가 없다`);
  }
  return p as Record<string, unknown>;
}

function entries(p: Record<string, unknown>, key: string, type: string): SceneEntry[] {
  const raw = p[key];
  if (!Array.isArray(raw)) throw new Error(`log-replicate-in-order 장면: ${type}.${key} 가 배열이 아니다`);
  return raw.map((e: unknown) => {
    if (typeof e !== 'object' || e === null) {
      throw new Error(`log-replicate-in-order 장면: ${type}.${key} 의 칸이 객체가 아니다`);
    }
    const r = e as Record<string, unknown>;
    const cmd = r.cmd;
    if (typeof cmd !== 'string') throw new Error(`log-replicate-in-order 장면: ${type}.${key} 칸의 명령이 없다`);
    return { index: num(r, 'index', type), term: num(r, 'term', type), cmd };
  });
}

function lastProbe(scene: LogScene, type: string): Probe {
  const last = scene.probes[scene.probes.length - 1];
  if (last === undefined || last.verdict !== 'pending') {
    throw new Error(`log-replicate-in-order 장면: ${type} 앞에 기다리는 물음이 없다`);
  }
  return last;
}

export const logReplicateInOrderScene: ScenePlan<LogScene> = {
  initial(initialData: unknown): LogScene {
    const d = narrowLogData(initialData);
    const index = (e: { term: number; cmd: string }, i: number): SceneEntry => ({
      index: i + 1,
      term: e.term,
      cmd: e.cmd,
    });
    return {
      leaderId: d.leaderId,
      followerId: d.followerId,
      leader: d.leader.map(index),
      follower: d.follower.map(index),
      nextIndex: null,
      probes: [],
      cut: [],
      written: [],
      done: false,
      step: { kind: 'init', nextIndex: null },
    };
  },

  reduce(scene: LogScene, event: FacetRuntimeEvent): LogScene {
    switch (event.type) {
      case 'init': {
        const nextIndex = num(obj(event), 'nextIndex', 'init');
        return { ...scene, nextIndex, step: { kind: 'init', nextIndex } };
      }
      case 'send': {
        const p = obj(event);
        const prev = num(p, 'prev', 'send');
        const prevTerm = num(p, 'prevTerm', 'send');
        const carried = entries(p, 'entries', 'send');
        return {
          ...scene,
          probes: [...scene.probes, { prev, prevTerm, carried, verdict: 'pending' }],
          step: { kind: 'send', prev, term: prevTerm, carried: carried.length },
        };
      }
      case 'reject': {
        const p = obj(event);
        const last = lastProbe(scene, 'reject');
        const haveRaw = p.have;
        if (haveRaw !== null && typeof haveRaw !== 'number') {
          throw new Error('log-replicate-in-order 장면: reject.have 가 수도 null 도 아니다');
        }
        const to = num(p, 'to', 'reject');
        return {
          ...scene,
          nextIndex: to,
          probes: [...scene.probes.slice(0, -1), { ...last, verdict: 'reject' }],
          step: {
            kind: 'reject',
            prev: num(p, 'prev', 'reject'),
            have: haveRaw,
            want: num(p, 'want', 'reject'),
            from: num(p, 'from', 'reject'),
            to,
          },
        };
      }
      case 'match': {
        const p = obj(event);
        const last = lastProbe(scene, 'match');
        const prev = num(p, 'prev', 'match');
        const cut = entries(p, 'cut', 'match');
        const gone = new Set(cut.map((e) => e.index));
        return {
          ...scene,
          follower: scene.follower.filter((e) => !gone.has(e.index)),
          probes: [...scene.probes.slice(0, -1), { ...last, verdict: 'match' }],
          cut: [...scene.cut, ...cut],
          step: { kind: 'match', prev, term: num(p, 'term', 'match'), from: prev + 1, cut: cut.length },
        };
      }
      case 'write': {
        const p = obj(event);
        const index = num(p, 'index', 'write');
        const term = num(p, 'term', 'write');
        const cmd = p.cmd;
        if (typeof cmd !== 'string') throw new Error('log-replicate-in-order 장면: write.cmd 가 없다');
        if (index !== scene.follower.length + 1) {
          throw new Error(`log-replicate-in-order 장면: ${index} 번 칸은 팔로워 끝 다음이 아니다`);
        }
        return {
          ...scene,
          follower: [...scene.follower, { index, term, cmd }],
          written: [...scene.written, index],
          step: { kind: 'write', index, term, cmd },
        };
      }
      case 'done': {
        const p = obj(event);
        return {
          ...scene,
          done: true,
          step: {
            kind: 'done',
            through: num(p, 'through', 'done'),
            sent: num(p, 'sent', 'done'),
            rejected: num(p, 'rejected', 'done'),
            deleted: num(p, 'deleted', 'done'),
            written: num(p, 'written', 'done'),
          },
        };
      }
      default:
        throw new Error(`log-replicate-in-order 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
