/**
 * rewrite-address-port 장면.
 *
 * 바탕 — 공인 주소, 첫 새 포트, 패킷마다 처음 보낸 이 · 받는 이 (initial 이 한 번 정한다)
 * 자취 — 패킷마다 지금 자리와 지금 보낸 이 칸의 값, 칸이 갈렸는지, NAT 가 다음에 내줄 포트
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readRewriteData, type Endpoint } from './algorithm.js';

export type PacketPlace = 'inside' | 'boundary' | 'outside';

export interface PacketState {
  /** 안쪽에서 보낸 그대로 (바탕) */
  original: Endpoint;
  dst: Endpoint;
  /** 지금 패킷에 적힌 보낸 이 */
  src: Endpoint;
  place: PacketPlace;
  addressSwapped: boolean;
  portSwapped: boolean;
}

export type RewriteStep =
  | { kind: 'start' }
  | { kind: 'arrive'; index: number }
  | { kind: 'address'; index: number; was: string; now: string }
  | { kind: 'port'; index: number; was: number; now: number };

export interface RewriteScene {
  publicAddress: string;
  firstPort: number;
  packets: PacketState[];
  nextPort: number;
  step: RewriteStep;
}

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('rewrite-address-port 장면: payload 가 없다');
  }
  return (payload as Record<string, unknown>)[key];
}

function num(payload: unknown, key: string): number {
  const v = field(payload, key);
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`rewrite-address-port 장면: payload.${key} 가 정수가 아니다`);
  }
  return v;
}

function str(payload: unknown, key: string): string {
  const v = field(payload, key);
  if (typeof v !== 'string') throw new Error(`rewrite-address-port 장면: payload.${key} 가 글자가 아니다`);
  return v;
}

function packetAt(scene: RewriteScene, index: number): PacketState {
  const p = scene.packets[index];
  if (!p) throw new Error(`rewrite-address-port 장면: 패킷 ${index} 가 없다`);
  return p;
}

function withPacket(scene: RewriteScene, index: number, next: PacketState): PacketState[] {
  return scene.packets.map((p, i) => (i === index ? next : p));
}

export const rewriteAddressPortScene: ScenePlan<RewriteScene> = {
  initial(initialData: unknown): RewriteScene {
    const data = readRewriteData(initialData);
    return {
      publicAddress: data.publicAddress,
      firstPort: data.firstPort,
      packets: data.packets.map((p) => ({
        original: { ...p.src },
        dst: { ...p.dst },
        src: { ...p.src },
        place: 'inside',
        addressSwapped: false,
        portSwapped: false,
      })),
      nextPort: data.firstPort,
      step: { kind: 'start' },
    };
  },

  reduce(scene: RewriteScene, event: FacetRuntimeEvent): RewriteScene {
    switch (event.type) {
      case 'arrive': {
        const index = num(event.payload, 'index');
        const p = packetAt(scene, index);
        return {
          ...scene,
          packets: withPacket(scene, index, { ...p, place: 'boundary' }),
          step: { kind: 'arrive', index },
        };
      }
      case 'rewrite-address': {
        const index = num(event.payload, 'index');
        const was = str(event.payload, 'was');
        const now = str(event.payload, 'now');
        const p = packetAt(scene, index);
        return {
          ...scene,
          packets: withPacket(scene, index, {
            ...p,
            src: { address: now, port: p.src.port },
            addressSwapped: true,
          }),
          step: { kind: 'address', index, was, now },
        };
      }
      case 'rewrite-port': {
        const index = num(event.payload, 'index');
        const was = num(event.payload, 'was');
        const now = num(event.payload, 'now');
        const next = num(event.payload, 'next');
        const p = packetAt(scene, index);
        return {
          ...scene,
          packets: withPacket(scene, index, {
            ...p,
            src: { address: p.src.address, port: now },
            portSwapped: true,
            place: 'outside',
          }),
          nextPort: next,
          step: { kind: 'port', index, was, now },
        };
      }
      default:
        throw new Error(`rewrite-address-port 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
