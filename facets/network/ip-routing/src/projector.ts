/**
 * IpRouting Projector — algorithm 이벤트를 ip-routing-stage view 메서드로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 호스트 vs 라우터의 위상 차이 — 끝점/중간 노드 구별.
 *   2. 한 시점 한 라우터의 표만 펼침 + 안개 — 라우터의 시야 한계.
 *   3. 비트 단위 LPM 비교 + 일치 길이 게이지 — 가장 긴 일치가 이긴다.
 *   4. 헤더 카드 + TTL 카운트다운 — 정체성 보존과 수명의 사건성.
 *   5. 채택 행 → next-hop 시선 화살표 — 표 한 행 = 토폴로지 한 링크.
 *
 * 운동 시간 (ms) 은 algorithm 의 hopTimings 가 진실 — projector 는 보조적으로만
 * runtime.getSpeed() 보정 duration 을 전달한다.
 */

import type { ProjectorFactory } from '@facet/core/runtime';

type TopologyHost = { id: string; ip: string; x: number; y: number };
type TopologyRouter = {
  id: string;
  x: number;
  y: number;
  table: Array<{
    prefix: string;
    prefixLen: number;
    nextHop: string;
    iface: string;
  }>;
};
type TopologyLink = { id: string; from: string; to: string };

type IpRoutingStage = {
  reset(): void;
  init(payload: {
    hosts: TopologyHost[];
    routers: TopologyRouter[];
    links: TopologyLink[];
    defaultTtl: number;
    ttlWarnThreshold: number;
    autoDemoSequence: Array<{ dst: string; ttl: number; note?: string }>;
  }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { kind?: 'concept' | 'event'; duration?: number }): void;
  applyPacketSent(payload: {
    traceIndex: number;
    packet: { src: string; dst: string; ttl: number };
    fromHost: string;
    note?: string | null;
  }): void;
  applyPacketLinkSlide(
    payload: { traceIndex: number; fromNode: string; toNode: string },
    opts?: { duration?: number },
  ): Promise<void>;
  applyPacketArrived(payload: { traceIndex: number; atRouter: string }, opts?: { duration?: number }): Promise<void>;
  applyTableOpened(
    payload: { atRouter: string; dst: string; dstBits: string },
    opts?: { duration?: number },
  ): Promise<void>;
  applyLpmEvaluated(
    payload: {
      atRouter: string;
      rows: Array<{ rowIdx: number; matchLen: number; matched: boolean }>;
      adoptedRowIdx: number;
      nextHopNode: string | null;
      nextHopIface: string | null;
    },
    opts?: { duration?: number },
  ): Promise<void>;
  applySightArrow(
    payload: { fromRouter: string; toNode: string; iface: string },
    opts?: { duration?: number },
  ): Promise<void>;
  applyPacketDeparting(
    payload: {
      traceIndex: number;
      fromRouter: string;
      toNode: string;
      ttlBefore: number;
      ttlAfter: number;
    },
    opts?: { duration?: number },
  ): Promise<void>;
  applyTableClosed(payload: { atRouter: string }, opts?: { duration?: number }): Promise<void>;
  applyPacketDelivered(payload: {
    traceIndex: number;
    atHost: string;
    ttlRemaining: number;
  }): void;
  applyPacketDropped(payload: {
    traceIndex: number;
    atRouter: string;
    reason: 'ttl-zero' | 'no-route';
  }): void;
  applyPacketExternal(payload: {
    traceIndex: number;
    atRouter: string;
    viaInterface: string;
  }): void;
};

const BASE_CAPTION =
  'IP 라우팅은 한 패킷이 매 라우터에서 자기 표만 보고 next-hop 한 걸음을 정하며 TTL 한 칸씩만 깎이는 hop-by-hop 분산 결정이다.';

export const ipRoutingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as IpRoutingStage | undefined;

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },

    async onEvent(event) {
      if (!stage) return;
      const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as {
            hosts?: TopologyHost[];
            routers?: TopologyRouter[];
            links?: TopologyLink[];
            defaultTtl?: number;
            ttlWarnThreshold?: number;
            autoDemoSequence?: Array<{ dst: string; ttl: number; note?: string }>;
          };
          stage.init({
            hosts: Array.isArray(p.hosts) ? p.hosts : [],
            routers: Array.isArray(p.routers) ? p.routers : [],
            links: Array.isArray(p.links) ? p.links : [],
            defaultTtl: typeof p.defaultTtl === 'number' ? p.defaultTtl : 64,
            ttlWarnThreshold:
              typeof p.ttlWarnThreshold === 'number' ? p.ttlWarnThreshold : 4,
            autoDemoSequence: Array.isArray(p.autoDemoSequence) ? p.autoDemoSequence : [],
          });
          break;
        }

        case 'caption': {
          const p = (event.payload ?? {}) as {
            text?: string;
            kind?: 'concept' | 'event';
            durationMs?: number;
          };
          stage.setCaption(String(p.text ?? ''), {
            kind: p.kind,
            duration: p.durationMs,
          });
          break;
        }

        case 'packet-sent': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            packet?: { src?: string; dst?: string; ttl?: number };
            fromHost?: string;
            note?: string | null;
          };
          stage.applyPacketSent({
            traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
            packet: {
              src: String(p.packet?.src ?? ''),
              dst: String(p.packet?.dst ?? ''),
              ttl: typeof p.packet?.ttl === 'number' ? p.packet.ttl : 0,
            },
            fromHost: String(p.fromHost ?? ''),
            note: p.note ?? null,
          });
          break;
        }

        case 'packet-link-slide': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            fromNode?: string;
            toNode?: string;
          };
          await stage.applyPacketLinkSlide(
            {
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
              fromNode: String(p.fromNode ?? ''),
              toNode: String(p.toNode ?? ''),
            },
            { duration: 400 / speed },
          );
          break;
        }

        case 'packet-arrived': {
          const p = (event.payload ?? {}) as { traceIndex?: number; atRouter?: string };
          await stage.applyPacketArrived(
            {
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
              atRouter: String(p.atRouter ?? ''),
            },
            { duration: 200 / speed },
          );
          break;
        }

        case 'table-opened': {
          const p = (event.payload ?? {}) as {
            atRouter?: string;
            dst?: string;
            dstBits?: string;
          };
          await stage.applyTableOpened(
            {
              atRouter: String(p.atRouter ?? ''),
              dst: String(p.dst ?? ''),
              dstBits: String(p.dstBits ?? ''),
            },
            { duration: 250 / speed },
          );
          break;
        }

        case 'lpm-evaluated': {
          const p = (event.payload ?? {}) as {
            atRouter?: string;
            rows?: Array<{ rowIdx: number; matchLen: number; matched: boolean }>;
            adoptedRowIdx?: number;
            nextHopNode?: string | null;
            nextHopIface?: string | null;
          };
          await stage.applyLpmEvaluated(
            {
              atRouter: String(p.atRouter ?? ''),
              rows: Array.isArray(p.rows) ? p.rows : [],
              adoptedRowIdx: typeof p.adoptedRowIdx === 'number' ? p.adoptedRowIdx : -1,
              nextHopNode: p.nextHopNode ?? null,
              nextHopIface: p.nextHopIface ?? null,
            },
            { duration: 350 / speed },
          );
          break;
        }

        case 'sight-arrow': {
          const p = (event.payload ?? {}) as {
            fromRouter?: string;
            toNode?: string;
            iface?: string;
          };
          await stage.applySightArrow(
            {
              fromRouter: String(p.fromRouter ?? ''),
              toNode: String(p.toNode ?? ''),
              iface: String(p.iface ?? ''),
            },
            { duration: 250 / speed },
          );
          break;
        }

        case 'packet-departing': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            fromRouter?: string;
            toNode?: string;
            ttlBefore?: number;
            ttlAfter?: number;
          };
          await stage.applyPacketDeparting(
            {
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
              fromRouter: String(p.fromRouter ?? ''),
              toNode: String(p.toNode ?? ''),
              ttlBefore: typeof p.ttlBefore === 'number' ? p.ttlBefore : 0,
              ttlAfter: typeof p.ttlAfter === 'number' ? p.ttlAfter : 0,
            },
            { duration: 200 / speed },
          );
          break;
        }

        case 'table-closed': {
          const p = (event.payload ?? {}) as { atRouter?: string };
          await stage.applyTableClosed(
            { atRouter: String(p.atRouter ?? '') },
            { duration: 250 / speed },
          );
          break;
        }

        case 'packet-delivered': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            atHost?: string;
            ttlRemaining?: number;
          };
          stage.applyPacketDelivered({
            traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
            atHost: String(p.atHost ?? ''),
            ttlRemaining: typeof p.ttlRemaining === 'number' ? p.ttlRemaining : 0,
          });
          break;
        }

        case 'packet-dropped': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            atRouter?: string;
            reason?: 'ttl-zero' | 'no-route';
          };
          stage.applyPacketDropped({
            traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
            atRouter: String(p.atRouter ?? ''),
            reason: p.reason === 'no-route' ? 'no-route' : 'ttl-zero',
          });
          break;
        }

        case 'packet-external': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            atRouter?: string;
            viaInterface?: string;
          };
          stage.applyPacketExternal({
            traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
            atRouter: String(p.atRouter ?? ''),
            viaInterface: String(p.viaInterface ?? ''),
          });
          break;
        }

        default:
          // mode / phase 등 silent 메타 이벤트는 시각 변화 없음 — 의도적 drop.
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },
  };
};
