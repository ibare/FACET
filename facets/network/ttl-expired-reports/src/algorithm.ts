/**
 * TTL 만료 — 수명이 다하면 알려 준다.
 *
 * 보내는 이가 TTL 1 부터 하나씩 늘린 탐침을 보낸다. 길 위의 라우터는 패킷을 받으면
 * TTL 을 1 줄이고, 0 이 되면 버리고 ICMP 시간 초과(type 11 code 0)를 제 주소(들어온 쪽
 * 인터페이스)로 보낸 쪽에 돌려준다. 목적지는 넘기지 않으므로 TTL 을 줄이지 않고, 열린
 * 포트가 없어 ICMP 포트 닿을 수 없음(type 3 code 3)으로 답한다. 목적지의 답이 오면 멈춘다.
 *
 * 줄인 규약 — 탐침은 TTL 마다 하나(실제 traceroute 는 셋). 왕복 시간(RTT)은 다루지 않는다.
 * 받는 포트는 basePort 에서 시작해 탐침마다 1 씩 늘린다(예로 정한 값, traceroute 의 관례값).
 *
 * 이벤트
 * - `probe` (silent 아님) — 탐침 하나가 가서 답이 돌아오기까지가 한 걸음.
 *   payload: {
 *     ttl: number;              // 보낼 때의 TTL
 *     port: number;             // 받는 포트
 *     trail: number[];          // 지난 라우터마다 줄인 뒤의 TTL (라우터 차례대로)
 *     fate: 'expired' | 'arrived';
 *     at: number;               // expired: 버린 라우터의 차례(0 부터) · arrived: 라우터 수
 *     left: number;             // 목적지에 닿았을 때 남은 TTL (expired 면 0)
 *     from: string;             // 답을 보낸 주소
 *     icmpType: number;
 *     icmpCode: number;
 *   }
 * - `done` (silent 아님) — 목적지의 답이 와서 멈춘다.
 *   payload: { probes: number; routers: number }  // 보낸 탐침 수 · 시간 초과로 답한 라우터 수
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type IcmpKind = { type: number; code: number };

export type TtlRouter = { name: string; addr: string };

export type TtlExpiredReportsFacetData = {
  type: 'ttl-expired-reports';
  stepMs: number;
  sender: string;
  routers: TtlRouter[];
  destination: string;
  basePort: number;
  timeExceeded: IcmpKind;
  portUnreachable: IcmpKind;
};

function isIcmp(v: unknown): v is IcmpKind {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.type === 'number' && typeof o.code === 'number';
}

function narrow(data: unknown): TtlExpiredReportsFacetData {
  if (typeof data !== 'object' || data === null) throw new Error('ttl-expired-reports: 자료가 없다');
  const d = data as Record<string, unknown>;
  if (typeof d.stepMs !== 'number') throw new Error('ttl-expired-reports: stepMs 가 없다');
  if (typeof d.sender !== 'string') throw new Error('ttl-expired-reports: sender 가 없다');
  if (typeof d.destination !== 'string') throw new Error('ttl-expired-reports: destination 이 없다');
  if (typeof d.basePort !== 'number') throw new Error('ttl-expired-reports: basePort 가 없다');
  if (!isIcmp(d.timeExceeded)) throw new Error('ttl-expired-reports: timeExceeded 가 없다');
  if (!isIcmp(d.portUnreachable)) throw new Error('ttl-expired-reports: portUnreachable 이 없다');
  if (!Array.isArray(d.routers) || d.routers.length === 0) throw new Error('ttl-expired-reports: routers 가 비었다');
  const routers: TtlRouter[] = d.routers.map((r: unknown, i: number) => {
    if (typeof r !== 'object' || r === null) throw new Error(`ttl-expired-reports: routers[${i}] 모양이 틀렸다`);
    const o = r as Record<string, unknown>;
    if (typeof o.name !== 'string' || typeof o.addr !== 'string') {
      throw new Error(`ttl-expired-reports: routers[${i}] 에 name · addr 가 없다`);
    }
    return { name: o.name, addr: o.addr };
  });
  return {
    type: 'ttl-expired-reports',
    stepMs: d.stepMs,
    sender: d.sender,
    routers,
    destination: d.destination,
    basePort: d.basePort,
    timeExceeded: { ...d.timeExceeded },
    portUnreachable: { ...d.portUnreachable },
  };
}

export async function ttlExpiredReports(ctx0: FacetContext<TtlExpiredReportsFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<TtlExpiredReportsFacetData>;
  const data = narrow(ctx.data);
  const { stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 이 이미 길을 보여 주므로 첫 탐침 앞에 읽을 틈을 둔다.
  if (!(await pause())) return;

  // 탐침은 목적지에 닿으면 끝난다. 라우터가 n 이면 TTL n+1 이 늦어도 닿는다.
  const maxTtl = data.routers.length + 1;
  let expiredCount = 0;
  let probes = 0;
  let reached = false;

  for (let ttl0 = 1; ttl0 <= maxTtl; ttl0 += 1) {
    if (ctx.cancelled) return;
    const port = data.basePort + ttl0 - 1;
    let ttl = ttl0;
    const trail: number[] = [];
    let expiredAt = -1;
    for (let i = 0; i < data.routers.length; i += 1) {
      if (ctx.cancelled) return;
      ttl -= 1;
      trail.push(ttl);
      if (ttl === 0) {
        expiredAt = i;
        break;
      }
    }
    probes += 1;

    if (expiredAt >= 0) {
      const router = data.routers[expiredAt];
      if (router === undefined) throw new Error(`ttl-expired-reports: ${expiredAt} 번째 라우터가 없다`);
      expiredCount += 1;
      await ctx.emit({
        type: 'probe',
        payload: {
          ttl: ttl0,
          port,
          trail,
          fate: 'expired',
          at: expiredAt,
          left: 0,
          from: router.addr,
          icmpType: data.timeExceeded.type,
          icmpCode: data.timeExceeded.code,
        },
      });
    } else {
      // 목적지는 넘기지 않으므로 TTL 을 줄이지 않는다.
      if (ttl <= 0) throw new Error(`ttl-expired-reports: TTL ${ttl0} 탐침이 목적지 앞에서 셈할 수 없는 TTL ${ttl}`);
      await ctx.emit({
        type: 'probe',
        payload: {
          ttl: ttl0,
          port,
          trail,
          fate: 'arrived',
          at: data.routers.length,
          left: ttl,
          from: data.destination,
          icmpType: data.portUnreachable.type,
          icmpCode: data.portUnreachable.code,
        },
      });
      reached = true;
    }
    if (!(await pause())) return;
    if (reached) break;
  }

  if (!reached) throw new Error(`ttl-expired-reports: TTL ${maxTtl} 까지 목적지에 닿지 않았다`);

  await ctx.emit({ type: 'done', payload: { probes, routers: expiredCount } });
}
