/**
 * mac-is-local 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 했다.
 *
 * 바탕: 지나는 차례 · 링크 · 인터페이스(init 이 한 번 정한다)
 * 자취: 패킷이 선 자리 · 패킷에 붙은 MAC 쌍 · 링크마다 남겨진 MAC 쌍 · 마지막 셈
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type MacIsLocalPort = { node: string; link: string; mac: string };

export type MacIsLocalPair = { hop: number; link: string; srcMac: string; dstMac: string };

export type MacIsLocalBase = {
  path: string[];
  links: string[];
  ports: MacIsLocalPort[];
  srcIp: string;
  dstIp: string;
};

export type MacIsLocalTally = { links: number; macPairs: number; macs: number; ipPairs: number };

export type MacIsLocalStep =
  | { kind: 'hold' }
  | { kind: 'frame'; hop: number; from: number; to: number; attach: boolean; final: boolean }
  | { kind: 'swap'; at: number; left: number; hop: number }
  | { kind: 'deliver'; at: number; left: number };

export type MacIsLocalSceneState = {
  base: MacIsLocalBase | null;
  /** 패킷이 선 장치 (path 의 번호) */
  at: number;
  /** 패킷의 IP 쌍 */
  ip: { src: string; dst: string } | null;
  /** 지금 패킷에 붙은 MAC 쌍 */
  pair: MacIsLocalPair | null;
  /** 링크마다 남겨진 MAC 쌍 (남겨진 차례) */
  stranded: MacIsLocalPair[];
  tally: MacIsLocalTally | null;
  step: MacIsLocalStep;
};

function rec(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error('mac-is-local 장면: payload 가 객체가 아니다');
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number') throw new Error(`mac-is-local 장면: ${k} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`mac-is-local 장면: ${k} 가 글자가 아니다`);
  return v;
}

function bool(o: Record<string, unknown>, k: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Error(`mac-is-local 장면: ${k} 가 참거짓이 아니다`);
  return v;
}

function strList(o: Record<string, unknown>, k: string): string[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`mac-is-local 장면: ${k} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`mac-is-local 장면: ${k} 의 칸이 글자가 아니다`);
    return x;
  });
}

function pairOf(o: Record<string, unknown>): MacIsLocalPair {
  return { hop: num(o, 'hop'), link: str(o, 'link'), srcMac: str(o, 'srcMac'), dstMac: str(o, 'dstMac') };
}

export const macIsLocalScene: ScenePlan<MacIsLocalSceneState> = {
  initial(): MacIsLocalSceneState {
    return { base: null, at: 0, ip: null, pair: null, stranded: [], tally: null, step: { kind: 'hold' } };
  },

  reduce(scene: MacIsLocalSceneState, event: FacetRuntimeEvent): MacIsLocalSceneState {
    switch (event.type) {
      case 'init': {
        const p = rec(event.payload);
        const rawPorts = p['ports'];
        if (!Array.isArray(rawPorts)) throw new Error('mac-is-local 장면: ports 가 목록이 아니다');
        const ports = rawPorts.map((x) => {
          const o = rec(x);
          return { node: str(o, 'node'), link: str(o, 'link'), mac: str(o, 'mac') };
        });
        const srcIp = str(p, 'srcIp');
        const dstIp = str(p, 'dstIp');
        return {
          base: { path: strList(p, 'path'), links: strList(p, 'links'), ports, srcIp, dstIp },
          at: 0,
          ip: { src: srcIp, dst: dstIp },
          pair: null,
          stranded: [],
          tally: null,
          step: { kind: 'hold' },
        };
      }
      case 'frame': {
        const p = rec(event.payload);
        const pair = pairOf(p);
        const attach = scene.pair === null;
        return {
          ...scene,
          at: num(p, 'to'),
          ip: { src: str(p, 'srcIp'), dst: str(p, 'dstIp') },
          pair,
          step: {
            kind: 'frame',
            hop: pair.hop,
            from: num(p, 'from'),
            to: num(p, 'to'),
            attach,
            final: bool(p, 'final'),
          },
        };
      }
      case 'swap': {
        const p = rec(event.payload);
        const was = scene.pair;
        if (was === null) throw new Error('mac-is-local 장면: 남길 MAC 쌍이 없다');
        const pair = pairOf(p);
        return {
          ...scene,
          at: num(p, 'at'),
          pair,
          stranded: [...scene.stranded, was],
          step: { kind: 'swap', at: num(p, 'at'), left: num(p, 'left'), hop: pair.hop },
        };
      }
      case 'deliver': {
        const p = rec(event.payload);
        const was = scene.pair;
        if (was === null) throw new Error('mac-is-local 장면: 남길 MAC 쌍이 없다');
        return {
          ...scene,
          at: num(p, 'at'),
          pair: null,
          stranded: [...scene.stranded, was],
          tally: {
            links: num(p, 'links'),
            macPairs: num(p, 'macPairs'),
            macs: num(p, 'macs'),
            ipPairs: num(p, 'ipPairs'),
          },
          step: { kind: 'deliver', at: num(p, 'at'), left: num(p, 'left') },
        };
      }
      default:
        throw new Error(`mac-is-local 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
