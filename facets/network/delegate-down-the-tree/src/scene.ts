/**
 * 장면 — 이벤트를 잇기만 한다. 누구를 묻고 어디로 넘길지는 알고리즘이 셈한다.
 *
 * 바탕: 찾는 이름 · 서버 표 · 서버마다의 층(위임을 따라 몇 번 내려간 자리)
 * 자취: 물은 서버 · 따라간 넘김 · 지금 맡은 마디 · 리졸버가 선 층 · 받은 답 · 건넨 답
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readDelegateData, zoneCovers, type DnsServer } from './algorithm.js';

export type DelegateStep =
  | { kind: 'start' }
  | { kind: 'clientAsk' }
  | { kind: 'query'; n: number; server: string }
  | {
      kind: 'referral';
      n: number;
      server: string;
      zone: string;
      ns: string;
      addr: string;
      /** 넘기기 전에 맡았던 마디 — 밑줄이 여기서 왼쪽으로 자란다 */
      wasZone: string;
    }
  | { kind: 'answer'; n: number; server: string; value: string }
  | { kind: 'reply'; value: string; queries: number; referrals: number };

export type DelegateFollowed = { server: string; zone: string; ns: string };

export type DelegateScene = {
  qname: string;
  qtype: string;
  servers: DnsServer[];
  /** servers 와 같은 차례. 처음 아는 서버가 0, 위임 한 번마다 1 */
  levels: number[];
  clientAsked: boolean;
  /** 리졸버가 다음에 물을(또는 방금 물은) 서버의 이름 */
  resolverAt: string;
  asked: string[];
  followed: DelegateFollowed[];
  /** 지금 이름에서 맡은 서버가 정해진 끝 부분. 처음은 루트 '.' */
  zone: string;
  answer: { server: string; value: string } | null;
  delivered: string | null;
  step: DelegateStep;
};

function need(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`delegateDownTheTreeScene: ${msg}`);
}

/** 위임을 따라 서버마다 층을 매긴다. 닿지 않는 서버가 있으면 던진다 */
function levelsOf(servers: DnsServer[], start: string): number[] {
  const levels = servers.map(() => -1);
  const startIdx = servers.findIndex((s) => s.name === start);
  need(startIdx >= 0, `처음 아는 서버가 없다: ${start}`);
  levels[startIdx] = 0;
  const queue = [startIdx];
  while (queue.length > 0) {
    const i = queue.shift();
    need(i !== undefined, '층 매기기 줄이 비었다');
    const server = servers[i];
    need(server !== undefined, `서버 ${i} 가 없다`);
    for (const d of server.delegations) {
      const j = servers.findIndex((s) => s.name === d.ns);
      need(j >= 0, `${server.name} 가 넘긴 ${d.ns} 가 표에 없다`);
      if (levels[j] === -1) {
        levels[j] = (levels[i] ?? 0) + 1;
        queue.push(j);
      }
    }
  }
  const lost = servers.filter((_, i) => levels[i] === -1).map((s) => s.name);
  need(lost.length === 0, `위임으로 닿지 않는 서버: ${lost.join(', ')}`);
  return levels;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  need(isRecord(p), `${event.type} 에 payload 가 없다`);
  return p;
}

function s(p: Record<string, unknown>, key: string, type: string): string {
  const v = p[key];
  need(typeof v === 'string', `${type}.${key} 가 문자열이 아니다`);
  return v;
}

function n(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  need(typeof v === 'number' && Number.isFinite(v), `${type}.${key} 가 수가 아니다`);
  return v;
}

export const delegateDownTheTreeScene: ScenePlan<DelegateScene> = {
  initial(initialData: unknown): DelegateScene {
    const data = readDelegateData(initialData);
    return {
      qname: data.qname,
      qtype: data.qtype,
      servers: data.servers,
      levels: levelsOf(data.servers, data.start),
      clientAsked: false,
      resolverAt: data.start,
      asked: [],
      followed: [],
      zone: '.',
      answer: null,
      delivered: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: DelegateScene, event: FacetRuntimeEvent): DelegateScene {
    switch (event.type) {
      case 'client-ask': {
        const p = payloadOf(event);
        need(s(p, 'qname', event.type) === scene.qname, '클라이언트가 묻는 이름이 다르다');
        return { ...scene, clientAsked: true, step: { kind: 'clientAsk' } };
      }
      case 'query': {
        const p = payloadOf(event);
        const server = s(p, 'server', event.type);
        need(server === scene.resolverAt, `리졸버가 서 있지 않은 서버를 묻는다: ${server}`);
        return {
          ...scene,
          asked: [...scene.asked, server],
          step: { kind: 'query', n: n(p, 'n', event.type), server },
        };
      }
      case 'referral': {
        const p = payloadOf(event);
        const server = s(p, 'server', event.type);
        const zone = s(p, 'zone', event.type);
        const ns = s(p, 'ns', event.type);
        need(zoneCovers(scene.qname, zone), `넘긴 마디가 이름의 끝과 맞지 않는다: ${zone}`);
        need(scene.servers.some((x) => x.name === ns), `넘겨받은 서버가 표에 없다: ${ns}`);
        return {
          ...scene,
          resolverAt: ns,
          followed: [...scene.followed, { server, zone, ns }],
          zone,
          step: {
            kind: 'referral',
            n: n(p, 'n', event.type),
            server,
            zone,
            ns,
            addr: s(p, 'addr', event.type),
            wasZone: scene.zone,
          },
        };
      }
      case 'answer': {
        const p = payloadOf(event);
        const server = s(p, 'server', event.type);
        const value = s(p, 'value', event.type);
        return {
          ...scene,
          answer: { server, value },
          zone: scene.qname,
          step: { kind: 'answer', n: n(p, 'n', event.type), server, value },
        };
      }
      case 'reply': {
        const p = payloadOf(event);
        const value = s(p, 'value', event.type);
        return {
          ...scene,
          delivered: value,
          step: {
            kind: 'reply',
            value,
            queries: n(p, 'queries', event.type),
            referrals: n(p, 'referrals', event.type),
          },
        };
      }
      default:
        throw new Error(`delegateDownTheTreeScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
