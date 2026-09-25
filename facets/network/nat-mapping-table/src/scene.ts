/**
 * NAT 매핑 테이블의 장면.
 *
 * 바탕 — 공인 주소 · 안쪽 호스트 · 먼 쪽 호스트 · 표의 칸 수 (initialData 에서 베낀다)
 * 자취 — 적힌 줄 · 되돌려진 답 · 버려진 패킷 (걸음이 쌓는다)
 * 이번 걸음 — `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type NatEndpoint = { addr: string; port: number };

export type NatRow = { port: number; inside: NatEndpoint; remote: NatEndpoint };
export type NatReturned = { port: number; remote: NatEndpoint; inside: NatEndpoint };
export type NatDropped = { port: number; remote: NatEndpoint };

export type NatStep =
  | { kind: 'write'; port: number }
  | { kind: 'return'; port: number }
  | { kind: 'drop'; port: number };

export type NatMappingTableScene = {
  publicAddr: string;
  /** 안쪽 호스트 주소 — 나가는 차례에 처음 나온 순서 */
  insideHosts: string[];
  /** 먼 쪽 호스트 주소 — 나가는 · 들어오는 차례에 처음 나온 순서 */
  remoteHosts: string[];
  /** 표가 담을 수 있는 줄 수 (= 나가는 패킷 수) */
  capacity: number;
  rows: NatRow[];
  returned: NatReturned[];
  dropped: NatDropped[];
  step: NatStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readEndpoint(v: unknown, where: string): NatEndpoint {
  if (!isRecord(v) || typeof v.addr !== 'string' || typeof v.port !== 'number') {
    throw new Error(`${where}: 주소:포트 모양이 아니다`);
  }
  return { addr: v.addr, port: v.port };
}

function pushUnique(list: string[], v: string): void {
  if (!list.includes(v)) list.push(v);
}

function empty(): NatMappingTableScene {
  return {
    publicAddr: '',
    insideHosts: [],
    remoteHosts: [],
    capacity: 0,
    rows: [],
    returned: [],
    dropped: [],
    step: null,
  };
}

export const natMappingTableScene: ScenePlan<NatMappingTableScene> = {
  initial(initialData: unknown): NatMappingTableScene {
    if (!isRecord(initialData)) return empty();
    const outgoing = Array.isArray(initialData.outgoing) ? initialData.outgoing : [];
    const incoming = Array.isArray(initialData.incoming) ? initialData.incoming : [];
    const insideHosts: string[] = [];
    const remoteHosts: string[] = [];
    outgoing.forEach((o: unknown, i) => {
      if (!isRecord(o)) throw new Error(`outgoing[${i}]: 모양이 아니다`);
      pushUnique(insideHosts, readEndpoint(o.from, `outgoing[${i}].from`).addr);
      pushUnique(remoteHosts, readEndpoint(o.to, `outgoing[${i}].to`).addr);
    });
    incoming.forEach((o: unknown, i) => {
      if (!isRecord(o)) throw new Error(`incoming[${i}]: 모양이 아니다`);
      pushUnique(remoteHosts, readEndpoint(o.from, `incoming[${i}].from`).addr);
    });
    return {
      publicAddr: typeof initialData.publicAddr === 'string' ? initialData.publicAddr : '',
      insideHosts,
      remoteHosts,
      capacity: outgoing.length,
      rows: [],
      returned: [],
      dropped: [],
      step: null,
    };
  },

  reduce(scene: NatMappingTableScene, event: FacetRuntimeEvent): NatMappingTableScene {
    const p = event.payload;
    if (!isRecord(p) || typeof p.port !== 'number') return scene;
    const port = p.port;
    if (event.type === 'write') {
      const row: NatRow = {
        port,
        inside: readEndpoint(p.inside, 'write.inside'),
        remote: readEndpoint(p.remote, 'write.remote'),
      };
      return { ...scene, rows: [...scene.rows, row], step: { kind: 'write', port } };
    }
    if (event.type === 'return') {
      const r: NatReturned = {
        port,
        remote: readEndpoint(p.remote, 'return.remote'),
        inside: readEndpoint(p.inside, 'return.inside'),
      };
      return { ...scene, returned: [...scene.returned, r], step: { kind: 'return', port } };
    }
    if (event.type === 'drop') {
      const d: NatDropped = { port, remote: readEndpoint(p.remote, 'drop.remote') };
      return { ...scene, dropped: [...scene.dropped, d], step: { kind: 'drop', port } };
    }
    return scene;
  },
};
