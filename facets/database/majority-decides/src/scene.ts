/**
 * majorityDecides 장면 — 이벤트를 잇기만 한다. 과반 판정은 알고리즘이 했다 (`ack.effect`).
 *
 * - 바탕: 리더 · term · 명령 · 팔로워(멈춤 여부) — `initial()` 이 initialData 에서,
 *         노드 수 · 과반 — silent `init` 이 채운다
 * - 자취: 리더 로그 칸 · 사본 목록(닿은 차례) · 보낸 곳 · 닿지 않는 곳 · 확정 시각 · 끝까지 조용한 노드
 * - 이번 걸음: `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type MajorityFollower = { id: string; stopped: boolean };
export type MajorityCopy = { node: string; ms: number };
export type MajorityEntry = { index: number; term: number; cmd: string; ms: number };

export type MajorityStep =
  | { kind: 'start' }
  | { kind: 'write' }
  | { kind: 'send'; ms: number }
  | { kind: 'ack'; node: string; ms: number; effect: 'rise' | 'commit' | 'late' }
  | { kind: 'settle' };

export type MajorityDecidesScene = {
  base: {
    leader: string;
    term: number;
    cmd: string;
    followers: MajorityFollower[];
    total: number | null;
    majority: number | null;
  };
  entry: MajorityEntry | null;
  copies: MajorityCopy[];
  sent: string[];
  lost: string[];
  committedAt: number | null;
  silent: string[];
  step: MajorityStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(p: Record<string, unknown>, key: string, where: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`majorityDecidesScene: ${where}.${key} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string, where: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`majorityDecidesScene: ${where}.${key} 가 글자가 아니다`);
  return v;
}

function strList(p: Record<string, unknown>, key: string, where: string): string[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`majorityDecidesScene: ${where}.${key} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`majorityDecidesScene: ${where}.${key} 에 글자 아닌 것`);
    return x;
  });
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`majorityDecidesScene: ${event.type} 의 payload 가 없다`);
  return event.payload;
}

export const majorityDecidesScene: ScenePlan<MajorityDecidesScene> = {
  initial(initialData: unknown): MajorityDecidesScene {
    if (!isRecord(initialData)) throw new Error('majorityDecidesScene: initialData 가 없다');
    const leader = str(initialData, 'leader', 'initialData');
    const term = num(initialData, 'term', 'initialData');
    const write = initialData['write'];
    if (!isRecord(write)) throw new Error('majorityDecidesScene: initialData.write 가 없다');
    const cmd = str(write, 'cmd', 'write');
    const nodes = initialData['nodes'];
    if (!Array.isArray(nodes)) throw new Error('majorityDecidesScene: initialData.nodes 가 목록이 아니다');
    const followers: MajorityFollower[] = [];
    for (const n of nodes) {
      if (!isRecord(n)) throw new Error('majorityDecidesScene: 노드 모양이 틀렸다');
      const id = str(n, 'id', 'node');
      if (id === leader) continue;
      followers.push({ id, stopped: n['stopped'] === true });
    }
    return {
      base: { leader, term, cmd, followers, total: null, majority: null },
      entry: null,
      copies: [],
      sent: [],
      lost: [],
      committedAt: null,
      silent: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: MajorityDecidesScene, event: FacetRuntimeEvent): MajorityDecidesScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        return {
          ...scene,
          base: { ...scene.base, total: num(p, 'total', 'init'), majority: num(p, 'majority', 'init') },
        };
      }
      case 'write': {
        const p = payloadOf(event);
        const ms = num(p, 'ms', 'write');
        const node = str(p, 'node', 'write');
        return {
          ...scene,
          entry: { index: num(p, 'index', 'write'), term: num(p, 'term', 'write'), cmd: str(p, 'cmd', 'write'), ms },
          copies: [...scene.copies, { node, ms }],
          step: { kind: 'write' },
        };
      }
      case 'send': {
        const p = payloadOf(event);
        return {
          ...scene,
          sent: strList(p, 'to', 'send'),
          lost: strList(p, 'lost', 'send'),
          step: { kind: 'send', ms: num(p, 'ms', 'send') },
        };
      }
      case 'ack': {
        const p = payloadOf(event);
        const ms = num(p, 'ms', 'ack');
        const node = str(p, 'node', 'ack');
        const effect = p['effect'];
        if (effect !== 'rise' && effect !== 'commit' && effect !== 'late') {
          throw new Error(`majorityDecidesScene: ack.effect 를 모른다 — ${String(effect)}`);
        }
        return {
          ...scene,
          copies: [...scene.copies, { node, ms }],
          committedAt: effect === 'commit' ? ms : scene.committedAt,
          step: { kind: 'ack', node, ms, effect },
        };
      }
      case 'settle': {
        const p = payloadOf(event);
        return { ...scene, silent: strList(p, 'silent', 'settle'), step: { kind: 'settle' } };
      }
      default:
        throw new Error(`majorityDecidesScene: 모르는 이벤트 — ${event.type}`);
    }
  },
};
