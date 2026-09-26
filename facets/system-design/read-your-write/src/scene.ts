import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { parseReadYourWriteData } from './algorithm.js';

export type RywReplica = { id: string; value: number; version: number };
export type RywClient = { id: string; token: number; seen: { value: number; replica: string }[] };
export type RywRefusal = { tick: number; client: string; replica: string };
/** 돌려보내진 읽기가 다음 사본 앞에서 기다린다 — 읽는 쪽 · 든 번호 · 기다리는 사본 앞 */
export type RywTicket = { client: string; token: number; at: string };

export type RywStep =
  | { kind: 'start' }
  | {
      kind: 'write';
      tick: number;
      client: string;
      replica: string;
      value: number;
      version: number;
      token: number;
      was: { value: number; version: number; token: number };
    }
  | {
      kind: 'refuse';
      tick: number;
      client: string;
      replica: string;
      replicaVersion: number;
      token: number;
      next: string;
      /** 읽기가 떠난 자리 — null 이면 클라이언트 손에서 */
      from: string | null;
    }
  | {
      kind: 'serve';
      tick: number;
      client: string;
      replica: string;
      replicaVersion: number;
      token: number;
      value: number;
      from: string | null;
    }
  | {
      kind: 'apply';
      tick: number;
      replica: string;
      source: string;
      value: number;
      version: number;
      was: { value: number; version: number };
    };

export type ReadYourWriteScene = {
  /** 바탕 */
  key: string;
  leader: string;
  /** 자취 */
  replicas: RywReplica[];
  clients: RywClient[];
  refusals: RywRefusal[];
  ticket: RywTicket | null;
  tick: number | null;
  /** 이어 온 이벤트 수 — 걸음 0 이 0. 그림이 앞 장면에서 바로 이어 왔는지 가르는 데 쓴다 */
  seq: number;
  /** 이번 걸음 */
  step: RywStep;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (!isRecord(p)) throw new Error(`read-your-write 장면: ${event.type} 의 payload 가 객체가 아니다`);
  return p;
}

function int(p: Record<string, unknown>, k: string, type: string): number {
  const v = p[k];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`read-your-write 장면: ${type}.payload.${k} 가 정수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, k: string, type: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`read-your-write 장면: ${type}.payload.${k} 가 문자열이 아니다`);
  return v;
}

function findReplica(scene: ReadYourWriteScene, id: string, where: string): RywReplica {
  const r = scene.replicas.find((x) => x.id === id);
  if (!r) throw new Error(`read-your-write 장면: ${where} 의 사본 ${id} 가 바탕에 없다`);
  return r;
}

function findClient(scene: ReadYourWriteScene, id: string, where: string): RywClient {
  const c = scene.clients.find((x) => x.id === id);
  if (!c) throw new Error(`read-your-write 장면: ${where} 의 클라이언트 ${id} 가 바탕에 없다`);
  return c;
}

/** 읽기가 이 사본에 오기 전 어디 있었나 — 기다리던 읽기가 있으면 그 자리, 없으면 새 읽기라 손에서 */
function readOrigin(scene: ReadYourWriteScene, client: string, replica: string, type: string): string | null {
  const ticket = scene.ticket;
  if (ticket === null) return null;
  if (ticket.client !== client) {
    throw new Error(`read-your-write 장면: ${type}.payload.client = ${client} 인데 기다리는 읽기는 ${ticket.client} 의 것이다`);
  }
  if (ticket.at !== replica) {
    throw new Error(`read-your-write 장면: ${type}.payload.replica = ${replica} 인데 읽기는 ${ticket.at} 앞에서 기다린다`);
  }
  return ticket.at;
}

function withReplica(scene: ReadYourWriteScene, id: string, value: number, version: number): RywReplica[] {
  return scene.replicas.map((r) => (r.id === id ? { id, value, version } : { ...r }));
}

function copyClients(scene: ReadYourWriteScene): RywClient[] {
  return scene.clients.map((c) => ({ id: c.id, token: c.token, seen: c.seen.map((s) => ({ ...s })) }));
}

export const readYourWriteScene: ScenePlan<ReadYourWriteScene> = {
  initial(initialData: unknown): ReadYourWriteScene {
    const data = parseReadYourWriteData(initialData);
    return {
      key: data.key,
      leader: data.leader,
      replicas: data.replicas.map((r) => ({ id: r.id, value: r.value, version: r.version })),
      clients: data.clients.map((c) => ({ id: c.id, token: c.token, seen: [] })),
      refusals: [],
      ticket: null,
      tick: null,
      seq: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: ReadYourWriteScene, event: FacetRuntimeEvent): ReadYourWriteScene {
    switch (event.type) {
      case 'write': {
        const p = payloadOf(event);
        const tick = int(p, 'tick', 'write');
        const client = str(p, 'client', 'write');
        const replica = str(p, 'replica', 'write');
        const value = int(p, 'value', 'write');
        const version = int(p, 'version', 'write');
        const token = int(p, 'token', 'write');
        if (replica !== scene.leader) throw new Error(`read-your-write 장면: write.payload.replica = ${replica} 는 리더가 아니다`);
        const before = findReplica(scene, replica, 'write.payload.replica');
        const writer = findClient(scene, client, 'write.payload.client');
        return {
          ...scene,
          replicas: withReplica(scene, replica, value, version),
          clients: copyClients(scene).map((c) => (c.id === client ? { ...c, token } : c)),
          refusals: scene.refusals.map((r) => ({ ...r })),
          ticket: scene.ticket ? { ...scene.ticket } : null,
          tick,
          seq: scene.seq + 1,
          step: {
            kind: 'write',
            tick,
            client,
            replica,
            value,
            version,
            token,
            was: { value: before.value, version: before.version, token: writer.token },
          },
        };
      }
      case 'refuse': {
        const p = payloadOf(event);
        const tick = int(p, 'tick', 'refuse');
        const client = str(p, 'client', 'refuse');
        const replica = str(p, 'replica', 'refuse');
        const replicaVersion = int(p, 'replicaVersion', 'refuse');
        const token = int(p, 'token', 'refuse');
        const next = str(p, 'next', 'refuse');
        const r = findReplica(scene, replica, 'refuse.payload.replica');
        findReplica(scene, next, 'refuse.payload.next');
        const reader = findClient(scene, client, 'refuse.payload.client');
        if (r.version !== replicaVersion) {
          throw new Error(`read-your-write 장면: refuse.payload.replicaVersion = ${replicaVersion} 인데 ${replica} 의 번호는 ${r.version}`);
        }
        if (reader.token !== token) {
          throw new Error(`read-your-write 장면: refuse.payload.token = ${token} 인데 ${client} 의 번호는 ${reader.token}`);
        }
        const from = readOrigin(scene, client, replica, 'refuse');
        return {
          ...scene,
          replicas: scene.replicas.map((x) => ({ ...x })),
          clients: copyClients(scene),
          refusals: [...scene.refusals.map((x) => ({ ...x })), { tick, client, replica }],
          ticket: { client, token, at: next },
          tick,
          seq: scene.seq + 1,
          step: { kind: 'refuse', tick, client, replica, replicaVersion, token, next, from },
        };
      }
      case 'serve': {
        const p = payloadOf(event);
        const tick = int(p, 'tick', 'serve');
        const client = str(p, 'client', 'serve');
        const replica = str(p, 'replica', 'serve');
        const replicaVersion = int(p, 'replicaVersion', 'serve');
        const token = int(p, 'token', 'serve');
        const value = int(p, 'value', 'serve');
        const r = findReplica(scene, replica, 'serve.payload.replica');
        const reader = findClient(scene, client, 'serve.payload.client');
        if (r.version !== replicaVersion || r.value !== value) {
          throw new Error(`read-your-write 장면: serve.payload 의 값 ${value} · 번호 ${replicaVersion} 이 ${replica} 의 ${r.value} · ${r.version} 와 다르다`);
        }
        if (reader.token !== token) {
          throw new Error(`read-your-write 장면: serve.payload.token = ${token} 인데 ${client} 의 번호는 ${reader.token}`);
        }
        const from = readOrigin(scene, client, replica, 'serve');
        return {
          ...scene,
          replicas: scene.replicas.map((x) => ({ ...x })),
          clients: copyClients(scene).map((c) => (c.id === client ? { ...c, seen: [...c.seen, { value, replica }] } : c)),
          refusals: scene.refusals.map((x) => ({ ...x })),
          ticket: null,
          tick,
          seq: scene.seq + 1,
          step: { kind: 'serve', tick, client, replica, replicaVersion, token, value, from },
        };
      }
      case 'apply': {
        const p = payloadOf(event);
        const tick = int(p, 'tick', 'apply');
        const replica = str(p, 'replica', 'apply');
        const source = str(p, 'source', 'apply');
        const value = int(p, 'value', 'apply');
        const version = int(p, 'version', 'apply');
        const before = findReplica(scene, replica, 'apply.payload.replica');
        findReplica(scene, source, 'apply.payload.source');
        if (scene.ticket !== null) throw new Error('read-your-write 장면: 읽기가 기다리는 중에 apply 가 왔다');
        return {
          ...scene,
          replicas: withReplica(scene, replica, value, version),
          clients: copyClients(scene),
          refusals: scene.refusals.map((x) => ({ ...x })),
          ticket: null,
          tick,
          seq: scene.seq + 1,
          step: { kind: 'apply', tick, replica, source, value, version, was: { value: before.value, version: before.version } },
        };
      }
      default:
        throw new Error(`read-your-write 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
